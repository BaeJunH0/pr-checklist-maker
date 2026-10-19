import type { Selection } from './generate';

const ID = /^[a-z0-9-]{1,40}$/;

/**
 * `?type=fix&cond=db-schema,external-api` → Selection.
 * 템플릿을 불러오기 전에도 읽을 수 있도록 형식만 거른다. 존재 여부는 normalizeSelection 이 판단한다.
 */
export function parseSelection(search: string): Selection {
  const params = new URLSearchParams(search);
  const rawType = params.get('type')?.trim().toLowerCase() ?? '';
  const conditions = (params.get('cond') ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => ID.test(s));
  return { type: ID.test(rawType) ? rawType : null, conditions: [...new Set(conditions)] };
}

/** 정규화된 Selection → 쿼리스트링 (`?` 포함, 선택이 없으면 빈 문자열) */
export function serializeSelection({ type, conditions }: Selection): string {
  const parts: string[] = [];
  if (type) parts.push(`type=${type}`);
  if (conditions.length > 0) parts.push(`cond=${conditions.join(',')}`);
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}
