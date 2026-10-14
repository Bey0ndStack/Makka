"use client";

import { useActionState } from "react";
import { LoaderCircle, Ban } from "lucide-react";
import { cancelInvoiceAction } from "@/features/finance/invoice.actions";

export function InvoiceCancelForm({ invoiceId, locale }: { invoiceId: string; locale: "ar" | "en" }) {
  const [state, action, pending] = useActionState(cancelInvoiceAction, {});
  const isArabic = locale === "ar";
  return (
    <form action={action} aria-busy={pending} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input name="reason" required minLength={3} maxLength={500} placeholder={isArabic ? "سبب الإلغاء" : "Cancellation reason"} aria-label={isArabic ? "سبب الإلغاء" : "Cancellation reason"} className="h-10 min-w-48 rounded-lg border border-slate-200 px-3 text-sm" />
      <button disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-lg border border-rose-200 px-3 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60">
        {pending ? <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Ban size={15} aria-hidden="true" />}
        {pending ? (isArabic ? "جارٍ الإلغاء..." : "Cancelling...") : (isArabic ? "إلغاء الفاتورة" : "Cancel invoice")}
      </button>
      {pending && <span role="status" aria-live="polite" className="text-xs text-slate-500">{isArabic ? "جارٍ تحديث سجل الفواتير..." : "Updating the invoice register..."}</span>}
      {state.error && <p role="alert" className="basis-full text-sm text-rose-700">{state.error}</p>}
      {state.success && <p role="status" className="basis-full text-sm text-emerald-700">{state.success}</p>}
    </form>
  );
}
