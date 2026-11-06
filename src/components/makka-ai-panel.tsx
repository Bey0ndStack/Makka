"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Check, Copy, LoaderCircle, Maximize2, Minimize2, Send, Sparkles, Square, SquarePen, X } from "lucide-react";
import { ChatMarkdown } from "@/components/chat-markdown";
import { markdownToPlainText } from "@/lib/chat-markdown";
import type { Locale } from "@/lib/i18n";

type ChatMessage = { id: string; role: "user" | "assistant"; content: string; error?: string; done?: boolean };
type StreamEvent = { type: "status"; text: string } | { type: "delta"; text: string } | { type: "clear" } | { type: "done" } | { type: "error"; message: string };

const storageKey = "makka-ai:conversation:v2";
const historyLimit = 12;

function suggestionsFor(permissionKeys: string[], arabic: boolean) {
  const has = (key: string) => permissionKeys.includes(key);
  const items: Array<[boolean, string, string]> = [
    [has("dashboard.read"), "ملخص النهارده: التحصيلات والديون والمتأخرات", "Today's summary: collections, balances and overdue"],
    [has("debt.read"), "مين أكبر 5 تجار عليهم فلوس؟ في جدول", "Top 5 merchants by outstanding balance, as a table"],
    [has("payment.read"), "التحصيلات الشهر ده مقسمة حسب طريقة الدفع", "This month's collections by payment method"],
    [has("invoice.read"), "الفواتير المؤكدة اللي ميعاد استحقاقها عدى", "Confirmed invoices that are past due"],
    [has("cheque.read"), "الشيكات اللي لسه تحت التحصيل", "Cheques that are still pending"],
    [has("invoice.create"), "إزاي أعمل فاتورة بضريبة 14% وأطلعها PDF؟", "How do I create an invoice with 14% VAT and export it as PDF?"],
    [true, "أنا أقدر أعمل وأشوف إيه في المنصة؟", "What can I see and do on the platform?"]
  ];
  return items.filter(([allowed]) => allowed).map(([, ar, en]) => (arabic ? ar : en)).slice(0, 5);
}

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

function loadConversation(): ChatMessage[] {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    const parsed = raw ? (JSON.parse(raw) as ChatMessage[]) : [];
    return Array.isArray(parsed) ? parsed.filter((message) => message.content || message.error).map((message) => ({ ...message, done: true })) : [];
  } catch {
    return [];
  }
}

export default function MakkaAIPanel({
  locale,
  configured,
  permissionKeys,
  onClose
}: {
  locale: Locale;
  configured: boolean;
  permissionKeys: string[];
  onClose: () => void;
}) {
  const arabic = locale === "ar";
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    setMessages(loadConversation());
    textareaRef.current?.focus();
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (pending) return;
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(messages.slice(-30)));
    } catch {
      // Storage can be unavailable (private mode); the conversation still works in memory.
    }
  }, [messages, pending]);

  useEffect(() => {
    const element = scrollRef.current;
    if (element && stickToBottom.current) element.scrollTop = element.scrollHeight;
  }, [messages, status]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
  }, [draft]);

  const updateAssistant = useCallback((id: string, change: (message: ChatMessage) => ChatMessage) => {
    setMessages((current) => current.map((message) => (message.id === id ? change(message) : message)));
  }, []);

  async function ask(question: string) {
    const content = question.trim();
    if (!content || pending || !configured) return;
    const userMessage: ChatMessage = { id: newId(), role: "user", content, done: true };
    const assistantId = newId();
    const history = [...messages.filter((message) => message.done && message.content && !message.error), userMessage]
      .slice(-historyLimit)
      .map((message) => ({ role: message.role, content: message.content.slice(0, message.role === "user" ? 2000 : 8000) }));
    setMessages((current) => [...current, userMessage, { id: assistantId, role: "assistant", content: "" }]);
    setDraft("");
    setPending(true);
    setStatus(arabic ? "بيفكر" : "Thinking");
    stickToBottom.current = true;

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale, messages: history }),
        signal: controller.signal
      });
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(response.status === 429
          ? (arabic ? "وصلت إلى حد الرسائل المؤقت. حاول بعد دقيقة." : "You have reached the temporary message limit. Try again in a minute.")
          : data.error || (arabic ? "تعذر إرسال السؤال." : "Could not send your question."));
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as StreamEvent;
          if (event.type === "delta") {
            setStatus("");
            updateAssistant(assistantId, (message) => ({ ...message, content: message.content + event.text }));
          } else if (event.type === "clear") {
            updateAssistant(assistantId, (message) => ({ ...message, content: "" }));
          } else if (event.type === "status") {
            setStatus(event.text);
          } else if (event.type === "error") {
            updateAssistant(assistantId, (message) => ({ ...message, error: event.message }));
          }
        }
        if (done) break;
      }
    } catch (caught) {
      if (controller.signal.aborted) {
        updateAssistant(assistantId, (message) => ({ ...message, content: message.content || (arabic ? "_تم إيقاف الرد._" : "_Response stopped._") }));
      } else {
        updateAssistant(assistantId, (message) => ({ ...message, error: caught instanceof Error ? caught.message : (arabic ? "حدث خطأ غير متوقع." : "An unexpected error occurred.") }));
      }
    } finally {
      updateAssistant(assistantId, (message) => ({ ...message, done: true }));
      abortRef.current = null;
      setPending(false);
      setStatus("");
      textareaRef.current?.focus();
    }
  }

  function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    void ask(draft);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  function resetConversation() {
    abortRef.current?.abort();
    setMessages([]);
    setDraft("");
    textareaRef.current?.focus();
  }

  async function copy(message: ChatMessage) {
    try {
      await navigator.clipboard.writeText(markdownToPlainText(message.content));
      setCopied(message.id);
      window.setTimeout(() => setCopied((current) => (current === message.id ? null : current)), 1500);
    } catch {
      // Clipboard permission denied; nothing else to do.
    }
  }

  const suggestions = suggestionsFor(permissionKeys, arabic);
  const iconButton = "rounded-lg p-2 text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-40";

  return (
    <section
      aria-label={arabic ? "محادثة Makka AI" : "Makka AI chat"}
      className={`mb-3 flex flex-col overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-[0_18px_70px_rgba(3,41,31,0.22)] transition-[width,height] duration-200 ${expanded
        ? "h-[min(780px,calc(100dvh-100px))] w-[min(860px,calc(100vw-32px))]"
        : "h-[min(640px,calc(100dvh-110px))] w-[min(430px,calc(100vw-32px))]"}`}
    >
      <header className="flex items-center justify-between gap-2 bg-brand-800 px-4 py-3 text-white">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
            <Image src="/logo/makkah-mark-reverse.svg" alt="" width={27} height={27} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold">Makka AI</h2>
            <p className="mt-0.5 truncate text-[11px] text-emerald-100">{arabic ? "مساعدك الذكي لبيانات وصفحات المنصة" : "Your assistant for platform data and workflows"}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          <button type="button" onClick={resetConversation} disabled={!messages.length} title={arabic ? "محادثة جديدة" : "New chat"} aria-label={arabic ? "محادثة جديدة" : "New chat"} className={iconButton}><SquarePen size={17} aria-hidden="true" /></button>
          <button type="button" onClick={() => setExpanded((value) => !value)} title={expanded ? (arabic ? "تصغير" : "Collapse") : (arabic ? "توسيع" : "Expand")} aria-label={expanded ? (arabic ? "تصغير" : "Collapse") : (arabic ? "توسيع" : "Expand")} className={`${iconButton} hidden sm:block`}>
            {expanded ? <Minimize2 size={17} aria-hidden="true" /> : <Maximize2 size={17} aria-hidden="true" />}
          </button>
          <button type="button" onClick={onClose} aria-label={arabic ? "إغلاق المحادثة" : "Close chat"} className={iconButton}><X size={18} aria-hidden="true" /></button>
        </div>
      </header>

      <div
        ref={scrollRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 60;
        }}
        className="flex-1 space-y-4 overflow-y-auto bg-sand/70 p-4"
        aria-live="polite"
      >
        {!messages.length && (
          <div className="space-y-3">
            <div className="rounded-xl border border-brand-100 bg-white p-4 shadow-panel">
              <div className="mb-2 flex items-center gap-2 text-brand-800"><Sparkles size={17} aria-hidden="true" /><p className="text-sm font-bold">{arabic ? "أهلًا، أنا Makka AI" : "Hello, I'm Makka AI"}</p></div>
              <p className="text-xs leading-6 text-slate-600">{arabic
                ? "أقدر أجاوبك من بيانات المنصة الحقيقية (فواتير، تحصيلات، ديون، شيكات، تقارير) وأشرحلك أي خطوة، في حدود صلاحيات حسابك."
                : "I answer from live platform data (invoices, collections, balances, cheques, reports) and explain any workflow, within your account's permissions."}</p>
            </div>
            {configured && (
              <div className="flex flex-col gap-2">
                {suggestions.map((suggestion) => (
                  <button key={suggestion} type="button" onClick={() => void ask(suggestion)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-start text-xs font-medium text-slate-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800">
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {!configured && (
          <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            <p className="font-semibold">{arabic ? "المساعد غير مُعد بعد" : "Assistant is not configured yet"}</p>
            <p className="mt-1">{arabic
              ? "للمسؤول: أضف MAKKA_AI_API_KEY وحدد MAKKA_AI_PROVIDER بقيمة openai أو groq أو grok في ملف البيئة على السيرفر، ثم أعد تشغيل التطبيق."
              : "Administrator: set MAKKA_AI_API_KEY and set MAKKA_AI_PROVIDER to openai, groq, or grok in the server environment, then restart the app."}</p>
          </div>
        )}

        {messages.map((message) => message.role === "user" ? (
          <div key={message.id} className="flex justify-start">
            <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-es-md bg-brand-700 px-3.5 py-2.5 text-sm leading-6 text-white">{message.content}</div>
          </div>
        ) : (
          <div key={message.id} className="group">
            <div className="rounded-2xl rounded-ee-md border border-slate-200 bg-white px-4 py-3 shadow-panel">
              {message.content
                ? <ChatMarkdown content={message.content} />
                : !message.error && <div className="flex items-center gap-2 text-xs text-slate-500"><LoaderCircle size={15} className="animate-spin text-brand-600 motion-reduce:animate-none" aria-hidden="true" />{status || (arabic ? "بيفكر" : "Thinking")}…</div>}
              {message.content && !message.done && status && <p className="mt-2 flex items-center gap-2 text-[11px] text-slate-400"><LoaderCircle size={12} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />{status}…</p>}
              {message.error && <p role="alert" className="mt-1 rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">{message.error}</p>}
            </div>
            {message.done && message.content && (
              <div className="mt-1 flex justify-end opacity-70 transition group-hover:opacity-100">
                <button type="button" onClick={() => void copy(message)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-slate-500 hover:bg-white hover:text-brand-700">
                  {copied === message.id ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
                  {copied === message.id ? (arabic ? "تم النسخ" : "Copied") : (arabic ? "نسخ" : "Copy")}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="border-t border-slate-100 bg-white p-3">
        <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-white p-2 focus-within:border-brand-300 focus-within:ring-2 focus-within:ring-brand-100">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={2000}
            rows={1}
            disabled={!configured}
            placeholder={configured ? (arabic ? "اسأل عن أي فاتورة أو تاجر أو رقم…" : "Ask about any invoice, merchant or figure…") : (arabic ? "المساعد غير مُعد بعد" : "Assistant is not configured")}
            aria-label={arabic ? "اكتب سؤالك إلى Makka AI" : "Write your question to Makka AI"}
            className="max-h-36 min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
          />
          {pending ? (
            <button type="button" onClick={() => abortRef.current?.abort()} aria-label={arabic ? "إيقاف الرد" : "Stop response"} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-white transition hover:bg-slate-700">
              <Square size={13} fill="currentColor" aria-hidden="true" />
            </button>
          ) : (
            <button type="submit" disabled={!configured || !draft.trim()} aria-label={arabic ? "إرسال السؤال" : "Send question"} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-700 text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-45">
              <Send size={16} className={arabic ? "-scale-x-100" : undefined} aria-hidden="true" />
            </button>
          )}
        </div>
        <p className="mt-2 px-1 text-[10px] leading-4 text-slate-400">{arabic
          ? "للاستعلام فقط ولا ينفذ عمليات. قد تُرسل بيانات محدودة متعلقة بسؤالك إلى مزود الذكاء الاصطناعي المُعد."
          : "Read-only; it cannot perform actions. Limited data relevant to your question may be sent to the configured AI provider."}</p>
      </form>
    </section>
  );
}
