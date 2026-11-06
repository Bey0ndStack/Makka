import Link from "next/link";
import { ArrowRight, ArrowUpLeft, FileText, MapPin, Phone, Store } from "lucide-react";
import { getMerchantDetails } from "@/features/merchants/merchant.service";
import { calculateOutstanding } from "@/features/finance/balance";
import { formatCurrency, formatDate } from "@/lib/format";
import { isLocale, translate, type Locale } from "@/lib/i18n";
import { requirePermission } from "@/lib/permissions";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";

export default async function MerchantDetailsPage({
  params
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: rawLocale, id } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  await requirePermission("merchant.read", locale);
  const result = await getMerchantDetails(id);
  if (!result) notFound();
  const { merchant, totals } = result;

  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const isArabic = locale === "ar";

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/${locale}/merchants`} className="mb-4 inline-flex items-center gap-2 text-xs text-slate-500 hover:text-brand-700"><ArrowRight size={14} aria-hidden="true" />{isArabic ? "العودة إلى التجار" : "Back to merchants"}</Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Store size={22} aria-hidden="true" /></span>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{merchant.name}</h1>
              <p className="mt-1 text-xs text-slate-400">{merchant.merchantCode} · {isArabic ? "أُضيف" : "Added"} {formatDate(merchant.createdAt, locale)}</p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">{merchant.status === "ACTIVE" ? (isArabic ? "نشط" : "Active") : merchant.status}</span>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { label: isArabic ? "إجمالي الفواتير" : "Total invoices", value: formatCurrency(totals.totalInvoices, locale) },
          { label: isArabic ? "إجمالي المسدد" : "Total allocated", value: formatCurrency(totals.totalPaid, locale) },
          { label: t("balance"), value: formatCurrency(totals.outstanding, locale) }
        ].map((metric) => <article key={metric.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-panel"><p className="text-xs text-slate-500">{metric.label}</p><p className="mt-3 text-xl font-bold text-slate-900" dir="ltr">{metric.value}</p></article>)}
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.75fr_1.25fr]">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-panel">
          <h2 className="mb-4 text-sm font-bold text-slate-800">{isArabic ? "معلومات التاجر" : "Merchant details"}</h2>
          <div className="space-y-4 text-sm">
            <p className="flex items-center gap-3 text-slate-600"><Phone size={16} className="text-slate-400" aria-hidden="true" /><span dir="ltr">{merchant.phone}</span></p>
            {(merchant.city || merchant.region || merchant.address) && <p className="flex items-start gap-3 text-slate-600"><MapPin size={16} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" /><span>{[merchant.address, merchant.region, merchant.city].filter(Boolean).join(" · ")}</span></p>}
            {merchant.taxNumber && <p className="flex items-center gap-3 text-slate-600"><FileText size={16} className="text-slate-400" aria-hidden="true" /><span>{isArabic ? "رقم التسجيل الضريبي" : "Tax registration no."}: <span dir="ltr">{merchant.taxNumber}</span></span></p>}
            {merchant.notes && <p className="border-t border-slate-100 pt-4 leading-6 text-slate-500">{merchant.notes}</p>}
          </div>
        </article>

        <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-panel">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-bold text-slate-800">{isArabic ? "الفواتير" : "Invoices"}</h2><p className="mt-1 text-xs text-slate-400">{isArabic ? "آخر 20 فاتورة مؤكدة" : "Latest 20 confirmed invoices"}</p></div>
          <div className="divide-y divide-slate-100">
            {merchant.invoices.map((invoice) => {
              const paid = invoice.allocations.reduce((sum, allocation) => sum.plus(allocation.amount), new Prisma.Decimal(0));
              const remaining = calculateOutstanding(invoice.totalAmount, [paid]);
              return <div key={invoice.id} className="flex items-center gap-3 px-5 py-3.5"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sand text-slate-500"><FileText size={17} aria-hidden="true" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-800">{invoice.invoiceNumber}</span><span className="mt-1 block text-[11px] text-slate-400">{formatDate(invoice.transactionDate, locale)}</span></span><span className="text-end"><span className="block text-sm font-semibold text-slate-800" dir="ltr">{formatCurrency(invoice.totalAmount.toString(), locale)}</span><span className="mt-1 block text-[11px] text-slate-400">{isArabic ? "متبقي" : "Remaining"} {formatCurrency(remaining.toString(), locale)}</span></span></div>;
            })}
            {!merchant.invoices.length && <p className="px-5 py-10 text-center text-sm text-slate-400">{t("noData")}</p>}
          </div>
        </article>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-panel">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="text-sm font-bold text-slate-800">{isArabic ? "التحصيلات" : "Collections"}</h2><p className="mt-1 text-xs text-slate-400">{isArabic ? "آخر 20 دفعة مسجلة" : "Latest 20 recorded payments"}</p></div><Link href={`/${locale}/payments`} className="flex items-center gap-1 text-xs font-semibold text-brand-700">{t("viewAll")}<ArrowUpLeft size={14} aria-hidden="true" /></Link></div>
        <div className="divide-y divide-slate-100">
          {merchant.payments.map((payment) => <div key={payment.id} className="flex items-center gap-3 px-5 py-3.5"><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-800">{payment.reference ?? payment.id.slice(0, 10)}</span><span className="mt-1 block text-[11px] text-slate-400">{formatDate(payment.paymentDate, locale)} · {payment.paymentMethod}</span></span><span className="text-sm font-bold text-brand-700" dir="ltr">{formatCurrency(payment.amount.toString(), locale)}</span></div>)}
          {!merchant.payments.length && <p className="px-5 py-10 text-center text-sm text-slate-400">{t("noData")}</p>}
        </div>
      </section>
    </div>
  );
}
