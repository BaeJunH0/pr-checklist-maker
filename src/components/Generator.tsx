import { useEffect, useMemo, useRef, useState } from 'react';
import { buildSections, countItems, generateMarkdown, normalizeSelection, type Selection } from '../lib/generate';
import { renderMarkdown } from '../lib/renderMarkdown';
import type { Template } from '../lib/template';

type Tab = 'raw' | 'preview';

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!ok) throw new Error('copy failed');
}

function downloadMarkdown(text: string): void {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pr-checklist.md';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

interface Props {
  template: Template;
  loading: boolean;
  selection: Selection;
  onSelectionChange: (selection: Selection) => void;
}

export default function Generator({ template, loading, selection, onSelectionChange }: Props) {
  const [tab, setTab] = useState<Tab>('raw');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const copyTimer = useRef<number>();

  const normalized = useMemo(() => normalizeSelection(template, selection), [template, selection]);
  const markdown = useMemo(() => (loading ? '' : generateMarkdown(template, normalized)), [template, normalized, loading]);
  const itemCount = useMemo(() => countItems(buildSections(template, normalized)), [template, normalized]);
  const previewHtml = useMemo(() => renderMarkdown(markdown), [markdown]);
  const hasResult = markdown !== '';
  const conditionsDisabled = template.types.find((t) => t.id === normalized.type)?.disablesConditions === true;

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const update = (next: Selection) => onSelectionChange(normalizeSelection(template, next));

  const toggleCondition = (id: string) =>
    update({
      ...normalized,
      conditions: normalized.conditions.includes(id)
        ? normalized.conditions.filter((c) => c !== id)
        : [...normalized.conditions, id],
    });

  const reset = () => {
    onSelectionChange({ type: null, conditions: [] });
    setCopyState('idle');
  };

  const handleCopy = async () => {
    try {
      await copyText(markdown);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopyState('idle'), 2000);
  };

  return (
    <main className="layout">
      <section className="panel settings" aria-label="설정">
        {loading ? (
          <p className="loading">템플릿을 불러오는 중…</p>
        ) : (
          <>
            <fieldset>
              <legend>
                <span className="step">1</span> PR 유형 <small>택1</small>
              </legend>
              <div className="options">
                {template.types.map((t) => (
                  <label key={t.id} className="option" title={t.description}>
                    <input
                      type="radio"
                      name="pr-type"
                      value={t.id}
                      checked={normalized.type === t.id}
                      onChange={() => update({ ...normalized, type: t.id })}
                    />
                    <span className="option-text">
                      <span className="option-label">{t.title}</span>
                      {t.description && <span className="option-desc">{t.description}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset disabled={conditionsDisabled}>
              <legend>
                <span className="step">2</span> 조건부 작업 <small>복수 선택</small>
              </legend>
              {conditionsDisabled && <p className="hint">이 유형은 조건부 작업을 선택할 수 없습니다.</p>}
              {template.conditions.length === 0 && <p className="hint">등록된 조건부 작업이 없습니다.</p>}
              <div className="options">
                {template.conditions.map((c) => (
                  <label key={c.id} className="option" title={c.description}>
                    <input
                      type="checkbox"
                      value={c.id}
                      checked={normalized.conditions.includes(c.id)}
                      onChange={() => toggleCondition(c.id)}
                    />
                    <span className="option-text">
                      <span className="option-label">{c.title}</span>
                      {c.description && <span className="option-desc">{c.description}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        )}

        <button type="button" className="btn btn-ghost btn-block" onClick={reset}>
          ↺ 초기화
        </button>
      </section>

      <section className="panel result" aria-label="결과">
        <div className="tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'raw'}
            className={tab === 'raw' ? 'tab active' : 'tab'}
            onClick={() => setTab('raw')}
          >
            원문
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'preview'}
            className={tab === 'preview' ? 'tab active' : 'tab'}
            onClick={() => setTab('preview')}
          >
            미리보기
          </button>
        </div>

        <div className="output" role="tabpanel">
          {!hasResult ? (
            <p className="empty">{loading ? '템플릿을 불러오는 중…' : 'PR 유형을 선택하세요'}</p>
          ) : tab === 'raw' ? (
            <pre className="raw">{markdown}</pre>
          ) : (
            <div className="preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          )}
        </div>

        <div className="result-footer">
          <span className="count">
            항목 수: <strong>{itemCount}</strong>개
          </span>
          <div className="actions">
            <button type="button" className="btn btn-primary" disabled={!hasResult} onClick={handleCopy}>
              {copyState === 'copied' ? '✓ 복사됨' : copyState === 'error' ? '복사 실패' : '📋 복사'}
            </button>
            <button type="button" className="btn" disabled={!hasResult} onClick={() => downloadMarkdown(markdown)}>
              ⬇ .md 다운로드
            </button>
          </div>
        </div>
        <p className="sr-only" aria-live="polite">
          {copyState === 'copied' ? '클립보드에 복사되었습니다' : ''}
        </p>
      </section>
    </main>
  );
}
