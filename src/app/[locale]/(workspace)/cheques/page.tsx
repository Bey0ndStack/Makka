import Link from "next/link";
import Form from "next/form";
import { Banknote, Search } from "lucide-react";
import { ChequeCreateForm, ChequeStatusForm } from "@/components/cheque-forms";
import { chequeStatusClasses, chequeStatusLabels } from "@/features/cheques/cheque-labels";
import { chequeStatuses, getChequeRegister } from "@/features/cheques/cheque.service";
import { formatCurrency, formatDate } from "@/lib/format";
import { isLocale, translate, type Locale } from "@/lib/i18n";
import { getUserPermissionKeys, requirePermission } from "@/lib/permissions";
import { notFound } from "next/navigation";

export default async function ChequesPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const [{ locale: rawLocale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  const actor = await requirePermission("cheque.read", locale);
  const isArabic = locale === "ar";
  const search = (query.q ?? "").trim().slice(0, 100);
  const status = chequeStatuses.find((item) => item === query.status);
  const page = Math.min(100_000, Math.max(1, Number.isSafeInteger(Number(query.page)) ? Number(query.page) : 1));
  const [data, permissions] = await Promise.all([getChequeRegister(search, status, page, 20), getUserPermissionKeys(actor.id)]);
  const canCreate = permissions.has("cheque.create");
  const canUpdate = permissions.has("cheque.update");
  const labels = chequeStatusLabels[locale];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const pageHref = (target: number) => `?${new URLSearchParams({ ...(search ? { q: search } : {}), ...(status ? { status } : {}), page: String(target) })}`;
  const headings = [
    isArabic ? "اسم الشركة" : "Company",
    isArabic ? "المبلغ" : "Amount",
    isArabic ? "التاريخ" : "Date",
    isArabic ? "رقم الشيك" : "Cheque no.",
    isArabic ? "اسم البنك" : "Bank",
    isArabic ? "الحالة" : "Status"
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-xs font-medium text-brand-700">{isArabic ? "العمليات" : "Operations"}</p>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100 sm:h-[52px] sm:w-[52px]"><Banknote size={24} aria-hidden="true" /></span>
          <h1 className="text-2xl font-bold text-slate-900">{translate(locale, "cheques")}</h1>
        </div>
        <p className="mt-1.5 text-sm text-slate-500">{isArabic ? "سجل الشيكات المستلمة ومتابعة صرفها" : "Received cheques and their clearing status"}</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        {chequeStatuses.map((key) => (
          <Link key={key} href={`?status=${key}`} className="rounded-xl border border-slate-200 bg-white p-5 shadow-panel transition hover:border-brand-200">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-slate-500">{labels[key]}</p>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${chequeStatusClasses[key]}`}>{data.totals[key].count}</span>
            </div>
            <p className="mt-3 text-xl font-bold text-slate-900" dir="ltr">{formatCurrency(data.totals[key].amount, locale)}</p>
          </Link>
        ))}
      </section>

      {canCreate && <ChequeCreateForm locale={locale} today={today} />}

      <Form action={`/${locale}/cheques`} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-panel sm:grid-cols-[1fr_220px_auto]">
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3"><Search size={16} className="text-slate-400" aria-hidden="true" /><input name="q" defaultValue={search} maxLength={100} placeholder={isArabic ? "ابحث بالشركة أو رقم الشيك أو البنك" : "Search company, cheque number or bank"} className="h-10 w-full bg-transparent text-sm outline-none" /></label>
        <label><span className="sr-only">{isArabic ? "الحالة" : "Status"}</span><select name="status" defaultValue={status ?? ""} className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600"><option value="">{isArabic ? "كل الحالات" : "All statuses"}</option>{chequeStatuses.map((key) => <option key={key} value={key}>{labels[key]}</option>)}</select></label>
        <button className="h-11 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800">{isArabic ? "تطبيق" : "Apply"}</button>
      </Form>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-panel">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-bold text-slate-800">{isArabic ? "سجل الشيكات" : "Cheque register"}</h2><span className="text-xs text-slate-400">{data.count} {isArabic ? "شيك" : "cheques"}</span></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-start text-sm">
            <thead className="bg-sand text-xs text-slate-500"><tr>{headings.map((label, index) => <th key={label} className={`px-5 py-3 font-medium ${index === 1 ? "text-right" : "text-start"}`}>{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.rows.map((cheque) => (
                <tr key={cheque.id} className="hover:bg-sand/70">
                  <td className="px-5 py-3.5 font-semibold text-slate-800">{cheque.companyName}{cheque.notes && <span className="mt-1 block max-w-60 truncate text-[11px] font-normal text-slate-400">{cheque.notes}</span>}</td>
                  <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-slate-800" dir="ltr">{formatCurrency(cheque.amount.toString(), locale)}</td>
                  <td className="px-5 py-3.5 text-slate-600">{formatDate(cheque.chequeDate, locale)}</td>
                  <td className="px-5 py-3.5 tabular-nums text-slate-700" dir="ltr">{cheque.chequeNumber}</td>
                  <td className="px-5 py-3.5 text-slate-600">{cheque.bankName}</td>
                  <td className="px-5 py-3.5">{canUpdate
                    ? <ChequeStatusForm locale={locale} chequeId={cheque.id} status={cheque.status} />
                    : <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${chequeStatusClasses[cheque.status]}`}>{labels[cheque.status]}</span>}</td>
                </tr>
              ))}
              {!data.rows.length && <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-400">{isArabic ? "لا توجد شيكات مطابقة" : "No matching cheques"}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          <span>{isArabic ? `صفحة ${page} من ${data.pageCount}` : `Page ${page} of ${data.pageCount}`}</span>
          <div className="flex gap-2">
            {page > 1 && <Link href={pageHref(page - 1)} className="rounded-md border border-slate-200 px-3 py-1.5 hover:bg-sand">{isArabic ? "السابق" : "Previous"}</Link>}
            {page < data.pageCount && <Link href={pageHref(page + 1)} className="rounded-md border border-slate-200 px-3 py-1.5 hover:bg-sand">{isArabic ? "التالي" : "Next"}</Link>}
          </div>
        </div>
      </section>
    </div>
  );
}
