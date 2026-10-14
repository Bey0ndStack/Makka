"use client";

import { useActionState } from "react";
import { LoaderCircle, RotateCcw } from "lucide-react";
import { reversePaymentAction } from "@/features/finance/payment.actions";

export function PaymentReverseForm({ paymentId, locale }: { paymentId: string; locale: "ar" | "en" }) {
  const [state, action, pending] = useActionState(reversePaymentAction, {});
  const isArabic = locale === "ar";
  return (
    <form action={action} aria-busy={pending} className="flex min-w-56 items-center gap-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="paymentId" value={paymentId} />
      <input name="reason" required minLength={3} maxLength={500} placeholder={isArabic ? "سبب العكس" : "Reversal reason"} aria-label={isArabic ? "سبب العكس" : "Reversal reason"} className="h-9 min-w-0 rounded-md border border-slate-200 px-2 text-xs" />
      <button disabled={pending} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md border border-rose-200 px-2 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60">
        {pending ? <LoaderCircle size={13} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <RotateCcw size={13} aria-hidden="true" />}
        {pending ? (isArabic ? "جارٍ العكس..." : "Reversing...") : (isArabic ? "عكس" : "Reverse")}
      </button>
      {pending && <span role="status" aria-live="polite" className="sr-only">{isArabic ? "جارٍ تحديث التحصيلات والأرصدة..." : "Updating payments and balances..."}</span>}
      {state.error && <span role="alert" className="text-[11px] text-rose-700">{state.error}</span>}
      {state.success && <span role="status" className="text-[11px] text-emerald-700">{state.success}</span>}
    </form>
  );
}
