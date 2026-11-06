"use client";

import { useActionState } from "react";
import { LoaderCircle, Plus, Save } from "lucide-react";
import { createChequeAction, updateChequeStatusAction, type ChequeFormState } from "@/features/cheques/cheque.actions";
import { chequeStatusLabels } from "@/features/cheques/cheque-labels";

const egyptianBanks = [
  "البنك الأهلي المصري", "بنك مصر", "بنك القاهرة", "البنك التجاري الدولي (CIB)", "بنك الإسكندرية",
  "بنك قطر الوطني الأهلي (QNB)", "بنك فيصل الإسلامي", "مصرف أبوظبي الإسلامي", "بنك البركة", "البنك العربي الأفريقي الدولي",
  "بنك التعمير والإسكان", "البنك الزراعي المصري", "بنك المشرق", "بنك الكويت الوطني", "بنك HSBC مصر"
];

export function ChequeCreateForm({ locale, today }: { locale: "ar" | "en"; today: string }) {
  const [state, action, pending] = useActionState(createChequeAction, {} as ChequeFormState);
  const isArabic = locale === "ar";
  const fields = [
    { name: "companyName", label: isArabic ? "اسم الشركة" : "Company name", props: { maxLength: 150, minLength: 2 } },
    { name: "amount", label: isArabic ? "المبلغ (ج.م)" : "Amount (EGP)", props: { type: "number", min: "0.01", step: "0.01", dir: "ltr" } },
    { name: "chequeDate", label: isArabic ? "التاريخ" : "Date", props: { type: "date", defaultValue: today } },
    { name: "chequeNumber", label: isArabic ? "رقم الشيك" : "Cheque number", props: { maxLength: 40, dir: "ltr", inputMode: "numeric" as const } },
    { name: "bankName", label: isArabic ? "اسم البنك" : "Bank name", props: { maxLength: 120, minLength: 2, list: "cheque-bank-options" } }
  ] as const;

  return (
    <form action={action} aria-busy={pending} className="rounded-xl border border-slate-200 bg-white p-5 shadow-panel">
      <input type="hidden" name="locale" value={locale} />
      <div className="mb-4 flex items-center gap-2"><Plus size={18} className="text-brand-700" aria-hidden="true" /><h2 className="text-sm font-bold text-slate-800">{isArabic ? "تسجيل شيك جديد" : "Record a cheque"}</h2></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {fields.map((field) => (
          <label key={field.name} className="space-y-1.5 text-xs font-medium text-slate-600">
            <span>{field.label}<span className="ms-1 text-red-600">*</span></span>
            <input name={field.name} required {...field.props} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100" />
            {state.fieldErrors?.[field.name]?.[0] && <span role="alert" className="block text-[11px] font-normal text-red-600">{state.fieldErrors[field.name]?.[0]}</span>}
          </label>
        ))}
      </div>
      <datalist id="cheque-bank-options">{egyptianBanks.map((bank) => <option key={bank} value={bank} />)}</datalist>
      <label className="mt-3 block space-y-1.5 text-xs font-medium text-slate-600">
        <span>{isArabic ? "ملاحظات (اختياري)" : "Notes (optional)"}</span>
        <input name="notes" maxLength={500} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100" />
      </label>
      {state.error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.success && <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.success}</p>}
      <div className="mt-4 flex justify-end">
        <button disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 disabled:cursor-wait disabled:opacity-60">
          {pending ? <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Save size={15} aria-hidden="true" />}
          {pending ? (isArabic ? "جارٍ الحفظ..." : "Saving...") : (isArabic ? "حفظ الشيك" : "Save cheque")}
        </button>
      </div>
    </form>
  );
}

export function ChequeStatusForm({ locale, chequeId, status }: { locale: "ar" | "en"; chequeId: string; status: "PENDING" | "CLEARED" | "BOUNCED" }) {
  const [state, action, pending] = useActionState(updateChequeStatusAction, {} as ChequeFormState);
  const labels = chequeStatusLabels[locale];
  return (
    <form action={action} aria-busy={pending} className="flex items-center gap-1.5">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="chequeId" value={chequeId} />
      <select name="status" defaultValue={status} disabled={pending} aria-label={locale === "ar" ? "حالة الشيك" : "Cheque status"} className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs">
        {(Object.keys(labels) as (keyof typeof labels)[]).map((key) => <option key={key} value={key}>{labels[key]}</option>)}
      </select>
      <button disabled={pending} aria-label={locale === "ar" ? "حفظ الحالة" : "Save status"} className="inline-flex h-9 items-center rounded-md border border-slate-200 px-2 text-brand-700 hover:bg-brand-50 disabled:opacity-50">
        {pending ? <LoaderCircle size={13} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Save size={13} aria-hidden="true" />}
      </button>
      {state.error && <span role="alert" className="text-[11px] text-rose-700">{state.error}</span>}
    </form>
  );
}
