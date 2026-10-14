"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import { createInvoiceAction, updateInvoiceAction } from "@/features/finance/invoice.actions";
import { formatCurrency } from "@/lib/format";

type Line = { description: string; quantity: string; unitPrice: string };
type MerchantOption = { id: string; name: string; merchantCode: string };
type ExistingInvoice = {
  id: string;
  merchantId: string;
  transactionDate: string;
  dueDate: string;
  status: "DRAFT" | "CONFIRMED";
  notes: string;
  items: Line[];
};

export function InvoiceEditorForm({
  locale,
  merchants,
  invoice
}: {
  locale: "ar" | "en";
  merchants: MerchantOption[];
  invoice?: ExistingInvoice;
}) {
  const actionFn = invoice ? updateInvoiceAction : createInvoiceAction;
  const [state, action, pending] = useActionState(actionFn, {});
  const [items, setItems] = useState<Line[]>(invoice?.items.length ? invoice.items : [{ description: "", quantity: "1", unitPrice: "" }]);
  const isArabic = locale === "ar";
  const total = useMemo(() => items.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0), 0), [items]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  return (
    <form action={action} aria-busy={pending} className="rounded-xl border border-slate-200 bg-white p-5 shadow-panel sm:p-7">
      <input type="hidden" name="locale" value={locale} />
      {invoice && <input type="hidden" name="invoiceId" value={invoice.id} />}
      <input type="hidden" name="items" value={JSON.stringify(items)} />
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-medium text-slate-700 sm:col-span-2">
          <span>{isArabic ? "التاجر" : "Merchant"}</span>
          <select name="merchantId" required defaultValue={invoice?.merchantId ?? ""} className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3">
            <option value="">{isArabic ? "اختر التاجر" : "Select a merchant"}</option>
            {merchants.map((merchant) => <option key={merchant.id} value={merchant.id}>{merchant.name} · {merchant.merchantCode}</option>)}
          </select>
        </label>
        <label className="space-y-2 text-sm font-medium text-slate-700">
          <span>{isArabic ? "تاريخ الفاتورة" : "Invoice date"}</span>
          <input name="transactionDate" type="date" required defaultValue={invoice?.transactionDate ?? today} className="h-11 w-full rounded-lg border border-slate-200 px-3" />
        </label>
        <label className="space-y-2 text-sm font-medium text-slate-700">
          <span>{isArabic ? "تاريخ الاستحقاق (اختياري)" : "Due date (optional)"}</span>
          <input name="dueDate" type="date" defaultValue={invoice?.dueDate ?? ""} className="h-11 w-full rounded-lg border border-slate-200 px-3" />
        </label>
        <label className="space-y-2 text-sm font-medium text-slate-700">
          <span>{isArabic ? "الحالة" : "Status"}</span>
          <select name="status" defaultValue={invoice?.status ?? "CONFIRMED"} className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3">
            <option value="DRAFT">{isArabic ? "مسودة" : "Draft"}</option>
            <option value="CONFIRMED">{isArabic ? "مؤكدة" : "Confirmed"}</option>
          </select>
        </label>
        <label className="space-y-2 text-sm font-medium text-slate-700">
          <span>{isArabic ? "ملاحظات (اختياري)" : "Notes (optional)"}</span>
          <input name="notes" maxLength={1000} defaultValue={invoice?.notes ?? ""} className="h-11 w-full rounded-lg border border-slate-200 px-3" />
        </label>
      </div>
      <section className="mt-7 rounded-lg border border-slate-100 bg-slate-50/60 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-800">{isArabic ? "بنود الفاتورة" : "Invoice line items"}</h2>
          <button type="button" onClick={() => setItems((current) => [...current, { description: "", quantity: "1", unitPrice: "" }])} disabled={items.length >= 100} className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-brand-700 disabled:opacity-50"><Plus size={14} aria-hidden="true" />{isArabic ? "إضافة بند" : "Add line"}</button>
        </div>
        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={index} className="grid gap-2 rounded-lg border border-slate-100 bg-white p-3 sm:grid-cols-[1fr_110px_150px_auto]">
              <label className="space-y-1 text-xs text-slate-500"><span>{isArabic ? "الوصف" : "Description"}</span><input required maxLength={200} value={item.description} onChange={(event) => setItems((current) => current.map((line, i) => i === index ? { ...line, description: event.target.value } : line))} className="h-10 w-full rounded-md border border-slate-200 px-2 text-sm text-slate-800" /></label>
              <label className="space-y-1 text-xs text-slate-500"><span>{isArabic ? "الكمية" : "Quantity"}</span><input required type="number" min="0.001" step="0.001" value={item.quantity} onChange={(event) => setItems((current) => current.map((line, i) => i === index ? { ...line, quantity: event.target.value } : line))} className="h-10 w-full rounded-md border border-slate-200 px-2 text-sm text-slate-800" /></label>
              <label className="space-y-1 text-xs text-slate-500"><span>{isArabic ? "سعر الوحدة (ج.م)" : "Unit price (EGP)"}</span><input required type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => setItems((current) => current.map((line, i) => i === index ? { ...line, unitPrice: event.target.value } : line))} className="h-10 w-full rounded-md border border-slate-200 px-2 text-sm text-slate-800" /></label>
              <button type="button" aria-label={isArabic ? "حذف البند" : "Remove line"} disabled={items.length < 2} onClick={() => setItems((current) => current.filter((_, i) => i !== index))} className="mt-5 flex h-9 items-center justify-center rounded-md px-2 text-slate-400 hover:text-rose-700 disabled:opacity-30"><Trash2 size={15} aria-hidden="true" /></button>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3 text-sm">
          <span className="font-semibold text-slate-700">{isArabic ? "الإجمالي" : "Total"}</span>
          <span className="font-bold text-slate-900" dir="ltr">{formatCurrency(total, locale)}</span>
        </div>
      </section>
      {state.error && <p role="alert" className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.success && <p role="status" className="mt-5 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.success}</p>}
      <div className="mt-7 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-5">
        <Link href={`/${locale}/invoices`} className="inline-flex h-10 items-center rounded-lg border border-slate-200 px-4 text-sm text-slate-600 hover:bg-slate-50">{isArabic ? "إلغاء" : "Cancel"}</Link>
        <button disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
          {pending ? <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
          {pending ? (isArabic ? "جارٍ الحفظ..." : "Saving...") : (isArabic ? "حفظ الفاتورة" : "Save invoice")}
        </button>
      </div>
      {pending && <p role="status" aria-live="polite" className="mt-3 text-end text-xs text-brand-700">{isArabic ? "جارٍ حفظ الفاتورة وتحديث السجلات..." : "Saving invoice and updating records..."}</p>}
    </form>
  );
}
