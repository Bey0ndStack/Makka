"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useState } from "react";
import { LoaderCircle, X } from "lucide-react";
import type { Locale } from "@/lib/i18n";

// The chat panel (and its Markdown renderer) loads only when first opened, keeping page bundles small.
const MakkaAIPanel = dynamic(() => import("@/components/makka-ai-panel"), {
  ssr: false,
  loading: () => (
    <div className="mb-3 flex h-40 w-[min(430px,calc(100vw-32px))] items-center justify-center rounded-2xl border border-brand-100 bg-white shadow-xl">
      <LoaderCircle size={20} className="animate-spin text-brand-600 motion-reduce:animate-none" aria-hidden="true" />
    </div>
  )
});

export function MakkaAIChat({ locale, configured, permissionKeys }: { locale: Locale; configured: boolean; permissionKeys: string[] }) {
  const isArabic = locale === "ar";
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  return (
    <div dir={isArabic ? "rtl" : "ltr"} className="fixed bottom-5 end-5 z-40 flex flex-col items-end print:hidden">
      {mounted && (
        <div hidden={!open}>
          <MakkaAIPanel locale={locale} configured={configured} permissionKeys={permissionKeys} onClose={() => setOpen(false)} />
        </div>
      )}
      <button
        type="button"
        onClick={() => { setMounted(true); setOpen((value) => !value); }}
        onPointerEnter={() => { void import("@/components/makka-ai-panel"); }}
        aria-expanded={open}
        aria-label={open ? (isArabic ? "إغلاق Makka AI" : "Close Makka AI") : (isArabic ? "افتح Makka AI" : "Open Makka AI")}
        className="flex h-14 items-center gap-2 rounded-full bg-brand-800 px-4 text-sm font-bold text-white shadow-[0_8px_28px_rgba(3,41,31,0.26)] transition hover:-translate-y-0.5 hover:bg-brand-700 focus-visible:outline-offset-4"
      >
        {open ? <X size={19} aria-hidden="true" /> : <Image src="/logo/makkah-mark-reverse.svg" alt="" width={25} height={25} />}
        <span>{open ? (isArabic ? "إغلاق" : "Close") : "Makka AI"}</span>
      </button>
    </div>
  );
}
