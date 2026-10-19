import { DEFAULT_TEMPLATE } from '../src/data/defaultTemplate.js';
import { validateTemplate, type Template } from '../src/lib/template.js';
import { ConflictError, NotFoundError, type HistoryEntry, type TemplateStore } from './store.js';

export interface GitHubStoreOptions {
  token: string;
  repo: string; // "owner/name"
  branch: string; // 템플릿 전용 브랜치 (Vercel 배포 제외)
  baseBranch: string; // 전용 브랜치가 없을 때 분기할 브랜치
  path: string; // 저장소 내 파일 경로
}

interface ContentResponse {
  sha: string;
  content: string;
  encoding: string;
}

interface CommitResponse {
  sha: string;
  commit: { message: string; committer: { date: string } | null };
}

/**
 * GitHub 저장소의 파일 하나를 저장소로 쓴다 (PRD 8.2).
 * - version = 파일 blob SHA. Contents API 가 SHA 불일치 시 409 를 돌려주므로 낙관적 잠금이 된다
 * - 이력 = 해당 파일을 건드린 커밋 목록
 */
export class GitHubStore implements TemplateStore {
  constructor(private readonly opts: GitHubStoreOptions) {}

  private async api(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`https://api.github.com/repos/${this.opts.repo}${path}`, {
      ...init,
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.opts.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'pr-checklist-maker',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  }

  private async fail(res: Response, action: string): Promise<never> {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub ${action} 실패: ${res.status} ${body.slice(0, 200)}`);
  }

  private parse(content: ContentResponse): Template {
    const json = JSON.parse(Buffer.from(content.content, 'base64').toString('utf8'));
    const result = validateTemplate(json);
    if (!result.ok) throw new Error(`저장된 템플릿이 손상되었습니다: ${JSON.stringify(result.errors.slice(0, 3))}`);
    return result.template;
  }

  private contentsPath(ref: string): string {
    return `/contents/${this.opts.path}?ref=${encodeURIComponent(ref)}`;
  }

  async read() {
    const res = await this.api(this.contentsPath(this.opts.branch));
    if (res.status === 404) return { template: DEFAULT_TEMPLATE, version: null };
    if (!res.ok) return this.fail(res, '템플릿 조회');
    const content = (await res.json()) as ContentResponse;
    return { template: this.parse(content), version: content.sha };
  }

  async readAt(version: string): Promise<Template> {
    const res = await this.api(this.contentsPath(version));
    if (res.status === 404 || res.status === 422) throw new NotFoundError('해당 버전을 찾을 수 없습니다.');
    if (!res.ok) return this.fail(res, '버전 조회');
    return this.parse((await res.json()) as ContentResponse);
  }

  async write(template: Template, baseVersion: string | null, message: string) {
    const put = () =>
      this.api(`/contents/${this.opts.path}`, {
        method: 'PUT',
        body: JSON.stringify({
          message,
          content: Buffer.from(JSON.stringify(template, null, 2) + '\n', 'utf8').toString('base64'),
          branch: this.opts.branch,
          ...(baseVersion ? { sha: baseVersion } : {}),
        }),
      });

    let res = await put();
    if (res.status === 404) {
      // 전용 브랜치가 아직 없다 → 기본 브랜치에서 분기한 뒤 재시도
      await this.createBranch();
      res = await put();
    }
    if (res.status === 409) throw new ConflictError();
    if (res.status === 422) {
      // 파일이 이미 있는데 sha 를 보내지 않았거나, 보낸 sha 의 파일이 없는 경우 → 모두 버전 불일치
      const body = await res.text();
      if (/sha/i.test(body)) throw new ConflictError();
      throw new Error(`GitHub 템플릿 저장 실패: 422 ${body.slice(0, 200)}`);
    }
    if (!res.ok) return this.fail(res, '템플릿 저장');
    const data = (await res.json()) as { content: { sha: string } };
    return { version: data.content.sha };
  }

  private async createBranch(): Promise<void> {
    const base = await this.api(`/git/ref/heads/${this.opts.baseBranch}`);
    if (!base.ok) return this.fail(base, '기본 브랜치 조회');
    const { object } = (await base.json()) as { object: { sha: string } };
    const res = await this.api('/git/refs', {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${this.opts.branch}`, sha: object.sha }),
    });
    // 422 = 동시에 다른 요청이 이미 만든 경우
    if (!res.ok && res.status !== 422) return this.fail(res, '템플릿 브랜치 생성');
  }

  async history(limit: number): Promise<HistoryEntry[]> {
    const query = `sha=${encodeURIComponent(this.opts.branch)}&path=${encodeURIComponent(this.opts.path)}&per_page=${limit}`;
    const res = await this.api(`/commits?${query}`);
    if (res.status === 404 || res.status === 409) return [];
    if (!res.ok) return this.fail(res, '이력 조회');
    const commits = (await res.json()) as CommitResponse[];
    return commits.map((c) => ({
      version: c.sha,
      date: c.commit.committer?.date ?? '',
      message: c.commit.message.split('\n')[0],
    }));
  }
}
