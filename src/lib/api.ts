import type { Template, ValidationError } from './template';

export interface HistoryEntry {
  version: string;
  date: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: ValidationError[],
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: { method: string; body: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init?.method ?? 'GET',
      cache: 'no-store',
      headers: init ? { 'Content-Type': 'application/json' } : undefined,
      body: init ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, '서버에 연결하지 못했습니다. 네트워크 상태를 확인하세요.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? `요청에 실패했습니다 (${res.status})`, body.details);
  return body as T;
}

export const fetchTemplate = () => request<{ template: unknown; version: string | null }>('/api/templates');

export const saveTemplate = (template: Template, baseVersion: string | null, message: string) =>
  request<{ version: string }>('/api/templates', { method: 'PUT', body: { template, baseVersion, message } });

export const fetchHistory = () => request<{ entries: HistoryEntry[] }>('/api/history');

export const fetchVersion = (version: string) =>
  request<{ template: unknown }>(`/api/history?version=${encodeURIComponent(version)}`);

export const restoreVersion = (version: string, baseVersion: string | null) =>
  request<{ version: string; template: unknown }>('/api/history', { method: 'POST', body: { version, baseVersion } });
