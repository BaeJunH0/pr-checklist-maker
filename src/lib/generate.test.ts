import { describe, expect, it } from 'vitest';
import { buildSections, countItems, generateMarkdown, normalizeSelection } from './generate';
import { renderMarkdown } from './renderMarkdown';
import { parseSelection, serializeSelection } from './urlState';

const sectionIds = (...args: Parameters<typeof buildSections>) => buildSections(...args).map((s) => s.id);
const headers = (md: string) => md.split('\n').filter((l) => l.startsWith('### ')).map((l) => l.slice(4));

describe('체크리스트 생성 (F-03, 3.1 생성 규칙)', () => {
  it('AC-01: 유형 미선택이면 결과가 비어 있다', () => {
    expect(generateMarkdown({ type: null, conditions: [] })).toBe('');
    expect(generateMarkdown({ type: null, conditions: ['db-schema'] })).toBe('');
    expect(buildSections({ type: null, conditions: [] })).toEqual([]);
  });

  it('AC-02: Feature만 선택하면 공통 + Feature 섹션만 출력', () => {
    expect(sectionIds({ type: 'feature', conditions: [] })).toEqual(['common', 'feature']);
    const md = generateMarkdown({ type: 'feature', conditions: [] });
    expect(headers(md)).toEqual(['공통', 'Feature']);
    expect(md).toContain('조건부: 없음');
  });

  it('AC-03: Fix + DB 데이터 변경 → 공통 → Fix → DB 데이터 변경', () => {
    expect(headers(generateMarkdown({ type: 'fix', conditions: ['db-data'] }))).toEqual([
      '공통',
      'Fix',
      'DB 데이터(Row) 변경',
    ]);
  });

  it('AC-04: 조건부를 어떤 순서로 선택해도 고정 순서로 출력', () => {
    const md = generateMarkdown({ type: 'feature', conditions: ['external-api', 'db-data', 'db-schema'] });
    expect(headers(md)).toEqual(['공통', 'Feature', 'DB 스키마 변경', 'DB 데이터(Row) 변경', '외부 API 호출']);
    expect(md).toContain('조건부: DB 스키마 변경, DB 데이터(Row) 변경, 외부 API 호출');
  });

  it('AC-05: 선택하지 않은 조건부 섹션은 헤더와 항목 모두 제외', () => {
    const md = generateMarkdown({ type: 'feature', conditions: ['db-schema'] });
    expect(md).not.toContain('외부 API 호출');
    expect(md).not.toContain('타임아웃과 재시도 정책');
    expect(md).not.toContain('DB 데이터');
  });

  it('AC-06: 유형 변경 시 유형 섹션만 교체되고 조건부는 유지', () => {
    const before = sectionIds({ type: 'refactor', conditions: ['db-schema', 'external-api'] });
    const after = sectionIds({ type: 'fix', conditions: ['db-schema', 'external-api'] });
    expect(before).toEqual(['common', 'refactor', 'db-schema', 'external-api']);
    expect(after).toEqual(['common', 'fix', 'db-schema', 'external-api']);
  });

  it('AC-07 / F-08: Docs 선택 시 조건부 선택이 해제된다', () => {
    expect(normalizeSelection({ type: 'docs', conditions: ['db-schema', 'db-data'] })).toEqual({
      type: 'docs',
      conditions: [],
    });
    expect(sectionIds({ type: 'docs', conditions: ['external-api'] })).toEqual(['common', 'docs']);
  });

  it('3.1-4 / AC-11: 모든 항목이 GitHub 체크박스 문법으로 출력', () => {
    const selection = { type: 'feature' as const, conditions: ['db-schema', 'db-data', 'external-api'] as const };
    const md = generateMarkdown({ ...selection, conditions: [...selection.conditions] });
    const items = md.split('\n').filter((l) => l.startsWith('- '));
    expect(items.length).toBe(countItems(buildSections({ ...selection, conditions: [...selection.conditions] })));
    expect(items.length).toBe(4 + 4 + 4 + 4 + 5);
    for (const line of items) expect(line).toMatch(/^- \[ \] \S/);
  });

  it('3.2 출력 예시 형식과 일치', () => {
    const md = generateMarkdown({ type: 'feature', conditions: ['external-api'] });
    expect(md.startsWith('## ✅ PR 체크리스트\n> 유형: **Feature** · 조건부: 외부 API 호출\n\n### 공통\n')).toBe(true);
  });
});

describe('URL 상태 공유 (F-07)', () => {
  it('AC-10: ?type=fix&cond=db-schema,external-api 복원', () => {
    const selection = parseSelection('?type=fix&cond=db-schema,external-api');
    expect(selection).toEqual({ type: 'fix', conditions: ['db-schema', 'external-api'] });
    expect(headers(generateMarkdown(selection))).toEqual(['공통', 'Fix', 'DB 스키마 변경', '외부 API 호출']);
  });

  it('직렬화 → 파싱 왕복이 동일하고 순서가 고정된다', () => {
    const selection = { type: 'feature' as const, conditions: ['external-api' as const, 'db-schema' as const] };
    const query = serializeSelection(selection);
    expect(query).toBe('?type=feature&cond=db-schema,external-api');
    expect(parseSelection(query)).toEqual(normalizeSelection(selection));
  });

  it('잘못된 값은 무시하고, 선택이 없으면 빈 쿼리', () => {
    expect(parseSelection('?type=hack&cond=foo,db-data')).toEqual({ type: null, conditions: ['db-data'] });
    expect(parseSelection('?type=docs&cond=db-data')).toEqual({ type: 'docs', conditions: [] });
    expect(serializeSelection({ type: null, conditions: [] })).toBe('');
  });
});

describe('미리보기 렌더링 (F-04)', () => {
  it('체크박스 목록과 헤더를 렌더링하고 HTML을 이스케이프한다', () => {
    const html = renderMarkdown(generateMarkdown({ type: 'fix', conditions: [] }));
    expect(html).toContain('<h2>✅ PR 체크리스트</h2>');
    expect(html).toContain('<h3>Fix</h3>');
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(8);
    expect(renderMarkdown('- [ ] <script>x</script>')).not.toContain('<script>');
  });
});
