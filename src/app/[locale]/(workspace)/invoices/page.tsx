import Link from "next/link";
import { Prisma } from "@prisma/client";
import { Plus, Search } from "lucide-react";
import { BrandSectionBadge } from "@/components/brand-section-badge";
import { calculateOutstanding } from "@/features/finance/balance";
import { formatCurrency, formatDate } from "@/lib/format";
import { isLocale, translate, type Locale } from "@/lib/i18n";
import { requirePermission, userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

const invoiceStatuses = ["DRAFT", "CONFIRMED", "CANCELLED"] as const;

export default async function InvoicesPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const [{ locale: rawLocale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  const actor = await requirePermission("invoice.read", locale);
  const canCreate = await userHasPermission(actor.id, "invoice.create");
  const isArabic = locale === "ar";
  const search = (query.q ?? "").trim().slice(0, 100);
  const status = invoiceStatuses.includes(query.status as (typeof invoiceStatuses)[number]) ? query.status as (typeof invoiceStatuses)[number] : undefined;
  const page = Math.min(100_000, Math.max(1, Number.isSafeInteger(Number(query.page)) ? Number(query.page) : 1));
  const where = {
    ...(status ? { status } : {}),
    ...(search ? {
      OR: [
        { invoiceNumber: { contains: search, mode: "insensitive" as const } },
        { merchant: { name: { contains: search, mode: "insensitive" as const } } },
        { merchant: { merchantCode: { contains: search, mode: "insensitive" as const } } }
      ]
    } : {})
  };
  const [invoices, count] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { transactionDate: "desc" },
      take: 20,
      skip: (page - 1) * 20,
      select: {
        id: true,
        invoiceNumber: true,
        transactionDate: true,
        totalAmount: true,
        status: true,
        merchant: { select: { id: true, name: true, merchantCode: true } },
        allocations: {
          where: { payment: { status: "COMPLETED" } },
          select: { amount: true }
        }
      }
    }),
    prisma.invoice.count({ where })
  ]);
  const pageCount = Math.max(1, Math.ceil(count / 20));
  const statusLabel: Record<string, string> = isArabic
    ? { DRAFT: "مسودة", CONFIRMED: "مؤكدة", CANCELLED: "ملغاة" }
    : { DRAFT: "Draft", CONFIRMED: "Confirmed", CANCELLED: "Cancelled" };

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-xs font-medium text-brand-700">{isArabic ? "العمليات" : "Operations"}</p>
        <div className="flex items-center gap-3">
          <BrandSectionBadge section="invoices" />
          <h1 className="text-2xl font-bold text-slate-900">{translate(locale, "invoices")}</h1>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-500">{isArabic ? "الفواتير المالية وسدادها المخصص لكل تاجر" : "Merchant invoices and the payments allocated to them"}</p>{canCreate && <Link href={`/${locale}/invoices/new`} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-700 px-3 text-sm font-semibold text-white hover:bg-brand-800"><Plus size={16} aria-hidden="true" />{isArabic ? "إنشاء فاتورة" : "Create invoice"}</Link>}</div>
      </div>
      <form className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-panel sm:grid-cols-[1fr_220px_auto]">
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3"><Search size={16} className="text-slate-400" aria-hidden="true" /><input name="q" defaultValue={query.q} maxLength={100} placeholder={isArabic ? "ابحث برقم الفاتورة أو التاجر" : "Search invoice or merchant"} className="h-10 w-full bg-transparent text-sm outline-none" /></label>
        <label><span className="sr-only">{isArabic ? "الحالة" : "Status"}</span><select name="status" defaultValue={status ?? ""} className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600"><option value="">{isArabic ? "كل الحالات" : "All statuses"}</option>{invoiceStatuses.map((item) => <option key={item} value={item}>{statusLabel[item]}</option>)}</select></label>
        <button className="h-11 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800">{isArabic ? "تطبيق" : "Apply"}</button>
      </form>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-panel">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-bold text-slate-800">{isArabic ? "قائمة الفواتير" : "Invoice register"}</h2><span className="text-xs text-slate-400">{count} {isArabic ? "فاتورة" : "invoices"}</span></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-start text-sm">
            <thead className="bg-sand text-xs text-slate-500"><tr>{[isArabic ? "رقم الفاتورة" : "Invoice", translate(locale, "merchant"), translate(locale, "date"), isArabic ? "القيمة" : "Amount", isArabic ? "المسدد" : "Allocated", isArabic ? "المتبقي" : "Remaining", isArabic ? "الحالة" : "Status"].map((label, index) => <th key={label} className={`px-5 py-3 font-medium ${index >= 3 && index <= 5 ? "text-right" : "text-start"}`}>{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map((invoice) => {
                const paid = invoice.allocations.reduce((sum, allocation) => sum.plus(allocation.amount), new Prisma.Decimal(0));
                const outstanding = calculateOutstanding(invoice.totalAmount, [paid]);
                return <tr key={invoice.id} className="hover:bg-sand/70">
                  <td className="px-5 py-3.5 font-semibold text-slate-800"><Link href={`/${locale}/invoices/${invoice.id}`} className="hover:text-brand-700">{invoice.invoiceNumber}</Link></td>
                  <td className="px-5 py-3.5"><Link href={`/${locale}/merchants/${invoice.merchant.id}`} className="text-slate-700 hover:text-brand-700">{invoice.merchant.name}<span className="mt-1 block text-[11px] text-slate-400">{invoice.merchant.merchantCode}</span></Link></td>
                  <td className="px-5 py-3.5 text-slate-500">{formatDate(invoice.transactionDate, locale)}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-slate-700" dir="ltr">{formatCurrency(invoice.totalAmount.toString(), locale)}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-slate-600" dir="ltr">{formatCurrency(paid.toString(), locale)}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums font-semibold text-slate-800" dir="ltr">{formatCurrency(outstanding.toString(), locale)}</td>
                  <td className="px-5 py-3.5"><span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${invoice.status === "CONFIRMED" ? "bg-emerald-50 text-emerald-700" : invoice.status === "CANCELLED" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{statusLabel[invoice.status]}</span></td>
                </tr>;
              })}
              {!invoices.length && <tr><td colSpan={7} className="px-5 py-12 text-center text-sm text-slate-400">{isArabic ? "لا توجد فواتير مطابقة" : "No matching invoices"}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500"><span>{isArabic ? `صفحة ${page} من ${pageCount}` : `Page ${page} of ${pageCount}`}</span><div className="flex gap-2">{page > 1 && <Link href={`?q=${encodeURIComponent(search)}&status=${status ?? ""}&page=${page - 1}`} className="rounded-md border border-slate-200 px-3 py-1.5 hover:bg-sand">{isArabic ? "السابق" : "Previous"}</Link>}{page < pageCount && <Link href={`?q=${encodeURIComponent(search)}&status=${status ?? ""}&page=${page + 1}`} className="rounded-md border border-slate-200 px-3 py-1.5 hover:bg-sand">{isArabic ? "التالي" : "Next"}</Link>}</div></div>
      </section>
    </div>
  );
}
