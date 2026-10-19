import type { Section, Template } from './template';

export interface Selection {
  type: string | null;
  conditions: string[];
}

/**
 * 선택값을 템플릿 기준으로 정규화한다.
 * - 템플릿에 없는 유형·조건은 버린다 (삭제된 조건부 작업, 잘못된 URL)
 * - 조건부는 선택 순서와 무관하게 템플릿에 정의된 순서로 정렬, 중복 제거
 * - disablesConditions 유형(Docs)이면 조건부를 비운다 (F-08)
 */
export function normalizeSelection(template: Template, selection: Selection): Selection {
  const type = template.types.find((t) => t.id === selection.type) ?? null;
  if (type?.disablesConditions) return { type: type.id, conditions: [] };
  const picked = new Set(selection.conditions);
  return {
    type: type?.id ?? null,
    conditions: template.conditions.map((c) => c.id).filter((id) => picked.has(id)),
  };
}

/** 공통 → 유형별 → 조건부(템플릿 순서) 섹션 목록. 유형 미선택이면 빈 배열. */
export function buildSections(template: Template, selection: Selection): Section[] {
  const { type, conditions } = normalizeSelection(template, selection);
  const typeSection = template.types.find((t) => t.id === type);
  if (!typeSection) return [];
  const picked = new Set(conditions);
  return [template.common, typeSection, ...template.conditions.filter((c) => picked.has(c.id))];
}

export function countItems(sections: Section[]): number {
  return sections.reduce((sum, s) => sum + s.items.length, 0);
}

/** GitHub PR 본문에 붙여넣을 Markdown. 유형 미선택이면 빈 문자열. */
export function generateMarkdown(template: Template, selection: Selection): string {
  const sections = buildSections(template, selection);
  if (sections.length === 0) return '';

  const [, typeSection, ...conditionSections] = sections;
  const condLabel = conditionSections.length > 0 ? conditionSections.map((s) => s.title).join(', ') : '없음';

  const lines = ['## ✅ PR 체크리스트', `> 유형: **${typeSection.title}** · 조건부: ${condLabel}`];
  for (const section of sections) {
    lines.push('', `### ${section.title}`, ...section.items.map((item) => `- [ ] ${item}`));
  }
  return lines.join('\n') + '\n';
}

/** 템플릿 전체를 한눈에 보는 Markdown (이력 미리보기용) */
export function templateToMarkdown(template: Template): string {
  const block = (title: string, items: string[]) => ['', `### ${title}`, ...items.map((i) => `- [ ] ${i}`)];
  return [
    '## 공통',
    ...block(template.common.title, template.common.items),
    '',
    '## PR 유형',
    ...template.types.flatMap((t) => block(t.title, t.items)),
    '',
    `## 조건부 작업 (${template.conditions.length}개)`,
    ...template.conditions.flatMap((c) => block(c.title, c.items)),
  ].join('\n');
}
