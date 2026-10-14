"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";
import { previewInvoiceImportAction, type ImportActionState } from "@/features/imports/import.actions";

export function ImportUploadForm({ locale }: { locale: "ar" | "en" }) {
  const [state, action, pending] = useActionState(previewInvoiceImportAction, {} as ImportActionState);
  const isArabic = locale === "ar";
  return (
    <form action={action} aria-busy={pending} className="rounded-xl border border-slate-200 bg-white p-5 shadow-panel">
      <input type="hidden" name="locale" value={locale} />
      <div className="mb-4 flex items-center gap-2"><FileSpreadsheet size={18} className="text-brand-700" aria-hidden="true" /><h2 className="text-sm font-bold text-slate-800">{isArabic ? "رفع فواتير من ملف" : "Upload invoices from a file"}</h2></div>
      <p className="mb-4 text-xs leading-5 text-slate-500">{isArabic ? "يدعم XLSX وCSV حتى 5 ميجابايت و2,000 صف. الأعمدة المطلوبة: invoiceNumber, merchantCode, transactionDate, totalAmount." : "Supports XLSX and CSV up to 5 MB and 2,000 rows. Required columns: invoiceNumber, merchantCode, transactionDate, totalAmount."}</p>
      <div className="flex flex-wrap items-center gap-3">
        <input name="file" type="file" accept=".xlsx,.csv" required className="block max-w-full text-sm text-slate-600 file:me-3 file:h-10 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100" />
        <button disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 disabled:cursor-wait disabled:opacity-60">{pending ? <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Upload size={15} aria-hidden="true" />}{pending ? (isArabic ? "جارٍ فحص الملف..." : "Checking file...") : (isArabic ? "معاينة الملف" : "Preview file")}</button>
        <a href="/templates/invoice-import-example.xlsx" download className="text-xs font-semibold text-brand-700 underline underline-offset-2">{isArabic ? "تنزيل مثال Excel" : "Download Excel example"}</a>
        <a href="/templates/invoice-import-template.csv" download className="text-xs font-semibold text-brand-700 underline underline-offset-2">{isArabic ? "تنزيل نموذج CSV" : "Download CSV template"}</a>
      </div>
      {state.error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}
      {state.success && <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.success}{state.batchId && <Link href={`/${locale}/imports/${state.batchId}`} className="ms-2 font-semibold underline">{isArabic ? "عرض المعاينة" : "Review preview"}</Link>}</p>}
    </form>
  );
}
