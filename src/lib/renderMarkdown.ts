/**
 * 생성기가 출력하는 Markdown 부분집합(##, ###, >, - [ ], **bold**)만 HTML로 렌더링한다.
 * 외부 라이브러리 없이 동작하며 모든 텍스트는 이스케이프한다.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inline(text: string): string {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

export function renderMarkdown(markdown: string): string {
  const html: string[] = [];
  let inList = false;
  const closeList = () => {
    if (inList) html.push('</ul>');
    inList = false;
  };

  for (const line of markdown.split('\n')) {
    const task = line.match(/^- \[( |x)\] (.*)$/);
    if (task) {
      if (!inList) html.push('<ul class="task-list">');
      inList = true;
      const checked = task[1] === 'x' ? ' checked' : '';
      html.push(`<li><label><input type="checkbox"${checked} /> <span>${inline(task[2])}</span></label></li>`);
      continue;
    }
    closeList();
    if (line.startsWith('### ')) html.push(`<h3>${inline(line.slice(4))}</h3>`);
    else if (line.startsWith('## ')) html.push(`<h2>${inline(line.slice(3))}</h2>`);
    else if (line.startsWith('> ')) html.push(`<blockquote>${inline(line.slice(2))}</blockquote>`);
    else if (line.trim()) html.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return html.join('\n');
}
