"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, LoaderCircle, Search, Store, WalletCards, X } from "lucide-react";
import { translate, type Locale } from "@/lib/i18n";

type SearchResult = {
  id: string;
  type: "merchant" | "invoice" | "payment";
  title: string;
  subtitle: string;
  href: string;
};

export function WorkspaceSearch({ locale }: { locale: Locale }) {
  const router = useRouter();
  const launcherRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wasOpen = useRef(false);
  const isArabic = locale === "ar";
  const listId = "workspace-search-results";

  function close() {
    setOpen(false);
    setQuery("");
    setResults([]);
    setError(false);
    setActiveIndex(-1);
  }

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent | globalThis.KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "Escape") {
        setOpen(false);
        setQuery("");
        setResults([]);
        setError(false);
        setActiveIndex(-1);
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      wasOpen.current = true;
    } else if (wasOpen.current) {
      launcherRef.current?.focus();
      wasOpen.current = false;
    }
  }, [open]);

  useEffect(() => {
    const search = query.trim();
    if (!open || search.length < 2) {
      setResults([]);
      setLoading(false);
      setError(false);
      setActiveIndex(-1);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(false);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(search)}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" }
        });
        if (!response.ok) throw new Error(`Search failed with status ${response.status}`);
        const data = await response.json() as { results: SearchResult[] };
        setResults(data.results);
        setActiveIndex(data.results.length ? 0 : -1);
      } catch (cause) {
        if (!controller.signal.aborted) {
          console.error("Workspace search failed", cause);
          setError(true);
          setResults([]);
          setActiveIndex(-1);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  function selectActiveResult() {
    const result = results[activeIndex];
    if (!result) return;
    close();
    router.push(`/${locale}${result.href}`);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && results.length) {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp" && results.length) {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? results.length - 1 : index - 1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      selectActiveResult();
    }
  }

  function typeLabel(type: SearchResult["type"]) {
    if (type === "merchant") return isArabic ? "تاجر" : "Merchant";
    if (type === "invoice") return isArabic ? "فاتورة" : "Invoice";
    return isArabic ? "تحصيل" : "Payment";
  }

  function TypeIcon({ type }: { type: SearchResult["type"] }) {
    if (type === "merchant") return <Store size={17} aria-hidden="true" />;
    if (type === "invoice") return <FileText size={17} aria-hidden="true" />;
    return <WalletCards size={17} aria-hidden="true" />;
  }

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={isArabic ? "فتح البحث" : "Open search"}
        className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-start text-slate-500 transition hover:border-brand-200 hover:bg-brand-50"
      >
        <Search size={15} aria-hidden="true" />
        <span className="hidden max-w-52 truncate text-xs sm:inline">{translate(locale, "search")}</span>
        <kbd className="hidden rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500 sm:inline">Ctrl K</kbd>
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/35 px-4 pt-[12vh] backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={isArabic ? "البحث في المنصة" : "Search the workspace"}
            className="w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-slate-100 px-4 focus-within:rounded-lg focus-within:ring-2 focus-within:ring-inset focus-within:ring-brand-200">
              <Search size={18} className="shrink-0 text-slate-400" aria-hidden="true" />
              <input
                ref={inputRef}
                role="combobox"
                aria-expanded={open}
                aria-controls={listId}
                aria-activedescendant={activeIndex >= 0 ? `${listId}-${results[activeIndex]?.id}` : undefined}
                aria-label={isArabic ? "ابحث عن تاجر أو فاتورة أو تحصيل" : "Search merchants, invoices, or payments"}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder={translate(locale, "search")}
                maxLength={100}
                className="workspace-search-input h-14 min-w-0 flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400"
              />
              {loading && <LoaderCircle size={17} className="animate-spin text-brand-700 motion-reduce:animate-none" aria-label={isArabic ? "جارٍ البحث" : "Searching"} />}
              <button type="button" onClick={close} aria-label={isArabic ? "إغلاق البحث" : "Close search"} className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X size={17} aria-hidden="true" />
              </button>
            </div>
            <div id={listId} role="listbox" aria-label={isArabic ? "نتائج البحث" : "Search results"} className="max-h-[min(60vh,28rem)] overflow-y-auto p-2">
              {query.trim().length < 2 && <p className="px-3 py-5 text-center text-xs text-slate-500">{isArabic ? "اكتب حرفين على الأقل للبحث." : "Enter at least two characters to search."}</p>}
              {loading && !results.length && <p role="status" className="px-3 py-5 text-center text-xs text-slate-500">{isArabic ? "جارٍ البحث في التجار والفواتير والتحصيلات..." : "Searching merchants, invoices, and payments..."}</p>}
              {error && <p role="alert" className="px-3 py-5 text-center text-xs text-rose-700">{isArabic ? "تعذر إكمال البحث. حاول مرة أخرى." : "Search could not be completed. Please try again."}</p>}
              {!loading && !error && query.trim().length >= 2 && !results.length && <p role="status" className="px-3 py-5 text-center text-xs text-slate-500">{isArabic ? "لا توجد نتائج مطابقة." : "No matching results."}</p>}
              {results.map((result, index) => (
                <Link
                  key={result.id}
                  id={`${listId}-${result.id}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  href={`/${locale}${result.href}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={close}
                  className={`flex items-center gap-3 rounded-lg px-3 py-3 transition ${index === activeIndex ? "bg-brand-50 text-brand-900" : "text-slate-700 hover:bg-slate-50"}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-brand-700 ring-1 ring-inset ring-slate-200">
                    <TypeIcon type={result.type} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{result.title}</span>
                    <span className="block truncate text-xs text-slate-500">{result.subtitle}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] text-slate-500 ring-1 ring-inset ring-slate-200">{typeLabel(result.type)}</span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
