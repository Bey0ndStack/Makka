import Link from "next/link";
import { Plus, Search, Store } from "lucide-react";
import { BrandSectionBadge } from "@/components/brand-section-badge";
import { getMerchantDirectory } from "@/features/merchants/merchant.service";
import { formatCurrency, formatDate } from "@/lib/format";
import { isLocale, translate, type Locale } from "@/lib/i18n";
import { requirePermission, userHasPermission } from "@/lib/permissions";
import { notFound } from "next/navigation";

export default async function MerchantsPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const [{ locale: rawLocale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  const actor = await requirePermission("merchant.read", locale);

  const page = Math.min(100_000, Math.max(1, Number.isSafeInteger(Number(query.page)) ? Number(query.page) : 1));
  const [data, mayCreate] = await Promise.all([
    getMerchantDirectory((query.q ?? "").slice(0, 100), page, 15),
    userHasPermission(actor.id, "merchant.create")
  ]);
  const isArabic = locale === "ar";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-2 text-xs font-medium text-brand-700">{isArabic ? "العمليات" : "Operations"}</p>
          <div className="flex items-center gap-3">
            <BrandSectionBadge section="merchants" />
            <h1 className="text-2xl font-bold text-slate-900">{translate(locale, "merchants")}</h1>
          </div>
          <p className="mt-1.5 text-sm text-slate-500">{isArabic ? "إدارة بيانات التجار ومتابعة الأرصدة المستحقة" : "Manage merchant records and track outstanding balances"}</p>
        </div>
        {mayCreate && <Link href={`/${locale}/merchants/new`} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"><Plus size={16} aria-hidden="true" />{isArabic ? "إضافة تاجر" : "Add merchant"}</Link>}
      </div>

      <form className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-panel">
        <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-slate-200 px-3">
          <Search size={16} className="text-slate-400" aria-hidden="true" />
          <input name="q" defaultValue={query.q} placeholder={isArabic ? "ابحث بالاسم أو الرمز أو الجوال" : "Search name, code, or phone"} className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
        </label>
        <button className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-600 hover:bg-sand">{isArabic ? "بحث" : "Search"}</button>
      </form>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-panel">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-bold text-slate-800">{isArabic ? "قائمة التجار" : "Merchant directory"}</h2>
          <span className="text-xs text-slate-400">{data.count} {isArabic ? "تاجر" : "merchants"}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-start text-sm">
            <thead className="bg-sand text-xs text-slate-500">
              <tr>
                {[isArabic ? "التاجر" : "Merchant", isArabic ? "رقم الجوال" : "Phone", isArabic ? "الموقع" : "Location", translate(locale, "balance"), isArabic ? "آخر معاملة" : "Last transaction", isArabic ? "الحالة" : "Status"].map((heading, index) => <th key={heading} className={`px-5 py-3 font-medium ${index === 1 || index === 3 ? "text-right" : "text-start"}`}>{heading}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.rows.map((merchant) => (
                <tr key={merchant.id} className="hover:bg-sand/70">
                  <td className="px-5 py-3.5">
                    <Link href={`/${locale}/merchants/${merchant.id}`} className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><Store size={16} aria-hidden="true" /></span>
                      <span><span className="block font-semibold text-slate-800">{merchant.name}</span><span className="mt-1 block text-[11px] text-slate-400">{merchant.merchantCode}</span></span>
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 text-right text-slate-600" dir="ltr">{merchant.phone}</td>
                  <td className="px-5 py-3.5 text-slate-600">{[merchant.city, merchant.region].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="px-5 py-3.5 text-right font-semibold text-slate-800" dir="ltr">{formatCurrency(merchant.outstanding, locale)}</td>
                  <td className="px-5 py-3.5 text-slate-500">{merchant.lastTransactionAt ? formatDate(merchant.lastTransactionAt, locale) : "—"}</td>
                  <td className="px-5 py-3.5"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">{isArabic ? "نشط" : "Active"}</span></td>
                </tr>
              ))}
              {!data.rows.length && <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-400">{isArabic ? "لم يتم العثور على تجار" : "No merchants found"}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          <span>{isArabic ? `صفحة ${page} من ${data.pageCount}` : `Page ${page} of ${data.pageCount}`}</span>
          <div className="flex gap-2">
            {page > 1 && <Link href={`?q=${encodeURIComponent(query.q ?? "")}&page=${page - 1}`} className="rounded-md border border-slate-200 px-3 py-1.5 hover:bg-sand">{isArabic ? "السابق" : "Previous"}</Link>}
            {page < data.pageCount && <Link href={`?q=${encodeURIComponent(query.q ?? "")}&page=${page + 1}`} className="rounded-md border border-slate-200 px-3 py-1.5 hover:bg-sand">{isArabic ? "التالي" : "Next"}</Link>}
          </div>
        </div>
      </section>
    </div>
  );
}
