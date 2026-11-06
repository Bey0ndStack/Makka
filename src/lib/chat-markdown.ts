// Minimal Markdown parser for assistant replies. It produces plain data (never HTML),
// so rendering stays XSS-safe, and it tolerates partially streamed input.

export type InlineNode =
  | { type: "text"; value: string }
  | { type: "strong"; children: InlineNode[] }
  | { type: "em"; children: InlineNode[] }
  | { type: "code"; value: string }
  | { type: "link"; href: string; children: InlineNode[] };

export type ListItem = { content: string; children?: ListBlock };
export type ListBlock = { type: "list"; ordered: boolean; start: number; items: ListItem[] };
export type Block =
  | { type: "heading"; level: number; content: string }
  | { type: "paragraph"; content: string }
  | { type: "quote"; content: string }
  | { type: "code"; language: string; content: string }
  | { type: "hr" }
  | { type: "table"; header: string[]; align: Array<"left" | "right" | "center" | null>; rows: string[][] }
  | ListBlock;

const listItemPattern = /^(\s*)([-*+•]|\d{1,3}[.)])\s+(.*)$/;
const tableDividerPattern = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function splitTableRow(line: string) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function isBlockStart(line: string, next: string | undefined) {
  return /^\s*#{1,6}\s/.test(line) || /^\s*```/.test(line) || /^\s*>/.test(line) || /^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)
    || listItemPattern.test(line) || (line.includes("|") && next !== undefined && tableDividerPattern.test(next));
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }

    const fence = line.match(/^\s*```\s*([\w-]*)/);
    if (fence) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```/.test(lines[index])) body.push(lines[index++]);
      index += 1;
      blocks.push({ type: "code", language: fence[1], content: body.join("\n") });
      continue;
    }

    const heading = line.match(/^\s*(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, content: heading[2] });
      index += 1;
      continue;
    }

    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      blocks.push({ type: "hr" });
      index += 1;
      continue;
    }

    if (line.includes("|") && index + 1 < lines.length && tableDividerPattern.test(lines[index + 1])) {
      const header = splitTableRow(line);
      const align = splitTableRow(lines[index + 1]).map((cell) => cell.startsWith(":") && cell.endsWith(":") ? "center" as const : cell.endsWith(":") ? "right" as const : cell.startsWith(":") ? "left" as const : null);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        const cells = splitTableRow(lines[index]);
        rows.push(header.map((_, column) => cells[column] ?? ""));
        index += 1;
      }
      blocks.push({ type: "table", header, align: header.map((_, column) => align[column] ?? null), rows });
      continue;
    }

    if (/^\s*>/.test(line)) {
      const body: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) body.push(lines[index++].replace(/^\s*>\s?/, ""));
      blocks.push({ type: "quote", content: body.join("\n") });
      continue;
    }

    const firstItem = line.match(listItemPattern);
    if (firstItem) {
      const baseIndent = firstItem[1].length;
      const ordered = /\d/.test(firstItem[2]);
      const list: ListBlock = { type: "list", ordered, start: ordered ? Number.parseInt(firstItem[2], 10) : 1, items: [] };
      while (index < lines.length) {
        const current = lines[index];
        if (!current.trim()) {
          const nextLine = lines[index + 1];
          if (nextLine && listItemPattern.test(nextLine)) { index += 1; continue; }
          break;
        }
        const item = current.match(listItemPattern);
        if (item && item[1].length <= baseIndent + 1) {
          if (/\d/.test(item[2]) !== ordered) break;
          list.items.push({ content: item[3] });
        } else if (item && list.items.length) {
          const parent = list.items[list.items.length - 1];
          const childOrdered = /\d/.test(item[2]);
          parent.children ??= { type: "list", ordered: childOrdered, start: childOrdered ? Number.parseInt(item[2], 10) : 1, items: [] };
          parent.children.items.push({ content: item[3] });
        } else if (list.items.length && /^\s+\S/.test(current)) {
          list.items[list.items.length - 1].content += `\n${current.trim()}`;
        } else {
          break;
        }
        index += 1;
      }
      blocks.push(list);
      continue;
    }

    const paragraph: string[] = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index], lines[index + 1])) paragraph.push(lines[index++].trim());
    blocks.push({ type: "paragraph", content: paragraph.join("\n") });
  }
  return blocks;
}

const inlinePattern = /`([^`\n]+)`|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|\[([^\]\n]+)\]\(([^)\s]+)\)|(?<![\p{L}\p{N}*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\p{L}\p{N}*])|(?<![\p{L}\p{N}_])_(?!\s)([^_\n]+?)(?<!\s)_(?![\p{L}\p{N}_])/u;

export function parseInline(source: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let rest = source;
  while (rest) {
    const match = rest.match(inlinePattern);
    if (!match || match.index === undefined) {
      nodes.push({ type: "text", value: rest });
      break;
    }
    if (match.index > 0) nodes.push({ type: "text", value: rest.slice(0, match.index) });
    const [whole, code, strong, strongAlt, linkText, href, em, emAlt] = match;
    if (code !== undefined) nodes.push({ type: "code", value: code });
    else if (strong !== undefined || strongAlt !== undefined) nodes.push({ type: "strong", children: parseInline(strong ?? strongAlt) });
    else if (linkText !== undefined) nodes.push({ type: "link", href, children: parseInline(linkText) });
    else nodes.push({ type: "em", children: parseInline(em ?? emAlt) });
    rest = rest.slice(match.index + whole.length);
  }
  return nodes;
}

/** Only same-site paths are rendered as links; anything else stays plain text. */
export function safeInternalHref(href: string) {
  return /^\/(?!\/)[\w\-./?=&%#؀-ۿ]*$/.test(href) ? href : null;
}

export function markdownToPlainText(source: string) {
  return source
    .replace(/```[\w-]*\n?/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*\|?\s*:?-{2,}.*$/gm, "")
    .trim();
}
