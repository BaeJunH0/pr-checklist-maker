import { LIMITS, validateTemplate } from '../src/lib/template.js';
import { GitHubStore } from './githubStore.js';
import { LocalFileStore } from './localStore.js';
import { ConflictError, NotConfiguredError, NotFoundError, type TemplateStore } from './store.js';

const HISTORY_LIMIT = 20;
const VERSION_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

let cachedStore: TemplateStore | null = null;

/** GITHUB_TOKEN 이 있으면 GitHub, Vercel 인데 없으면 미설정 오류, 로컬이면 파일 저장소 */
export function getStore(): TemplateStore {
  if (cachedStore) return cachedStore;
  const env = process.env;
  if (env.GITHUB_TOKEN) {
    cachedStore = new GitHubStore({
      token: env.GITHUB_TOKEN,
      repo: env.GITHUB_REPO ?? 'BaeJunH0/pr-checklist-maker',
      branch: env.TEMPLATE_BRANCH ?? 'template-data',
      baseBranch: env.TEMPLATE_BASE_BRANCH ?? 'main',
      path: env.TEMPLATE_PATH ?? 'templates.json',
    });
  } else if (env.VERCEL) {
    throw new NotConfiguredError();
  } else {
    cachedStore = new LocalFileStore('.local-data/templates.json');
  }
  return cachedStore;
}

/** 테스트에서 저장소를 바꿔 끼우기 위한 훅 */
export function setStoreForTesting(store: TemplateStore | null): void {
  cachedStore = store;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > LIMITS.bodyBytes) throw new HttpError(413, '요청이 너무 큽니다.');
  try {
    const body = JSON.parse(text);
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch {
    throw new HttpError(400, '요청 형식이 올바르지 않습니다.');
  }
}

function versionParam(value: unknown, field: string, nullable: boolean): string | null {
  if (nullable && (value === null || value === undefined)) return null;
  if (typeof value !== 'string' || !VERSION_PATTERN.test(value)) throw new HttpError(400, `${field} 형식이 올바르지 않습니다.`);
  return value;
}

function commitMessage(raw: unknown): string {
  const text = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, LIMITS.message) : '';
  return `template: ${text || '템플릿 수정'}`;
}

async function withErrors(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof HttpError) return json(error.status, { error: error.message, details: error.details });
    if (error instanceof ConflictError) return json(409, { error: error.message });
    if (error instanceof NotFoundError) return json(404, { error: error.message });
    if (error instanceof NotConfiguredError) return json(503, { error: error.message });
    console.error(error);
    return json(502, { error: '템플릿 저장소와 통신하지 못했습니다. 잠시 후 다시 시도하세요.' });
  }
}

/** GET: 최신 템플릿 · PUT: 저장 (F-09, F-10, F-12) */
export function templatesHandler(request: Request): Promise<Response> {
  return withErrors(async () => {
    const store = getStore();
    if (request.method === 'GET') return json(200, await store.read());
    if (request.method === 'PUT') {
      const body = await readJson(request);
      const result = validateTemplate(body.template);
      if (!result.ok) throw new HttpError(400, '템플릿 내용이 올바르지 않습니다.', result.errors);
      const baseVersion = versionParam(body.baseVersion, 'baseVersion', true);
      return json(200, await store.write(result.template, baseVersion, commitMessage(body.message)));
    }
    throw new HttpError(405, '지원하지 않는 메서드입니다.');
  });
}

/** GET: 이력 / 특정 버전 · POST: 되돌리기 (F-13) */
export function historyHandler(request: Request): Promise<Response> {
  return withErrors(async () => {
    const store = getStore();
    if (request.method === 'GET') {
      const raw = new URL(request.url).searchParams.get('version');
      if (raw !== null) return json(200, { template: await store.readAt(versionParam(raw, 'version', false)!) });
      return json(200, { entries: await store.history(HISTORY_LIMIT) });
    }
    if (request.method === 'POST') {
      const body = await readJson(request);
      const version = versionParam(body.version, 'version', false)!;
      const baseVersion = versionParam(body.baseVersion, 'baseVersion', true);
      const template = await store.readAt(version);
      const message = `template: ${version.slice(0, 7)} 버전으로 되돌리기`;
      return json(200, { ...(await store.write(template, baseVersion, message)), template });
    }
    throw new HttpError(405, '지원하지 않는 메서드입니다.');
  });
}

/** 로컬 dev 서버(Vite)용 라우터. Vercel 에서는 api/*.ts 가 같은 핸들러를 쓴다. */
export function routeApi(request: Request): Promise<Response> | null {
  const { pathname } = new URL(request.url);
  if (pathname === '/api/templates') return templatesHandler(request);
  if (pathname === '/api/history') return historyHandler(request);
  return null;
}
