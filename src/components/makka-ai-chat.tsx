"use client";

import Image from "next/image";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { Bot, LoaderCircle, Send, X } from "lucide-react";
import type { Locale } from "@/lib/i18n";

type ChatMessage = { role: "user" | "assistant"; content: string };

export function MakkaAIChat({ locale, configured }: { locale: Locale; configured: boolean }) {
  const isArabic = locale === "ar";
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const direction = isArabic ? "rtl" : "ltr";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending, open]);

  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open]);

  async function submitMessage(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || pending || !configured) return;

    const nextMessages = [...messages, { role: "user" as const, content }].slice(-8);
    setMessages(nextMessages);
    setDraft("");
    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale, messages: [{ role: "user", content }] })
      });
      const data = await response.json() as { reply?: string; error?: string };
      if (!response.ok || !data.reply) {
        const errorMessage = response.status === 429
          ? (isArabic ? "وصلت إلى حد الرسائل المؤقت. حاول بعد دقيقة." : "You have reached the temporary message limit. Try again in a minute.")
          : data.error || (isArabic ? "تعذر إرسال السؤال." : "Could not send your question.");
        throw new Error(errorMessage);
      }
      setMessages((current) => [...current, { role: "assistant" as const, content: data.reply! }].slice(-8));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (isArabic ? "حدث خطأ غير متوقع." : "An unexpected error occurred."));
    } finally {
      setPending(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitMessage();
    }
  }

  return (
    <div dir={direction} className="fixed bottom-5 end-5 z-40">
      {open && (
        <section
          aria-label={isArabic ? "محادثة Makka AI" : "Makka AI chat"}
          className="mb-3 flex h-[min(620px,calc(100dvh-110px))] w-[min(390px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-[0_18px_70px_rgba(3,41,31,0.2)]"
        >
          <header className="flex items-center justify-between bg-brand-800 px-4 py-3.5 text-white">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
                <Image src="/logo/makkah-mark-reverse.svg" alt="" width={27} height={27} />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-bold">Makka AI</h2>
                <p className="mt-0.5 text-[11px] text-emerald-100">{isArabic ? "مساعد منصة مكة" : "Your Makkah platform assistant"}</p>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label={isArabic ? "إغلاق المحادثة" : "Close chat"} className="rounded-lg p-2 text-white/80 transition hover:bg-white/10 hover:text-white">
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto bg-sand/70 p-4">
            {!messages.length && (
              <div className="rounded-xl border border-brand-100 bg-white p-4 shadow-panel">
                <div className="mb-2 flex items-center gap-2 text-brand-800"><Bot size={17} aria-hidden="true" /><p className="text-sm font-bold">{isArabic ? "أهلًا، أنا Makka AI" : "Hello, I'm Makka AI"}</p></div>
                <p className="text-xs leading-6 text-slate-600">{isArabic ? "اسألني عن طريقة استخدام المنصة أو عن بيانات الأقسام المتاحة حسب صلاحيات حسابك." : "Ask how to use the platform or about records your account is permitted to access."}</p>
              </div>
            )}
            {!configured && (
              <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                <p className="font-semibold">{isArabic ? "المساعد غير مُعد بعد" : "Assistant is not configured yet"}</p>
                <p className="mt-1">{isArabic
                  ? "للمسؤول: أضف MAKKA_AI_API_KEY وحدد MAKKA_AI_PROVIDER بقيمة openai أو groq أو grok في ملف البيئة على السيرفر، ثم أعد تشغيل التطبيق. لا تضع المفتاح هنا أو في كود الواجهة."
                  : "Administrator: set MAKKA_AI_API_KEY and set MAKKA_AI_PROVIDER to openai, groq, or grok in the server environment, then restart the app. Do not enter the key here or in client-side code."}</p>
              </div>
            )}
            {messages.map((message, index) => (
              <div key={`${index}-${message.role}`} className={`flex ${message.role === "user" ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[88%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-6 ${message.role === "user" ? "rounded-es-md bg-brand-700 text-white" : "rounded-ee-md border border-slate-200 bg-white text-slate-700 shadow-panel"}`}>
                  {message.content}
                </div>
              </div>
            ))}
            {pending && <div role="status" className="flex items-center gap-2 text-xs text-slate-500"><LoaderCircle size={15} className="animate-spin text-brand-600 motion-reduce:animate-none" aria-hidden="true" />{isArabic ? "Makka AI بيفكر..." : "Makka AI is thinking..."}</div>}
            <div ref={endRef} />
          </div>
          {error && <p role="alert" className="mx-3 mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">{error}</p>}
          <form onSubmit={(event) => void submitMessage(event)} className="border-t border-slate-100 bg-white p-3">
            <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-white p-2 focus-within:border-brand-300 focus-within:ring-2 focus-within:ring-brand-100">
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={1200}
                rows={1}
                disabled={!configured || pending}
                placeholder={configured ? (isArabic ? "اكتب سؤالك هنا..." : "Type your question...") : (isArabic ? "المساعد غير مُعد بعد" : "Assistant is not configured")}
                aria-label={isArabic ? "اكتب سؤالك إلى Makka AI" : "Write your question to Makka AI"}
                className="max-h-28 min-h-9 flex-1 resize-y bg-transparent px-1 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
              />
              <button type="submit" disabled={!configured || pending || !draft.trim()} aria-label={isArabic ? "إرسال السؤال" : "Send question"} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-700 text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-45">
                {pending ? <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
              </button>
            </div>
            <p className="mt-2 px-1 text-[10px] leading-4 text-slate-400">{isArabic ? "قد تُرسل بيانات محدودة مرتبطة بسؤالك إلى مزود الذكاء الاصطناعي المُعد." : "Limited data relevant to your question may be sent to the configured AI provider."}</p>
            <p className="mt-2 px-1 text-[10px] text-slate-400">{isArabic ? "المساعد للاستفسار فقط، ولا ينفذ عمليات على النظام." : "Read-only assistant; it cannot perform actions in the platform."}</p>
          </form>
        </section>
      )}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? (isArabic ? "إغلاق Makka AI" : "Close Makka AI") : (isArabic ? "افتح Makka AI" : "Open Makka AI")}
        className="ms-auto flex h-14 items-center gap-2 rounded-full bg-brand-800 px-4 text-sm font-bold text-white shadow-[0_8px_28px_rgba(3,41,31,0.26)] transition hover:-translate-y-0.5 hover:bg-brand-700 focus-visible:outline-offset-4"
      >
        {open ? <X size={19} aria-hidden="true" /> : <Image src="/logo/makkah-mark-reverse.svg" alt="" width={25} height={25} />}
        <span>{open ? (isArabic ? "إغلاق" : "Close") : "Makka AI"}</span>
      </button>
    </div>
  );
}
