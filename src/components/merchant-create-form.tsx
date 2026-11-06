"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowRight, LoaderCircle, Save } from "lucide-react";
import { createMerchantAction, type MerchantFormState } from "@/features/merchants/merchant.actions";

const initialState: MerchantFormState = {};

export function MerchantCreateForm({ locale }: { locale: "ar" | "en" }) {
  const [state, action, pending] = useActionState(createMerchantAction, initialState);
  const isArabic = locale === "ar";
  const text = isArabic
    ? { name: "اسم التاجر", phone: "رقم الجوال", alternatePhone: "رقم بديل (اختياري)", city: "المدينة", region: "الحي / المنطقة", address: "العنوان", taxNumber: "رقم التسجيل الضريبي (اختياري)", notes: "ملاحظات", cancel: "إلغاء", save: "حفظ التاجر", error: "تحقق من البيانات المدخلة ثم حاول مرة أخرى.", saving: "جارٍ الحفظ..." }
    : { name: "Merchant name", phone: "Phone number", alternatePhone: "Alternate phone (optional)", city: "City", region: "District / region", address: "Address", taxNumber: "Tax registration number (optional)", notes: "Notes", cancel: "Cancel", save: "Save merchant", error: "Check the entered details and try again.", saving: "Saving..." };
  const fields = [
    { name: "name", label: text.name, required: true },
    { name: "phone", label: text.phone, required: true },
    { name: "alternatePhone", label: text.alternatePhone },
    { name: "city", label: text.city },
    { name: "region", label: text.region },
    { name: "taxNumber", label: text.taxNumber },
    { name: "address", label: text.address, wide: true }
  ] as const;

  return (
    <form action={action} aria-busy={pending} className="rounded-xl border border-slate-200 bg-white p-5 shadow-panel sm:p-7">
      <input type="hidden" name="locale" value={locale} />
      <div className="grid gap-5 sm:grid-cols-2">
        {fields.map((field) => {
          const required = "required" in field && field.required;
          const wide = "wide" in field && field.wide;
          const fieldError = state.fieldErrors?.[field.name]?.[0];
          return (
            <label key={field.name} className={`block space-y-2 text-sm font-medium text-slate-700 ${wide ? "sm:col-span-2" : ""}`}>
              <span>{field.label}{required ? <span className="ms-1 text-red-600">*</span> : null}</span>
              <input name={field.name} required={required} maxLength={field.name === "name" ? 150 : field.name === "address" ? 240 : 100} dir={field.name === "taxNumber" ? "ltr" : undefined} className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100" />
              {fieldError && <span role="alert" className="block text-xs font-normal text-red-600">{fieldError}</span>}
            </label>
          );
        })}
        <label className="block space-y-2 text-sm font-medium text-slate-700 sm:col-span-2">
          <span>{text.notes}</span>
          <textarea name="notes" rows={3} maxLength={1000} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100" />
        </label>
      </div>
      {state.error && <p role="alert" className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error || text.error}</p>}
      <div className="mt-7 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-5">
        <Link href={`/${locale}/merchants`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm text-slate-600 hover:bg-slate-50"><ArrowRight size={15} aria-hidden="true" />{text.cancel}</Link>
        <button disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 disabled:cursor-wait disabled:opacity-70">
          {pending ? <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
          {pending ? text.saving : text.save}
        </button>
      </div>
      {pending && <p role="status" aria-live="polite" className="mt-3 text-end text-xs text-brand-700">{isArabic ? "جارٍ حفظ التاجر ثم فتح ملفه..." : "Saving merchant and opening its profile..."}</p>}
    </form>
  );
}
