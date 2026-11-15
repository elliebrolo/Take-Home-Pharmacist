import React from 'react';

/**
 * Minimal, dependency-free renderer for the subset of markdown the chatbot
 * produces: `### headings`, `**bold**`, bullet lists (•, -, *) and numbered
 * lists with indented continuation lines. It builds React elements only, so
 * model output can never inject HTML.
 */

export type ChatBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[][] }; // each item = list of lines

const HEADING = /^#{1,6}\s+(.*)$/;
const BULLET = /^([•\-*])\s+(.*)$/;
const NUMBERED = /^\d+[.)]\s+(.*)$/;

export function parseChatBlocks(source: string): ChatBlock[] {
  const blocks: ChatBlock[] = [];
  let list: Extract<ChatBlock, { kind: 'list' }> | null = null;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ kind: 'paragraph', text: paragraph.join('\n') });
      paragraph = [];
    }
  };
  const closeList = () => {
    list = null;
  };

  for (const rawLine of source.replace(/\r\n/g, '\n').split('\n')) {
    const indented = /^\s+\S/.test(rawLine);
    const line = rawLine.trim();

    // A blank line ends a paragraph but NOT a list: the server separates numbered
    // items with blank lines, and closing the list here would restart numbering at 1.
    // The list ends when a non-list, non-indented line (paragraph/heading) arrives.
    if (!line) {
      flushParagraph();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading && !indented) {
      flushParagraph();
      closeList();
      blocks.push({ kind: 'heading', text: heading[1] });
      continue;
    }

    // Indented lines continue the current list item (including nested bullets).
    if (indented && list) {
      list.items[list.items.length - 1].push(line);
      continue;
    }

    const numbered = NUMBERED.exec(line);
    const bullet = BULLET.exec(line);
    if (numbered || bullet) {
      flushParagraph();
      const ordered = !!numbered;
      if (!list || list.ordered !== ordered) {
        list = { kind: 'list', ordered, items: [] };
        blocks.push(list);
      }
      list.items.push([(numbered ? numbered[1] : bullet![2]).trim()]);
      continue;
    }

    closeList();
    paragraph.push(line);
  }
  flushParagraph();
  return blocks;
}

/** **bold** -> <strong>. Any unmatched `**` (e.g. mid-stream) is dropped rather than shown. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts
    .filter((p) => p !== '')
    .map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>;
      }
      return <React.Fragment key={`${keyPrefix}-${i}`}>{part.replace(/\*\*/g, '')}</React.Fragment>;
    });
}

function renderLines(lines: string[], keyPrefix: string): React.ReactNode[] {
  return lines.flatMap((line, i) => [
    i > 0 ? <br key={`${keyPrefix}-br-${i}`} /> : null,
    ...renderInline(line, `${keyPrefix}-${i}`),
  ]);
}

export const ChatMarkdown: React.FC<{ text: string }> = ({ text }) => {
  const blocks = parseChatBlocks(text);

  return (
    <div className="space-y-3">
      {blocks.map((block, bi) => {
        const key = `b${bi}`;
        if (block.kind === 'heading') {
          return (
            <h4 key={key} className="font-bold text-base text-slate-900 dark:text-slate-50">
              {renderInline(block.text, key)}
            </h4>
          );
        }
        if (block.kind === 'paragraph') {
          return <p key={key}>{renderLines(block.text.split('\n'), key)}</p>;
        }
        const Tag = block.ordered ? 'ol' : 'ul';
        return (
          <Tag key={key} className={`${block.ordered ? 'list-decimal' : 'list-disc'} pl-6 space-y-2`}>
            {block.items.map((lines, li) => (
              <li key={`${key}-${li}`}>{renderLines(lines, `${key}-${li}`)}</li>
            ))}
          </Tag>
        );
      })}
    </div>
  );
};
