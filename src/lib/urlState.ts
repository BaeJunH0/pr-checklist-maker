import { CONDITIONS, PR_TYPES, type Condition, type PrType } from '../data/checklists';
import { normalizeSelection, type Selection } from './generate';

const TYPE_IDS = new Set<string>(PR_TYPES.map((t) => t.id));
const CONDITION_IDS = new Set<string>(CONDITIONS.map((c) => c.id));

/** `?type=fix&cond=db-schema,external-api` → Selection. 알 수 없는 값은 무시한다. */
export function parseSelection(search: string): Selection {
  const params = new URLSearchParams(search);
  const rawType = params.get('type')?.toLowerCase() ?? null;
  const type = rawType && TYPE_IDS.has(rawType) ? (rawType as PrType) : null;
  const conditions = (params.get('cond') ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is Condition => CONDITION_IDS.has(s));
  return normalizeSelection({ type, conditions });
}

/** Selection → 쿼리스트링 (`?` 포함, 선택이 없으면 빈 문자열) */
export function serializeSelection(selection: Selection): string {
  const { type, conditions } = normalizeSelection(selection);
  const parts: string[] = [];
  if (type) parts.push(`type=${type}`);
  if (conditions.length > 0) parts.push(`cond=${conditions.join(',')}`);
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}
