import { useEffect, useMemo, useRef, useState } from 'react';
import { CONDITIONS, PR_TYPES, type Condition, type PrType } from './data/checklists';
import { buildSections, countItems, generateMarkdown, normalizeSelection, type Selection } from './lib/generate';
import { renderMarkdown } from './lib/renderMarkdown';
import { parseSelection, serializeSelection } from './lib/urlState';

type Tab = 'raw' | 'preview';

const EMPTY: Selection = { type: null, conditions: [] };

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

export default function App() {
  const [selection, setSelection] = useState<Selection>(() => parseSelection(window.location.search));
  const [tab, setTab] = useState<Tab>('raw');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const copyTimer = useRef<number>();

  const markdown = useMemo(() => generateMarkdown(selection), [selection]);
  const itemCount = useMemo(() => countItems(buildSections(selection)), [selection]);
  const previewHtml = useMemo(() => renderMarkdown(markdown), [markdown]);
  const hasResult = markdown !== '';
  const conditionsDisabled = selection.type === 'docs';

  // F-07: 선택값 → URL 쿼리 동기화
  useEffect(() => {
    const query = serializeSelection(selection);
    if (query !== window.location.search) {
      window.history.replaceState(null, '', `${window.location.pathname}${query}${window.location.hash}`);
    }
  }, [selection]);

  useEffect(() => {
    const onPop = () => setSelection(parseSelection(window.location.search));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const selectType = (type: PrType) => setSelection((prev) => normalizeSelection({ ...prev, type }));

  const toggleCondition = (id: Condition) =>
    setSelection((prev) =>
      normalizeSelection({
        ...prev,
        conditions: prev.conditions.includes(id)
          ? prev.conditions.filter((c) => c !== id)
          : [...prev.conditions, id],
      }),
    );

  const reset = () => {
    setSelection(EMPTY);
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
    <div className="app">
      <header className="header">
        <h1>PR 체크리스트 생성기</h1>
        <p>PR 유형과 조건부 작업을 고르면, 이 PR에 꼭 필요한 체크리스트만 조립해 드립니다.</p>
      </header>

      <main className="layout">
        <section className="panel settings" aria-label="설정">
          <fieldset>
            <legend>
              <span className="step">1</span> PR 유형 <small>택1</small>
            </legend>
            <div className="options">
              {PR_TYPES.map((t) => (
                <label key={t.id} className="option" title={t.description}>
                  <input
                    type="radio"
                    name="pr-type"
                    value={t.id}
                    checked={selection.type === t.id}
                    onChange={() => selectType(t.id)}
                  />
                  <span className="option-text">
                    <span className="option-label">{t.label}</span>
                    <span className="option-desc">{t.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset disabled={conditionsDisabled}>
            <legend>
              <span className="step">2</span> 조건부 작업 <small>복수 선택</small>
            </legend>
            {conditionsDisabled && <p className="hint">Docs 유형은 조건부 작업을 선택할 수 없습니다.</p>}
            <div className="options">
              {CONDITIONS.map((c) => (
                <label key={c.id} className="option" title={c.description}>
                  <input
                    type="checkbox"
                    value={c.id}
                    checked={selection.conditions.includes(c.id)}
                    onChange={() => toggleCondition(c.id)}
                  />
                  <span className="option-text">
                    <span className="option-label">{c.label}</span>
                    <span className="option-desc">{c.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <button type="button" className="btn btn-ghost" onClick={reset}>
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
              <p className="empty">PR 유형을 선택하세요</p>
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
              <button
                type="button"
                className="btn"
                disabled={!hasResult}
                onClick={() => downloadMarkdown(markdown)}
              >
                ⬇ .md 다운로드
              </button>
            </div>
          </div>
          <p className="sr-only" aria-live="polite">
            {copyState === 'copied' ? '클립보드에 복사되었습니다' : ''}
          </p>
        </section>
      </main>
    </div>
  );
}
