import { useCallback, useEffect, useState } from 'react';
import Editor from './components/Editor';
import Generator from './components/Generator';
import History from './components/History';
import { DEFAULT_TEMPLATE } from './data/defaultTemplate';
import { fetchTemplate } from './lib/api';
import { normalizeSelection, type Selection } from './lib/generate';
import { validateTemplate, type Template } from './lib/template';
import { parseSelection, serializeSelection } from './lib/urlState';

type View = 'generate' | 'edit' | 'history';
type LoadState = 'loading' | 'ready' | 'offline';

const VIEWS: { id: View; label: string; hash: string }[] = [
  { id: 'generate', label: '체크리스트 생성', hash: '' },
  { id: 'edit', label: '템플릿 편집', hash: '#edit' },
  { id: 'history', label: '수정 이력', hash: '#history' },
];

const viewFromHash = (): View => VIEWS.find((v) => v.hash && v.hash === window.location.hash)?.id ?? 'generate';

export default function App() {
  const [template, setTemplate] = useState<Template>(DEFAULT_TEMPLATE);
  const [version, setVersion] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<View>(viewFromHash);
  const [selection, setSelection] = useState<Selection>(() => parseSelection(window.location.search));
  const [editorDirty, setEditorDirty] = useState(false);

  // F-09: 공유 템플릿 로드. 실패하면 내장 기본 템플릿으로 동작 (AC-18)
  const reload = useCallback(async () => {
    try {
      const data = await fetchTemplate();
      const result = validateTemplate(data.template);
      if (!result.ok) throw new Error('서버 템플릿 형식이 올바르지 않습니다.');
      setTemplate(result.template);
      setVersion(data.version);
      setLoadState('ready');
      setLoadError(null);
    } catch (error) {
      setLoadState((state) => (state === 'ready' ? 'ready' : 'offline'));
      setLoadError(error instanceof Error ? error.message : '템플릿을 불러오지 못했습니다.');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // F-07: 선택값 → URL 쿼리 동기화. 로드 전에는 템플릿에 없는 조건을 지우지 않도록 건너뛴다.
  useEffect(() => {
    if (loadState === 'loading') return;
    const query = serializeSelection(normalizeSelection(template, selection));
    if (query !== window.location.search) {
      window.history.replaceState(null, '', `${window.location.pathname}${query}${window.location.hash}`);
    }
  }, [selection, template, loadState]);

  useEffect(() => {
    const onPop = () => {
      setSelection(parseSelection(window.location.search));
      setView(viewFromHash());
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('hashchange', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('hashchange', onPop);
    };
  }, []);

  const changeView = (next: View) => {
    if (next === view) return;
    if (view === 'edit' && editorDirty && !window.confirm('저장하지 않은 변경 사항이 있습니다. 이동하면 사라집니다. 계속할까요?')) return;
    if (view === 'edit') setEditorDirty(false);
    const hash = VIEWS.find((v) => v.id === next)!.hash;
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
    setView(next);
  };

  const applySaved = useCallback((saved: Template, savedVersion: string) => {
    setTemplate(saved);
    setVersion(savedVersion);
    setLoadState('ready');
  }, []);

  const editable = loadState === 'ready';

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>PR 체크리스트 생성기</h1>
          <p>PR 유형과 조건부 작업을 고르면, 이 PR에 꼭 필요한 체크리스트만 조립해 드립니다.</p>
        </div>
        <nav className="nav" aria-label="화면 전환">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              className={view === v.id ? 'nav-btn active' : 'nav-btn'}
              aria-current={view === v.id ? 'page' : undefined}
              onClick={() => changeView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </nav>
      </header>

      {loadState === 'offline' && (
        <div className="notice notice-error">
          공유 템플릿을 불러오지 못해 내장 기본 템플릿으로 동작합니다. ({loadError}){' '}
          <button type="button" className="btn btn-small" onClick={() => void reload()}>
            다시 시도
          </button>
        </div>
      )}

      {view === 'generate' && (
        <Generator
          template={template}
          loading={loadState === 'loading'}
          selection={selection}
          onSelectionChange={setSelection}
        />
      )}
      {view === 'edit' &&
        (loadState === 'loading' ? (
          <p className="loading">템플릿을 불러오는 중…</p>
        ) : (
          <Editor
            template={template}
            version={version}
            editable={editable}
            onSaved={applySaved}
            onReload={reload}
            onDirtyChange={setEditorDirty}
          />
        ))}
      {view === 'history' && (
        <History version={version} editable={editable} onRestored={applySaved} onReload={reload} />
      )}
    </div>
  );
}
