"use client";

import { useActionState, useMemo, useState } from "react";
import { LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import { createPaymentAction, type PaymentFormState } from "@/features/finance/payment.actions";
import { formatCurrency } from "@/lib/format";

type MerchantOption = { id: string; name: string; merchantCode: string };
type InvoiceOption = { id: string; invoiceNumber: string; merchantId: string; merchantName: string; outstanding: string };
type AllocationRow = { invoiceId: string; amount: string };

export function PaymentCreateForm({
  locale,
  merchants,
  invoices,
  currentDate
}: {
  locale: "ar" | "en";
  merchants: MerchantOption[];
  invoices: InvoiceOption[];
  currentDate: string;
}) {
  const [state, action, pending] = useActionState(createPaymentAction, {} as PaymentFormState);
  const [merchantId, setMerchantId] = useState("");
  const [rows, setRows] = useState<AllocationRow[]>([{ invoiceId: "", amount: "" }]);
  const isArabic = locale === "ar";
  const optionsByMerchant = useMemo(() => invoices.filter((invoice) => invoice.merchantId === merchantId), [invoices, merchantId]);
  const allocations = rows.filter((row) => row.invoiceId && row.amount);
  const totalAllocated = allocations.reduce((total, row) => total + Number(row.amount || 0), 0);

  return (
    <form action={action} aria-busy={pending} className="rounded-xl border border-slate-200 bg-white p-5 shadow-panel sm:p-6">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="allocations" value={JSON.stringify(allocations)} />
      <div className="mb-5">
        <h2 className="text-base font-bold text-slate-900">{isArabic ? "تسجيل تحصيل جديد" : "Record a collection"}</h2>
        <p className="mt-1 text-xs text-slate-500">{isArabic ? "يمكن ترك جزء من المبلغ دون توزيع لتسويته لاحقًا." : "You may leave part of the payment unallocated for later settlement."}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1.5 text-xs font-medium text-slate-600 sm:col-span-2">
          <span>{isArabic ? "التاجر" : "Merchant"}</span>
          <select name="merchantId" required value={merchantId} onChange={(event) => { setMerchantId(event.target.value); setRows([{ invoiceId: "", amount: "" }]); }} className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
            <option value="">{isArabic ? "اختر التاجر" : "Select a merchant"}</option>
            {merchants.map((merchant) => <option key={merchant.id} value={merchant.id}>{merchant.name} · {merchant.merchantCode}</option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-xs font-medium text-slate-600">
          <span>{isArabic ? "قيمة التحصيل (ج.م)" : "Amount (EGP)"}</span>
          <input name="amount" type="number" min="0.01" step="0.01" required dir="ltr" className="h-11 w-full rounded-lg border border-slate-200 px-3 text-right text-sm tabular-nums" />
        </label>
        <label className="space-y-1.5 text-xs font-medium text-slate-600">
          <span>{isArabic ? "تاريخ التحصيل" : "Payment date"}</span>
          <input name="paymentDate" type="date" required defaultValue={currentDate} className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
        </label>
        <label className="space-y-1.5 text-xs font-medium text-slate-600">
          <span>{isArabic ? "طريقة الدفع" : "Payment method"}</span>
          <select name="paymentMethod" required defaultValue="CASH" className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
            <option value="CASH">{isArabic ? "نقدًا" : "Cash"}</option>
            <option value="BANK_TRANSFER">{isArabic ? "تحويل بنكي" : "Bank transfer"}</option>
            <option value="CARD">{isArabic ? "بطاقة" : "Card"}</option>
            <option value="OTHER">{isArabic ? "أخرى" : "Other"}</option>
          </select>
        </label>
        <label className="space-y-1.5 text-xs font-medium text-slate-600">
          <span>{isArabic ? "رقم الإيصال (اختياري)" : "Receipt reference (optional)"}</span>
          <input name="reference" maxLength={100} className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
        </label>
        <label className="space-y-1.5 text-xs font-medium text-slate-600 sm:col-span-2 lg:col-span-3">
          <span>{isArabic ? "ملاحظات (اختياري)" : "Notes (optional)"}</span>
          <input name="notes" maxLength={1000} className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
        </label>
      </div>
      <div className="mt-5 rounded-lg border border-slate-100 bg-slate-50/70 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-800">{isArabic ? "توزيع المبلغ على الفواتير" : "Allocate to invoices"}</h3>
          <button type="button" onClick={() => setRows((current) => [...current, { invoiceId: "", amount: "" }])} disabled={!merchantId || rows.length >= 20} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-brand-700 disabled:opacity-50"><Plus size={14} aria-hidden="true" />{isArabic ? "إضافة فاتورة" : "Add invoice"}</button>
        </div>
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1fr_180px_auto]">
              <select aria-label={isArabic ? "الفاتورة" : "Invoice"} value={row.invoiceId} onChange={(event) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, invoiceId: event.target.value } : item))} disabled={!merchantId} className="h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm">
                <option value="">{isArabic ? "بدون توزيع" : "Do not allocate"}</option>
                {optionsByMerchant.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNumber} · {formatCurrency(invoice.outstanding, locale)} {isArabic ? "متبقي" : "open"}</option>)}
              </select>
              <input aria-label={isArabic ? "مبلغ التوزيع" : "Allocation amount"} value={row.amount} onChange={(event) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, amount: event.target.value } : item))} type="number" min="0.01" step="0.01" dir="ltr" placeholder={isArabic ? "مبلغ التوزيع" : "Allocation"} className="h-10 rounded-lg border border-slate-200 px-3 text-right text-sm tabular-nums" />
              <button type="button" aria-label={isArabic ? "حذف التوزيع" : "Remove allocation"} onClick={() => setRows((current) => current.length > 1 ? current.filter((_, itemIndex) => itemIndex !== index) : [{ invoiceId: "", amount: "" }])} className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-slate-500 hover:text-rose-700"><Trash2 size={15} aria-hidden="true" /></button>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">{isArabic ? `الموزع حاليًا: ${formatCurrency(totalAllocated, locale)}` : `Currently allocated: ${formatCurrency(totalAllocated, locale)}`}</p>
      </div>
      {state.error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.success && <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.success}</p>}
      <div className="mt-5 flex justify-end border-t border-slate-100 pt-4">
        <button disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
          {pending ? <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
          {pending ? (isArabic ? "جارٍ الحفظ..." : "Saving...") : (isArabic ? "تسجيل التحصيل" : "Save collection")}
        </button>
      </div>
    </form>
  );
}
