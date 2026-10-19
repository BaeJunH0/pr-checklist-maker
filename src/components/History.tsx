import { useCallback, useEffect, useState } from 'react';
import { ApiError, fetchHistory, fetchVersion, restoreVersion, type HistoryEntry } from '../lib/api';
import { templateToMarkdown } from '../lib/generate';
import { renderMarkdown } from '../lib/renderMarkdown';
import { validateTemplate, type Template } from '../lib/template';

interface Props {
  version: string | null;
  editable: boolean;
  onRestored: (template: Template, version: string) => void;
  onReload: () => Promise<void>;
}

const dateFormat = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });

function formatMessage(message: string): string {
  return message.replace(/^template:\s*/, '');
}

export default function History({ version, editable, onRestored, onReload }: Props) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ version: string; html: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setEntries((await fetchHistory()).entries);
    } catch (e) {
      setError(e instanceof Error ? e.message : '이력을 불러오지 못했습니다.');
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const showPreview = async (entry: HistoryEntry) => {
    if (preview?.version === entry.version) return setPreview(null);
    setBusy(entry.version);
    try {
      const result = validateTemplate((await fetchVersion(entry.version)).template);
      if (!result.ok) throw new Error('이 버전의 템플릿 형식이 올바르지 않습니다.');
      setPreview({ version: entry.version, html: renderMarkdown(templateToMarkdown(result.template)) });
    } catch (e) {
      setError(e instanceof Error ? e.message : '버전을 불러오지 못했습니다.');
    } finally {
      setBusy(null);
    }
  };

  const restore = async (entry: HistoryEntry) => {
    const label = `${dateFormat.format(new Date(entry.date))} · ${formatMessage(entry.message)}`;
    if (!window.confirm(`이 버전으로 되돌릴까요?\n\n${label}\n\n모든 방문자에게 즉시 반영되며, 되돌리기도 새 이력으로 남습니다.`)) return;
    setBusy(entry.version);
    setError(null);
    try {
      const restored = await restoreVersion(entry.version, version);
      const result = validateTemplate(restored.template);
      if (!result.ok) throw new Error('되돌린 템플릿 형식이 올바르지 않습니다.');
      onRestored(result.template, restored.version);
      setPreview(null);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError('그 사이 다른 사용자가 템플릿을 수정했습니다. 최신 상태를 불러왔으니 다시 확인하세요.');
        await onReload();
        await load();
      } else {
        setError(e instanceof Error ? e.message : '되돌리지 못했습니다.');
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="history">
      <div className="history-head">
        <div>
          <h2>수정 이력</h2>
          <p className="group-desc">최근 20건. 되돌리면 해당 버전 내용으로 새 버전이 저장됩니다.</p>
        </div>
        <button type="button" className="btn btn-small" onClick={() => void load()}>
          ↻ 새로고침
        </button>
      </div>

      {error && <div className="notice notice-error">{error}</div>}
      {entries === null && <p className="loading">이력을 불러오는 중…</p>}
      {entries?.length === 0 && !error && (
        <p className="empty-inline">아직 저장된 이력이 없습니다. 지금은 내장 기본 템플릿을 사용하고 있습니다.</p>
      )}

      <ol className="history-list">
        {entries?.map((entry, i) => (
          <li key={entry.version} className="history-item">
            <div className="history-row">
              <div className="history-meta">
                <span className="history-message">
                  {formatMessage(entry.message)}
                  {i === 0 && <span className="badge badge-current">현재</span>}
                </span>
                <span className="history-sub">
                  {entry.date ? dateFormat.format(new Date(entry.date)) : ''} · <code>{entry.version.slice(0, 7)}</code>
                </span>
              </div>
              <div className="history-actions">
                <button type="button" className="btn btn-small" disabled={busy !== null} onClick={() => void showPreview(entry)}>
                  {preview?.version === entry.version ? '닫기' : '미리보기'}
                </button>
                {i > 0 && (
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={!editable || busy !== null}
                    onClick={() => void restore(entry)}
                  >
                    {busy === entry.version ? '처리 중…' : '이 버전으로 되돌리기'}
                  </button>
                )}
              </div>
            </div>
            {preview?.version === entry.version && (
              <div className="preview history-preview" dangerouslySetInnerHTML={{ __html: preview.html }} />
            )}
          </li>
        ))}
      </ol>
    </main>
  );
}
