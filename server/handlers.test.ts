import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TEMPLATE } from '../src/data/defaultTemplate';
import type { Template } from '../src/lib/template';
import { GitHubStore } from './githubStore';
import { historyHandler, setStoreForTesting, templatesHandler } from './handlers';
import { ConflictError, NotFoundError, type HistoryEntry, type TemplateStore } from './store';

/** 메모리 저장소: GitHubStore 와 같은 계약(낙관적 잠금, 이력)을 따른다 */
class MemoryStore implements TemplateStore {
  snapshots: (HistoryEntry & { template: Template })[] = [];
  async read() {
    const last = this.snapshots.at(-1);
    return last ? { template: last.template, version: last.version } : { template: DEFAULT_TEMPLATE, version: null };
  }
  async write(template: Template, baseVersion: string | null, message: string) {
    if ((this.snapshots.at(-1)?.version ?? null) !== baseVersion) throw new ConflictError();
    const version = `v${this.snapshots.length + 1}`;
    this.snapshots.push({ version, date: new Date().toISOString(), message, template });
    return { version };
  }
  async history(limit: number) {
    return this.snapshots
      .slice(-limit)
      .reverse()
      .map(({ version, date, message }) => ({ version, date, message }));
  }
  async readAt(version: string) {
    const s = this.snapshots.find((x) => x.version === version);
    if (!s) throw new NotFoundError('없음');
    return s.template;
  }
}

const req = (method: string, path: string, body?: unknown) =>
  new Request(`http://localhost${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });

const edited = (title: string): Template => ({
  ...DEFAULT_TEMPLATE,
  conditions: [...DEFAULT_TEMPLATE.conditions, { id: 'cond-batch', title, description: '', items: ['재실행 절차 확인'] }],
});

function setup() {
  const store = new MemoryStore();
  setStoreForTesting(store);
  return store;
}

afterEach(() => {
  setStoreForTesting(null);
  vi.unstubAllGlobals();
});

describe('/api/templates', () => {
  it('저장 전에는 기본 템플릿과 version null 을 돌려준다 (F-09)', async () => {
    setup();
    const res = await templatesHandler(req('GET', '/api/templates'));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ template: DEFAULT_TEMPLATE, version: null });
  });

  it('저장하면 다음 조회에 반영되고 메모가 커밋 메시지가 된다 (AC-12, AC-13)', async () => {
    const store = setup();
    const put = await templatesHandler(req('PUT', '/api/templates', { template: edited('배치'), baseVersion: null, message: ' 배치 추가\n' }));
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ version: 'v1' });
    const got = await (await templatesHandler(req('GET', '/api/templates'))).json();
    expect(got.template.conditions.at(-1).title).toBe('배치');
    expect(store.snapshots[0].message).toBe('template: 배치 추가');
  });

  it('오래된 version 으로 저장하면 409, 먼저 저장한 내용은 보존 (AC-15)', async () => {
    const store = setup();
    await templatesHandler(req('PUT', '/api/templates', { template: edited('A'), baseVersion: null }));
    const second = await templatesHandler(req('PUT', '/api/templates', { template: edited('B'), baseVersion: null }));
    expect(second.status).toBe(409);
    expect((await second.json()).error).toContain('다른 사용자');
    expect(store.snapshots).toHaveLength(1);
    expect(store.snapshots[0].template.conditions.at(-1)!.title).toBe('A');
  });

  it('잘못된 템플릿은 400 과 오류 위치를 돌려준다 (AC-16)', async () => {
    const store = setup();
    const bad = edited('');
    const res = await templatesHandler(req('PUT', '/api/templates', { template: bad, baseVersion: null }));
    expect(res.status).toBe(400);
    expect((await res.json()).details[0].path).toBe('conditions[3].title');
    expect(store.snapshots).toHaveLength(0);
  });

  it('형식 오류·큰 본문·잘못된 version·메서드를 거부한다', async () => {
    setup();
    expect((await templatesHandler(new Request('http://localhost/api/templates', { method: 'PUT', body: '{' }))).status).toBe(400);
    const huge = { template: edited('x'), baseVersion: null, message: 'x'.repeat(70_000) };
    expect((await templatesHandler(req('PUT', '/api/templates', huge))).status).toBe(413);
    const badVersion = { template: DEFAULT_TEMPLATE, baseVersion: '../../etc' };
    expect((await templatesHandler(req('PUT', '/api/templates', badVersion))).status).toBe(400);
    expect((await templatesHandler(req('DELETE', '/api/templates'))).status).toBe(405);
  });
});

describe('/api/history', () => {
  it('이력 조회, 버전 조회, 되돌리기가 새 이력으로 남는다 (AC-17)', async () => {
    const store = setup();
    await templatesHandler(req('PUT', '/api/templates', { template: edited('A'), baseVersion: null, message: 'A' }));
    await templatesHandler(req('PUT', '/api/templates', { template: edited('B'), baseVersion: 'v1', message: 'B' }));

    const list = await (await historyHandler(req('GET', '/api/history'))).json();
    expect(list.entries.map((e: HistoryEntry) => e.message)).toEqual(['template: B', 'template: A']);

    const v1 = await (await historyHandler(req('GET', '/api/history?version=v1'))).json();
    expect(v1.template.conditions.at(-1).title).toBe('A');

    const restored = await historyHandler(req('POST', '/api/history', { version: 'v1', baseVersion: 'v2' }));
    expect(restored.status).toBe(200);
    expect((await restored.json()).version).toBe('v3');
    expect(store.snapshots.at(-1)!.template.conditions.at(-1)!.title).toBe('A');
    expect(store.snapshots.at(-1)!.message).toBe('template: v1 버전으로 되돌리기');
  });

  it('되돌리기도 낙관적 잠금을 따르고, 없는 버전은 404', async () => {
    setup();
    await templatesHandler(req('PUT', '/api/templates', { template: edited('A'), baseVersion: null }));
    await templatesHandler(req('PUT', '/api/templates', { template: edited('B'), baseVersion: 'v1' }));
    expect((await historyHandler(req('POST', '/api/history', { version: 'v1', baseVersion: 'v1' }))).status).toBe(409);
    expect((await historyHandler(req('GET', '/api/history?version=v9'))).status).toBe(404);
  });
});

describe('GitHubStore', () => {
  const store = () =>
    new GitHubStore({ token: 't', repo: 'o/r', branch: 'template-data', baseBranch: 'main', path: 'templates.json' });
  const jsonRes = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  it('파일이 없으면 기본 템플릿, 있으면 디코딩해 blob sha 를 version 으로 쓴다', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonRes(404, {})).mockResolvedValueOnce(
      jsonRes(200, {
        sha: 'abc',
        encoding: 'base64',
        content: Buffer.from(JSON.stringify(edited('깃'))).toString('base64'),
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await store().read()).toEqual({ template: DEFAULT_TEMPLATE, version: null });
    const read = await store().read();
    expect(read.version).toBe('abc');
    expect(read.template.conditions.at(-1)!.title).toBe('깃');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.github.com/repos/o/r/contents/templates.json?ref=template-data');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer t');
  });

  it('브랜치가 없으면 main 에서 분기 후 재시도하고, sha 불일치는 ConflictError', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRes(404, { message: 'Branch template-data not found' }))
      .mockResolvedValueOnce(jsonRes(200, { object: { sha: 'main-sha' } }))
      .mockResolvedValueOnce(jsonRes(201, {}))
      .mockResolvedValueOnce(jsonRes(201, { content: { sha: 'new-blob' } }))
      .mockResolvedValueOnce(jsonRes(409, { message: 'is at x but expected y' }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await store().write(DEFAULT_TEMPLATE, null, 'm')).toEqual({ version: 'new-blob' });
    const createRef = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(createRef).toEqual({ ref: 'refs/heads/template-data', sha: 'main-sha' });
    const put = JSON.parse(fetchMock.mock.calls[3][1].body);
    expect(put.branch).toBe('template-data');
    expect(put.sha).toBeUndefined();

    await expect(store().write(DEFAULT_TEMPLATE, 'old', 'm')).rejects.toBeInstanceOf(ConflictError);
  });
});
