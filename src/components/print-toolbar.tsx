"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowRight, Printer } from "lucide-react";

export function PrintToolbar({ backHref, autoPrint }: { backHref: string; autoPrint: boolean }) {
  useEffect(() => {
    if (!autoPrint) return;
    const timer = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(timer);
  }, [autoPrint]);

  return (
    <div className="print-toolbar mx-auto mb-4 flex w-[210mm] max-w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-panel">
      <Link href={backHref} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50">
        <ArrowRight size={15} aria-hidden="true" />
        العودة إلى الفاتورة
      </Link>
      <p className="text-xs text-slate-500">اختر «حفظ بتنسيق PDF» من نافذة الطباعة لتنزيل الفاتورة.</p>
      <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800">
        <Printer size={16} aria-hidden="true" />
        طباعة / حفظ PDF
      </button>
    </div>
  );
}
