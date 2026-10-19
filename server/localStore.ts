import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DEFAULT_TEMPLATE } from '../src/data/defaultTemplate.js';
import type { Template } from '../src/lib/template.js';
import { ConflictError, NotFoundError, type HistoryEntry, type TemplateStore } from './store.js';

interface Snapshot extends HistoryEntry {
  template: Template;
}

/**
 * 로컬 개발용 저장소 (GITHUB_TOKEN 이 없을 때). 모든 버전을 JSON 파일 하나에 쌓는다.
 * GitHubStore 와 같은 충돌·이력 동작을 흉내 낸다.
 */
export class LocalFileStore implements TemplateStore {
  constructor(private readonly file: string) {}

  private async load(): Promise<Snapshot[]> {
    try {
      return JSON.parse(await readFile(this.file, 'utf8')) as Snapshot[];
    } catch {
      return [];
    }
  }

  async read() {
    const latest = (await this.load()).at(-1);
    return latest ? { template: latest.template, version: latest.version } : { template: DEFAULT_TEMPLATE, version: null };
  }

  async readAt(version: string) {
    const found = (await this.load()).find((s) => s.version === version);
    if (!found) throw new NotFoundError('해당 버전을 찾을 수 없습니다.');
    return found.template;
  }

  async write(template: Template, baseVersion: string | null, message: string) {
    const snapshots = await this.load();
    if ((snapshots.at(-1)?.version ?? null) !== baseVersion) throw new ConflictError();
    const version = `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    snapshots.push({ version, date: new Date().toISOString(), message, template });
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(snapshots, null, 2));
    return { version };
  }

  async history(limit: number) {
    return (await this.load())
      .slice(-limit)
      .reverse()
      .map(({ version, date, message }) => ({ version, date, message }));
  }
}
