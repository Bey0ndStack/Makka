"use client";

import { Fragment, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { parseInline, parseMarkdown, safeInternalHref, type Block, type InlineNode, type ListBlock } from "@/lib/chat-markdown";

const numericCell = /^[\s\d٠-٩.,٬٫%+\-−()]+(?:\s*(?:ج\.م\.?|EGP|جنيه))?$/u;

function Inline({ nodes, onNavigate }: { nodes: InlineNode[]; onNavigate?: () => void }) {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "text":
        return <Fragment key={index}>{node.value.split("\n").map((part, line) => <Fragment key={line}>{line > 0 && <br />}{part}</Fragment>)}</Fragment>;
      case "strong":
        return <strong key={index} className="font-semibold text-slate-900"><Inline nodes={node.children} onNavigate={onNavigate} /></strong>;
      case "em":
        return <em key={index}><Inline nodes={node.children} onNavigate={onNavigate} /></em>;
      case "code":
        return <code key={index} dir="ltr" className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] text-slate-700">{node.value}</code>;
      case "link": {
        const href = safeInternalHref(node.href);
        return href
          ? <Link key={index} href={href} onClick={onNavigate} className="font-semibold text-brand-600 underline decoration-brand-300 underline-offset-4 hover:text-brand-800 hover:decoration-brand-600"><Inline nodes={node.children} onNavigate={onNavigate} /></Link>
          : <span key={index}><Inline nodes={node.children} onNavigate={onNavigate} /></span>;
      }
    }
  });
}

function text(value: string, onNavigate?: () => void) {
  return <Inline nodes={parseInline(value)} onNavigate={onNavigate} />;
}

function List({ list, onNavigate }: { list: ListBlock; onNavigate?: () => void }) {
  const Tag = list.ordered ? "ol" : "ul";
  return (
    <Tag start={list.ordered ? list.start : undefined} className={`space-y-1 ps-5 ${list.ordered ? "list-decimal" : "list-disc"} marker:text-brand-600`}>
      {list.items.map((item, index) => (
        <li key={index} className="ps-1">
          {text(item.content, onNavigate)}
          {item.children && <div className="mt-1"><List list={item.children} onNavigate={onNavigate} /></div>}
        </li>
      ))}
    </Tag>
  );
}

function renderBlock(block: Block, key: number, onNavigate?: () => void): ReactNode {
  switch (block.type) {
    case "heading":
      return block.level <= 2
        ? <h3 key={key} className="pt-1 text-[15px] font-bold text-slate-900">{text(block.content, onNavigate)}</h3>
        : <h4 key={key} className="pt-1 text-sm font-bold text-brand-800">{text(block.content, onNavigate)}</h4>;
    case "paragraph":
      return <p key={key}>{text(block.content, onNavigate)}</p>;
    case "quote":
      return <blockquote key={key} className="rounded-e-lg border-s-4 border-gold bg-amber-50/60 px-3 py-2 text-slate-700">{text(block.content, onNavigate)}</blockquote>;
    case "code":
      return <pre key={key} dir="ltr" className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs leading-5 text-slate-100"><code>{block.content}</code></pre>;
    case "hr":
      return <hr key={key} className="border-slate-200" />;
    case "list":
      return <List key={key} list={block} onNavigate={onNavigate} />;
    case "table":
      return (
        <div key={key} className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-max border-collapse text-[12.5px]">
            <thead className="bg-brand-50 text-brand-900">
              <tr>{block.header.map((cell, index) => <th key={index} className="whitespace-nowrap border-b border-brand-100 px-3 py-2 text-start font-semibold">{text(cell, onNavigate)}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="even:bg-slate-50/60">
                  {row.map((cell, index) => {
                    const numeric = numericCell.test(cell.replace(/\*\*/g, "")) && cell.trim() !== "";
                    return <td key={index} dir={numeric ? "ltr" : undefined} className={`px-3 py-2 align-top ${numeric ? "whitespace-nowrap text-end tabular-nums" : "text-start"}`}>{text(cell, onNavigate)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

export function ChatMarkdown({ content, onNavigate }: { content: string; onNavigate?: () => void }) {
  const blocks = useMemo(() => parseMarkdown(content), [content]);
  return <div className="space-y-2.5 text-[13.5px] leading-6 text-slate-700">{blocks.map((block, index) => renderBlock(block, index, onNavigate))}</div>;
}
