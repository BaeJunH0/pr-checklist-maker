/**
 * 공유 템플릿 스키마와 검증 (클라이언트·서버 공통, PRD 8.5).
 * 서버리스 함수에서도 import 하므로 상대 경로 import 에는 `.js` 확장자를 붙인다.
 */

export interface Section {
  id: string;
  title: string; // 출력 헤더이자 선택지 이름 (예: "DB 스키마 변경")
  items: string[]; // 체크 항목 문구
}

export interface OptionSection extends Section {
  description: string; // 선택지 한 줄 설명 (툴팁)
}

export interface PrTypeSection extends OptionSection {
  /** true 면 이 유형을 고를 때 조건부 작업 선택을 비활성화한다 (F-08) */
  disablesConditions?: boolean;
}

export interface Template {
  schemaVersion: 1;
  common: Section;
  types: PrTypeSection[];
  /** 배열 순서 = 출력 순서 */
  conditions: OptionSection[];
}

export const LIMITS = {
  title: 40,
  description: 100,
  item: 200,
  itemsPerSection: 30,
  conditions: 20,
  types: 10,
  id: 40,
  bodyBytes: 64 * 1024,
  message: 100,
} as const;

export interface ValidationError {
  path: string; // 예: "conditions[2].items[0]"
  message: string;
}

export type ValidationResult = { ok: true; template: Template } | { ok: false; errors: ValidationError[] };

const ID_PATTERN = /^[a-z0-9-]+$/;
// 줄바꿈·탭 등 제어문자는 Markdown 구조를 깨뜨리므로 허용하지 않는다
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 알 수 없는 입력을 검증하고, 문자열 앞뒤 공백을 정리한 정규화된 템플릿을 돌려준다.
 * 알 수 없는 필드는 버린다.
 */
export function validateTemplate(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const err = (path: string, message: string) => errors.push({ path, message });

  const text = (value: unknown, path: string, label: string, min: number, max: number): string => {
    if (typeof value !== 'string') {
      err(path, `${label}이(가) 문자열이 아닙니다`);
      return '';
    }
    const trimmed = value.trim();
    if (trimmed.length < min) err(path, `${label}을(를) 입력하세요`);
    else if (trimmed.length > max) err(path, `${label}은(는) ${max}자 이하여야 합니다 (현재 ${trimmed.length}자)`);
    if (CONTROL_CHARS.test(trimmed)) err(path, `${label}에 줄바꿈이나 제어문자를 넣을 수 없습니다`);
    return trimmed;
  };

  const section = (value: unknown, path: string, withDescription: boolean): OptionSection => {
    if (!isRecord(value)) {
      err(path, '섹션 형식이 올바르지 않습니다');
      return { id: '', title: '', description: '', items: [] };
    }
    const id = typeof value.id === 'string' ? value.id : '';
    if (!id || id.length > LIMITS.id || !ID_PATTERN.test(id)) err(`${path}.id`, 'ID 형식이 올바르지 않습니다');
    const title = text(value.title, `${path}.title`, '제목', 1, LIMITS.title);
    const description = withDescription ? text(value.description ?? '', `${path}.description`, '설명', 0, LIMITS.description) : '';
    let items: string[] = [];
    if (!Array.isArray(value.items)) {
      err(`${path}.items`, '항목 목록이 없습니다');
    } else {
      if (value.items.length === 0) err(`${path}.items`, '항목을 1개 이상 입력하세요');
      if (value.items.length > LIMITS.itemsPerSection)
        err(`${path}.items`, `항목은 ${LIMITS.itemsPerSection}개 이하여야 합니다`);
      items = value.items.map((item, i) => text(item, `${path}.items[${i}]`, '항목', 1, LIMITS.item));
    }
    return { id, title, description, items };
  };

  const uniqueIds = (sections: { id: string }[], path: string) => {
    const seen = new Set<string>();
    sections.forEach((s, i) => {
      if (seen.has(s.id)) err(`${path}[${i}].id`, `ID "${s.id}"가 중복됩니다`);
      seen.add(s.id);
    });
  };

  if (!isRecord(input)) return { ok: false, errors: [{ path: '', message: '템플릿 형식이 올바르지 않습니다' }] };
  if (input.schemaVersion !== 1) err('schemaVersion', '지원하지 않는 템플릿 버전입니다');

  const common = section(input.common, 'common', false);

  let types: PrTypeSection[] = [];
  if (!Array.isArray(input.types) || input.types.length === 0 || input.types.length > LIMITS.types) {
    err('types', `PR 유형은 1~${LIMITS.types}개여야 합니다`);
  } else {
    types = input.types.map((t, i) => {
      const s = section(t, `types[${i}]`, true);
      return isRecord(t) && t.disablesConditions === true ? { ...s, disablesConditions: true } : s;
    });
    uniqueIds(types, 'types');
  }

  let conditions: OptionSection[] = [];
  if (!Array.isArray(input.conditions) || input.conditions.length > LIMITS.conditions) {
    err('conditions', `조건부 작업은 ${LIMITS.conditions}개 이하여야 합니다`);
  } else {
    conditions = input.conditions.map((c, i) => section(c, `conditions[${i}]`, true));
    uniqueIds(conditions, 'conditions');
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    template: { schemaVersion: 1, common: { id: common.id, title: common.title, items: common.items }, types, conditions },
  };
}

/** 새 조건부 작업 ID. 한글 제목에서 slug 를 만들 수 없으므로 무작위 ID 를 쓴다. */
export function newConditionId(existing: { id: string }[]): string {
  const taken = new Set(existing.map((c) => c.id));
  for (;;) {
    const id = `cond-${Math.random().toString(36).slice(2, 8)}`;
    if (taken.has(id) === false) return id;
  }
}

/** 검증 오류 경로("conditions[2].items[0]")를 사람이 읽을 위치로 바꾼다 */
export function describePath(template: Template, path: string): string {
  const m = path.match(/^(common|types|conditions)(?:\[(\d+)\])?(?:\.(\w+))?(?:\[(\d+)\])?/);
  if (!m) return path || '템플릿';
  const [, group, index, field, itemIndex] = m;
  const sectionName =
    group === 'common'
      ? '공통'
      : `${group === 'types' ? 'PR 유형' : '조건부 작업'} "${
          (group === 'types' ? template.types : template.conditions)[Number(index)]?.title || `#${Number(index) + 1}`
        }"`;
  if (field === 'items' && itemIndex !== undefined) return `${sectionName} · ${Number(itemIndex) + 1}번째 항목`;
  if (field === 'title') return `${sectionName} · 제목`;
  if (field === 'description') return `${sectionName} · 설명`;
  if (field === 'items') return `${sectionName} · 항목`;
  return sectionName;
}
