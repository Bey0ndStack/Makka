"use client";

import { useActionState } from "react";
import { LoaderCircle, Upload } from "lucide-react";
import { executeInvoiceImportAction, type ImportActionState } from "@/features/imports/import.actions";

export function ImportExecuteForm({ locale, batchId }: { locale: "ar" | "en"; batchId: string }) {
  const [state, action, pending] = useActionState(executeInvoiceImportAction, {} as ImportActionState);
  const isArabic = locale === "ar";
  return (
    <form action={action} aria-busy={pending}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="batchId" value={batchId} />
      <button disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 disabled:cursor-wait disabled:opacity-60">{pending ? <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Upload size={15} aria-hidden="true" />}{pending ? (isArabic ? "جارٍ الاستيراد..." : "Importing...") : (isArabic ? "استيراد الصفوف الصالحة" : "Import valid rows")}</button>
      {pending && <p role="status" aria-live="polite" className="mt-3 text-sm text-slate-500">{isArabic ? "جارٍ حفظ الفواتير وتحديث الأرصدة..." : "Saving invoices and updating balances..."}</p>}
      {state.error && <p role="alert" className="mt-3 text-sm text-rose-700">{state.error}</p>}
      {state.success && <p role="status" className="mt-3 text-sm text-emerald-700">{state.success}</p>}
    </form>
  );
}
