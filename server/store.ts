import type { Template } from '../src/lib/template.js';

export interface HistoryEntry {
  version: string; // 이 시점 템플릿을 다시 불러올 때 쓰는 ID (GitHub: 커밋 SHA)
  date: string; // ISO 8601
  message: string;
}

export interface TemplateStore {
  /** 최신 템플릿. 아직 저장된 적 없으면 version 이 null 이다 */
  read(): Promise<{ template: Template; version: string | null }>;
  /** baseVersion 이 현재 버전과 다르면 ConflictError */
  write(template: Template, baseVersion: string | null, message: string): Promise<{ version: string }>;
  history(limit: number): Promise<HistoryEntry[]>;
  readAt(version: string): Promise<Template>;
}

export class ConflictError extends Error {
  constructor() {
    super('다른 사용자가 먼저 템플릿을 저장했습니다. 최신 템플릿을 불러온 뒤 다시 수정하세요.');
  }
}

export class NotFoundError extends Error {}

export class NotConfiguredError extends Error {
  constructor() {
    super('템플릿 저장소가 설정되지 않았습니다 (GITHUB_TOKEN 환경변수 필요).');
  }
}
