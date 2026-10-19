import {
  COMMON_SECTION,
  CONDITIONS,
  CONDITION_SECTIONS,
  TYPE_SECTIONS,
  type ChecklistSection,
  type Condition,
  type PrType,
} from '../data/checklists';

export interface Selection {
  type: PrType | null;
  conditions: Condition[];
}

/**
 * 선택값을 정규화한다.
 * - 조건부는 선택 순서와 무관하게 고정 순서(CONDITIONS)로 정렬, 중복 제거
 * - Docs 유형이면 조건부를 비운다 (F-08)
 */
export function normalizeSelection(selection: Selection): Selection {
  if (selection.type === 'docs') return { type: 'docs', conditions: [] };
  const picked = new Set(selection.conditions);
  return {
    type: selection.type,
    conditions: CONDITIONS.map((c) => c.id).filter((id) => picked.has(id)),
  };
}

/** 공통 → 유형별 → 조건부(고정 순서) 섹션 목록. 유형 미선택이면 빈 배열. */
export function buildSections(selection: Selection): ChecklistSection[] {
  const { type, conditions } = normalizeSelection(selection);
  if (!type) return [];
  return [COMMON_SECTION, TYPE_SECTIONS[type], ...conditions.map((c) => CONDITION_SECTIONS[c])];
}

export function countItems(sections: ChecklistSection[]): number {
  return sections.reduce((sum, s) => sum + s.items.length, 0);
}

/** GitHub PR 본문에 붙여넣을 Markdown. 유형 미선택이면 빈 문자열. */
export function generateMarkdown(selection: Selection): string {
  const normalized = normalizeSelection(selection);
  const sections = buildSections(normalized);
  if (sections.length === 0) return '';

  const condLabel =
    normalized.conditions.length > 0
      ? normalized.conditions.map((c) => CONDITION_SECTIONS[c].title).join(', ')
      : '없음';

  const lines = [
    '## ✅ PR 체크리스트',
    `> 유형: **${TYPE_SECTIONS[normalized.type!].title}** · 조건부: ${condLabel}`,
  ];
  for (const section of sections) {
    lines.push('', `### ${section.title}`, ...section.items.map((item) => `- [ ] ${item}`));
  }
  return lines.join('\n') + '\n';
}
