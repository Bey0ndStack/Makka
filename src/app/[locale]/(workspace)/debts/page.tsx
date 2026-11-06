import Link from "next/link";
import Form from "next/form";
import { Search } from "lucide-react";
import { BrandSectionBadge } from "@/components/brand-section-badge";
import { getDebtDirectory, type DebtAging } from "@/features/finance/debt.service";
import { formatCurrency, formatDate } from "@/lib/format";
import { isLocale, translate, type Locale } from "@/lib/i18n";
import { requirePermission } from "@/lib/permissions";
import { notFound } from "next/navigation";

const agingOptions: DebtAging[] = ["all", "0-30", "31-60", "61-90", "90+"];

export default async function DebtsPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; aging?: string; page?: string }>;
}) {
  const [{ locale: rawLocale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  await requirePermission("debt.read", locale);

  const isArabic = locale === "ar";
  const aging = agingOptions.includes(query.aging as DebtAging) ? query.aging as DebtAging : "all";
  const page = Math.min(100_000, Math.max(1, Number.isSafeInteger(Number(query.page)) ? Number(query.page) : 1));
  const data = await getDebtDirectory((query.q ?? "").slice(0, 100), aging, page, 20);
  const agingLabels: Record<DebtAging, string> = {
    all: isArabic ? "كل الأرصدة" : "All balances",
    "0-30": isArabic ? "متأخر 0–30 يومًا" : "1–30 days overdue",
    "31-60": isArabic ? "متأخر 31–60 يومًا" : "31–60 days overdue",
    "61-90": isArabic ? "متأخر 61–90 يومًا" : "61–90 days overdue",
    "90+": isArabic ? "متأخر أكثر من 90 يومًا" : "Over 90 days overdue"
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-xs font-medium text-brand-700">{isArabic ? "العمليات" : "Operations"}</p>
        <div className="flex items-center gap-3">
          <BrandSectionBadge section="debts" />
          <h1 className="text-2xl font-bold text-slate-900">{translate(locale, "debts")}</h1>
        </div>
        <p className="mt-1.5 text-sm text-slate-500">{isArabic ? "أرصدة محسوبة من الفواتير المؤكدة والتحصيلات المخصصة" : "Balances derived from confirmed invoices and allocated collections"}</p>
      </div>

      <Form action={`/${locale}/debts`} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-panel sm:grid-cols-[1fr_260px_auto]">
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3">
          <Search size={16} className="text-slate-400" aria-hidden="true" />
          <input name="q" defaultValue={query.q} maxLength={100} placeholder={isArabic ? "ابحث عن تاجر" : "Search merchants"} className="h-10 w-full bg-transparent text-sm outline-none" />
        </label>
        <label><span className="sr-only">{isArabic ? "عمر الدين" : "Debt age"}</span><select name="aging" defaultValue={aging} className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600">{agingOptions.map((option) => <option key={option} value={option}>{agingLabels[option]}</option>)}</select></label>
        <button className="h-11 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800">{isArabic ? "تطبيق" : "Apply"}</button>
      </Form>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-panel">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-bold text-slate-800">{agingLabels[aging]}</h2><span className="text-xs text-slate-400">{data.count} {isArabic ? "تاجر" : "merchants"}</span></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-start text-sm">
            <thead className="bg-sand text-xs text-slate-500"><tr>{[isArabic ? "التاجر" : "Merchant", isArabic ? "عدد الفواتير" : "Invoices", isArabic ? "إجمالي الفواتير" : "Invoice total", isArabic ? "إجمالي المسدد" : "Allocated", translate(locale, "balance"), isArabic ? "أقدم فاتورة غير مسددة" : "Oldest unpaid invoice"].map((label, index) => <th key={label} className={`px-5 py-3 font-medium ${index > 0 && index < 5 ? "text-right" : "text-start"}`}>{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.rows.map((merchant) => <tr key={merchant.id} className="hover:bg-sand/70">
                <td className="px-5 py-3.5"><Link href={`/${locale}/merchants/${merchant.id}`} className="font-semibold text-slate-800 hover:text-brand-700">{merchant.name}<span className="mt-1 block text-[11px] font-normal text-slate-400">{merchant.merchantCode} · {merchant.city ?? ""}</span></Link></td>
                <td className="px-5 py-3.5 text-right tabular-nums text-slate-600">{merchant.invoiceCount}</td>
                <td className="px-5 py-3.5 text-right tabular-nums text-slate-600" dir="ltr">{formatCurrency(merchant.totalInvoices, locale)}</td>
                <td className="px-5 py-3.5 text-right tabular-nums text-slate-600" dir="ltr">{formatCurrency(merchant.totalPaid, locale)}</td>
                <td className="px-5 py-3.5 text-right tabular-nums font-semibold text-slate-800" dir="ltr">{formatCurrency(merchant.outstanding, locale)}<span className="mt-1 block text-[10px] font-normal text-rose-600">{isArabic ? "متأخر" : "Past due"} {formatCurrency(merchant.overdue, locale)}</span></td>
                <td className="px-5 py-3.5 text-slate-500">{formatDate(merchant.oldestUnpaidDate, locale)}</td>
              </tr>)}
              {!data.rows.length && <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-400">{isArabic ? "لا توجد أرصدة مطابقة" : "No matching outstanding balances"}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          <span>{isArabic ? `صفحة ${page} من ${data.pageCount}` : `Page ${page} of ${data.pageCount}`}</span>
          <div className="flex gap-2">
            {page > 1 && <Link href={`?q=${encodeURIComponent(query.q ?? "")}&aging=${aging}&page=${page - 1}`} className="rounded-md border border-slate-200 px-3 py-1.5 hover:bg-sand">{isArabic ? "السابق" : "Previous"}</Link>}
            {page < data.pageCount && <Link href={`?q=${encodeURIComponent(query.q ?? "")}&aging=${aging}&page=${page + 1}`} className="rounded-md border border-slate-200 px-3 py-1.5 hover:bg-sand">{isArabic ? "التالي" : "Next"}</Link>}
          </div>
        </div>
      </section>
    </div>
  );
}
