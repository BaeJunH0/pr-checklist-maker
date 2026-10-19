import { useEffect, useMemo, useState } from 'react';
import { ApiError, saveTemplate } from '../lib/api';
import {
  LIMITS,
  describePath,
  newConditionId,
  validateTemplate,
  type OptionSection,
  type Section,
  type Template,
  type ValidationError,
} from '../lib/template';

interface Props {
  template: Template;
  version: string | null;
  editable: boolean;
  onSaved: (template: Template, version: string) => void;
  onReload: () => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'conflict'; message: string }
  | { kind: 'error'; message: string };

const clone = (t: Template): Template => structuredClone(t);

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

interface SectionEditorProps<S extends Section> {
  section: S;
  path: string;
  kindLabel: string;
  withDescription: boolean;
  errorPaths: Set<string>;
  disabled: boolean;
  note?: string;
  onChange: (section: S) => void;
  controls?: React.ReactNode;
}

function SectionEditor<S extends Section>({
  section,
  path,
  kindLabel,
  withDescription,
  errorPaths,
  disabled,
  note,
  onChange,
  controls,
}: SectionEditorProps<S>) {
  const invalid = (p: string) => errorPaths.has(p) || undefined;
  const setItems = (items: string[]) => onChange({ ...section, items });

  return (
    <div className="section-card" data-invalid={[...errorPaths].some((p) => p.startsWith(path)) || undefined}>
      <div className="section-head">
        <span className="badge">{kindLabel}</span>
        {note && <span className="section-note">{note}</span>}
        {controls && <div className="section-controls">{controls}</div>}
      </div>

      <div className="field-row">
        <label className="field">
          <span className="field-label">제목</span>
          <input
            value={section.title}
            maxLength={LIMITS.title}
            disabled={disabled}
            aria-invalid={invalid(`${path}.title`)}
            onChange={(e) => onChange({ ...section, title: e.target.value })}
          />
        </label>
        {withDescription && (
          <label className="field field-wide">
            <span className="field-label">설명 (툴팁)</span>
            <input
              value={(section as unknown as OptionSection).description}
              maxLength={LIMITS.description}
              disabled={disabled}
              aria-invalid={invalid(`${path}.description`)}
              onChange={(e) => onChange({ ...section, description: e.target.value })}
            />
          </label>
        )}
      </div>

      <ol className="item-list">
        {section.items.map((item, i) => (
          <li key={i} className="item-row">
            <span className="item-index">{i + 1}</span>
            <input
              value={item}
              maxLength={LIMITS.item}
              disabled={disabled}
              placeholder="체크 항목 문구"
              aria-label={`${section.title} ${i + 1}번째 항목`}
              aria-invalid={invalid(`${path}.items[${i}]`)}
              onChange={(e) => setItems(section.items.map((v, j) => (j === i ? e.target.value : v)))}
            />
            <div className="icon-buttons">
              <button
                type="button"
                className="icon-btn"
                title="위로"
                aria-label="위로"
                disabled={disabled || i === 0}
                onClick={() => setItems(move(section.items, i, i - 1))}
              >
                ↑
              </button>
              <button
                type="button"
                className="icon-btn"
                title="아래로"
                aria-label="아래로"
                disabled={disabled || i === section.items.length - 1}
                onClick={() => setItems(move(section.items, i, i + 1))}
              >
                ↓
              </button>
              <button
                type="button"
                className="icon-btn danger"
                title="항목 삭제"
                aria-label="항목 삭제"
                disabled={disabled}
                onClick={() => setItems(section.items.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ol>
      {errorPaths.has(`${path}.items`) && <p className="field-error">항목을 1개 이상 입력하세요.</p>}
      <button
        type="button"
        className="btn btn-small"
        disabled={disabled || section.items.length >= LIMITS.itemsPerSection}
        onClick={() => setItems([...section.items, ''])}
      >
        + 항목 추가
      </button>
    </div>
  );
}

export default function Editor({ template, version, editable, onSaved, onReload, onDirtyChange }: Props) {
  const [draft, setDraft] = useState<Template>(() => clone(template));
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  // 서버의 템플릿이 바뀌면(저장·되돌리기·다시 불러오기) 편집본을 새로 시작한다
  useEffect(() => {
    setDraft(clone(template));
    setErrors([]);
  }, [template]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(template), [draft, template]);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const errorPaths = useMemo(() => new Set(errors.map((e) => e.path)), [errors]);
  const disabled = !editable || status.kind === 'saving';

  const edit = (next: Template) => {
    setDraft(next);
    if (status.kind === 'saved') setStatus({ kind: 'idle' });
  };

  const setCondition = (index: number, section: OptionSection) =>
    edit({ ...draft, conditions: draft.conditions.map((c, i) => (i === index ? section : c)) });

  const addCondition = () => {
    edit({
      ...draft,
      conditions: [...draft.conditions, { id: newConditionId(draft.conditions), title: '', description: '', items: [''] }],
    });
    // 새로 추가한 카드로 스크롤
    requestAnimationFrame(() => document.querySelector('.conditions-list > :last-child')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  const removeCondition = (index: number) => {
    const target = draft.conditions[index];
    if (!window.confirm(`조건부 작업 "${target.title || '(제목 없음)'}"을(를) 삭제할까요?\n저장하기 전까지는 반영되지 않습니다.`)) return;
    edit({ ...draft, conditions: draft.conditions.filter((_, i) => i !== index) });
  };

  const save = async () => {
    const result = validateTemplate(draft);
    if (!result.ok) {
      setErrors(result.errors);
      setStatus({ kind: 'error', message: `입력값을 확인하세요 (${result.errors.length}건).` });
      return;
    }
    setErrors([]);
    setStatus({ kind: 'saving' });
    try {
      const saved = await saveTemplate(result.template, version, message);
      setMessage('');
      setStatus({ kind: 'saved' });
      onSaved(result.template, saved.version);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setStatus({ kind: 'conflict', message: error.message });
      } else if (error instanceof ApiError && error.details) {
        setErrors(error.details);
        setStatus({ kind: 'error', message: error.message });
      } else {
        setStatus({ kind: 'error', message: error instanceof Error ? error.message : '저장하지 못했습니다.' });
      }
    }
  };

  const discard = () => {
    if (dirty && !window.confirm('편집 중인 변경 사항을 모두 버릴까요?')) return;
    setDraft(clone(template));
    setErrors([]);
    setStatus({ kind: 'idle' });
  };

  const reloadLatest = async () => {
    if (dirty && !window.confirm('최신 템플릿을 불러오면 편집 중인 변경 사항은 사라집니다. 계속할까요?')) return;
    await onReload();
    setStatus({ kind: 'idle' });
  };

  return (
    <main className="editor">
      <div className="notice notice-warn">
        <strong>모든 방문자가 같은 템플릿을 공유합니다.</strong> 저장하면 즉시 모두에게 반영되고 수정 이력에 남습니다.
        서버 주소·계정·고객 정보 같은 사내 민감정보는 입력하지 마세요.
      </div>
      {!editable && (
        <div className="notice notice-error">
          템플릿 저장소에 연결되지 않아 편집할 수 없습니다. 내장 기본 템플릿을 표시합니다.
        </div>
      )}

      <section className="editor-group">
        <h2>공통</h2>
        <p className="group-desc">모든 PR에 항상 포함됩니다.</p>
        <SectionEditor
          section={draft.common}
          path="common"
          kindLabel="공통"
          withDescription={false}
          errorPaths={errorPaths}
          disabled={disabled}
          onChange={(common) => edit({ ...draft, common })}
        />
      </section>

      <section className="editor-group">
        <h2>PR 유형</h2>
        <p className="group-desc">선택한 유형 하나의 섹션이 포함됩니다. 유형 자체의 추가·삭제는 지원하지 않습니다.</p>
        {draft.types.map((t, i) => (
          <SectionEditor
            key={t.id}
            section={t}
            path={`types[${i}]`}
            kindLabel={`유형 · ${t.id}`}
            withDescription
            note={t.disablesConditions ? '조건부 작업 선택 불가' : undefined}
            errorPaths={errorPaths}
            disabled={disabled}
            onChange={(section) => edit({ ...draft, types: draft.types.map((x, j) => (j === i ? section : x)) })}
          />
        ))}
      </section>

      <section className="editor-group">
        <h2>조건부 작업</h2>
        <p className="group-desc">선택한 작업만 포함되며, 아래 순서대로 출력됩니다.</p>
        <div className="conditions-list">
          {draft.conditions.map((c, i) => (
            <SectionEditor
              key={c.id}
              section={c}
              path={`conditions[${i}]`}
              kindLabel={`조건부 ${i + 1}`}
              withDescription
              errorPaths={errorPaths}
              disabled={disabled}
              onChange={(section) => setCondition(i, section)}
              controls={
                <>
                  <button
                    type="button"
                    className="icon-btn"
                    title="순서 위로"
                    aria-label="순서 위로"
                    disabled={disabled || i === 0}
                    onClick={() => edit({ ...draft, conditions: move(draft.conditions, i, i - 1) })}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="순서 아래로"
                    aria-label="순서 아래로"
                    disabled={disabled || i === draft.conditions.length - 1}
                    onClick={() => edit({ ...draft, conditions: move(draft.conditions, i, i + 1) })}
                  >
                    ↓
                  </button>
                  <button type="button" className="btn btn-small btn-danger" disabled={disabled} onClick={() => removeCondition(i)}>
                    삭제
                  </button>
                </>
              }
            />
          ))}
        </div>
        <button
          type="button"
          className="btn btn-dashed btn-block"
          disabled={disabled || draft.conditions.length >= LIMITS.conditions}
          onClick={addCondition}
        >
          + 조건부 작업 추가
        </button>
      </section>

      <div className="save-bar">
        {errors.length > 0 && (
          <ul className="error-list">
            {errors.slice(0, 5).map((e, i) => (
              <li key={i}>
                <strong>{describePath(draft, e.path)}</strong> — {e.message}
              </li>
            ))}
            {errors.length > 5 && <li>외 {errors.length - 5}건</li>}
          </ul>
        )}
        {status.kind === 'conflict' && (
          <div className="notice notice-error">
            {status.message}{' '}
            <button type="button" className="btn btn-small" onClick={reloadLatest}>
              최신 템플릿 불러오기
            </button>
          </div>
        )}
        {status.kind === 'error' && errors.length === 0 && <div className="notice notice-error">{status.message}</div>}

        <div className="save-row">
          <input
            className="message-input"
            value={message}
            maxLength={LIMITS.message}
            disabled={disabled}
            placeholder="변경 메모 (선택) 예: 외부 API 항목에 서킷브레이커 추가"
            aria-label="변경 메모"
            onChange={(e) => setMessage(e.target.value)}
          />
          <span className="save-state" aria-live="polite">
            {status.kind === 'saving' ? '저장 중…' : status.kind === 'saved' ? '✓ 저장됨' : dirty ? '변경 사항 있음' : ''}
          </span>
          <button type="button" className="btn" disabled={disabled || !dirty} onClick={discard}>
            변경 취소
          </button>
          <button type="button" className="btn btn-primary" disabled={disabled || !dirty} onClick={save}>
            저장
          </button>
        </div>
      </div>
    </main>
  );
}
