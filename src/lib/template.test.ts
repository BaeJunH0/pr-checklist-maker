import { describe, expect, it } from 'vitest';
import { DEFAULT_TEMPLATE } from '../data/defaultTemplate';
import { describePath, newConditionId, validateTemplate, type Template } from './template';

const clone = (): Template => structuredClone(DEFAULT_TEMPLATE);
const paths = (input: unknown) => {
  const r = validateTemplate(input);
  return r.ok ? [] : r.errors.map((e) => e.path);
};

describe('템플릿 검증 (PRD 8.5, AC-16)', () => {
  it('기본 템플릿은 유효하다', () => {
    const r = validateTemplate(DEFAULT_TEMPLATE);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.template).toEqual(DEFAULT_TEMPLATE);
  });

  it('앞뒤 공백을 정리하고 알 수 없는 필드는 버린다', () => {
    const t = clone() as Template & { extra?: string };
    t.extra = 'x';
    t.common.items[0] = '  공백 항목  ';
    const r = validateTemplate(t);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.template.common.items[0]).toBe('공백 항목');
      expect('extra' in r.template).toBe(false);
    }
  });

  it('빈 항목, 긴 제목, 줄바꿈을 거부하고 위치를 알려준다', () => {
    const t = clone();
    t.conditions[1].items[2] = '   ';
    t.types[0].title = '가'.repeat(41);
    t.common.items[1] = '줄\n바꿈';
    expect(paths(t)).toEqual(['common.items[1]', 'types[0].title', 'conditions[1].items[2]']);
  });

  it('항목이 없는 섹션, 중복·잘못된 ID를 거부한다', () => {
    const t = clone();
    t.conditions[0].items = [];
    t.conditions[2].id = 'db-data';
    t.types[1].id = 'Bad ID';
    expect(paths(t)).toEqual(['types[1].id', 'conditions[0].items', 'conditions[2].id']);
  });

  it('개수 제한과 스키마 버전을 검사한다', () => {
    const t = clone();
    t.conditions = Array.from({ length: 21 }, (_, i) => ({ id: `c-${i}`, title: 'x', description: '', items: ['y'] }));
    expect(paths(t)).toContain('conditions');
    expect(paths({ ...clone(), schemaVersion: 2 })).toContain('schemaVersion');
    expect(paths(null)).toEqual(['']);
    expect(paths({ ...clone(), types: [] })).toContain('types');
  });

  it('disablesConditions 는 true 일 때만 보존된다', () => {
    const t = clone() as unknown as { types: Record<string, unknown>[] };
    t.types[0].disablesConditions = 'yes';
    const r = validateTemplate(t);
    expect(r.ok && 'disablesConditions' in r.template.types[0]).toBe(false);
    expect(r.ok && r.template.types[3].disablesConditions).toBe(true);
  });
});

describe('보조 함수', () => {
  it('새 조건 ID는 형식에 맞고 기존 ID와 겹치지 않는다', () => {
    const id = newConditionId(DEFAULT_TEMPLATE.conditions);
    expect(id).toMatch(/^cond-[a-z0-9]+$/);
    expect(DEFAULT_TEMPLATE.conditions.some((c) => c.id === id)).toBe(false);
  });

  it('오류 경로를 사람이 읽을 위치로 바꾼다', () => {
    expect(describePath(DEFAULT_TEMPLATE, 'conditions[1].items[2]')).toBe('조건부 작업 "DB 데이터(Row) 변경" · 3번째 항목');
    expect(describePath(DEFAULT_TEMPLATE, 'common.title')).toBe('공통 · 제목');
    expect(describePath(DEFAULT_TEMPLATE, 'types[0].description')).toBe('PR 유형 "Feature" · 설명');
  });
});
