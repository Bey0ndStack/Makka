import { Suspense } from "react";
import { Prisma } from "@prisma/client";
import { Search } from "lucide-react";
import { BrandSectionBadge } from "@/components/brand-section-badge";
import { PaymentCreatePanel } from "@/components/payment-create-panel";
import { PaymentReverseForm } from "@/components/payment-reverse-form";
import { formatCurrency, formatDate } from "@/lib/format";
import { isLocale, translate, type Locale } from "@/lib/i18n";
import { getUserPermissionKeys, requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

const paymentStatuses = ["COMPLETED", "REVERSED"] as const;

export default async function PaymentsPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const [{ locale: rawLocale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  const actor = await requirePermission("payment.read", locale);
  const permissions = await getUserPermissionKeys(actor.id);
  const canReverse = permissions.has("payment.reverse");
  const isArabic = locale === "ar";
  const search = (query.q ?? "").trim().slice(0, 100);
  const status = paymentStatuses.includes(query.status as (typeof paymentStatuses)[number]) ? query.status as (typeof paymentStatuses)[number] : undefined;
  const page = Math.min(100_000, Math.max(1, Number.isSafeInteger(Number(query.page)) ? Number(query.page) : 1));
  const where = {
    ...(status ? { status } : {}),
    ...(search ? { OR: [
      { reference: { contains: search, mode: "insensitive" as const } },
      { merchant: { name: { contains: search, mode: "insensitive" as const } } },
      { merchant: { merchantCode: { contains: search, mode: "insensitive" as const } } }
    ] } : {})
  };
  const [payments, count] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { paymentDate: "desc" },
      take: 20,
      skip: (page - 1) * 20,
      select: {
        id: true,
        amount: true,
        paymentDate: true,
        paymentMethod: true,
        reference: true,
        status: true,
        reversalReason: true,
        merchant: { select: { id: true, name: true, merchantCode: true } },
        createdBy: { select: { name: true } },
        allocations: { select: { amount: true } }
      }
    }),
    prisma.payment.count({ where })
  ]);
  const pageCount = Math.max(1, Math.ceil(count / 20));
  const methods: Record<string, string> = isArabic
    ? { CASH: "نقدًا", BANK_TRANSFER: "تحويل بنكي", CARD: "بطاقة", OTHER: "أخرى" }
    : { CASH: "Cash", BANK_TRANSFER: "Bank transfer", CARD: "Card", OTHER: "Other" };
  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-xs font-medium text-brand-700">{isArabic ? "العمليات" : "Operations"}</p>
        <div className="flex items-center gap-3">
          <BrandSectionBadge section="payments" />
          <h1 className="text-2xl font-bold text-slate-900">{translate(locale, "payments")}</h1>
        </div>
        <p className="mt-1.5 text-sm text-slate-500">{isArabic ? "الدفعات المستلمة وتوزيعها على الفواتير" : "Received payments and their invoice allocations"}</p>
      </div>
      {permissions.has("payment.create") && (
        <Suspense fallback={<div aria-hidden="true" className="h-56 animate-pulse rounded-xl border border-slate-200 bg-white" />}>
          <PaymentCreatePanel locale={locale} actorId={actor.id} />
        </Suspense>
      )}
      <form className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-panel sm:grid-cols-[1fr_220px_auto]">
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3"><Search size={16} className="text-slate-400" aria-hidden="true" /><input name="q" defaultValue={query.q} maxLength={100} placeholder={isArabic ? "ابحث برقم الإيصال أو التاجر" : "Search receipt or merchant"} className="h-10 w-full bg-transparent text-sm outline-none" /></label>
        <label><span className="sr-only">{isArabic ? "الحالة" : "Status"}</span><select name="status" defaultValue={status ?? ""} className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600"><option value="">{isArabic ? "كل الحالات" : "All statuses"}</option><option value="COMPLETED">{isArabic ? "مكتملة" : "Completed"}</option><option value="REVERSED">{isArabic ? "معكوسة" : "Reversed"}</option></select></label>
        <button className="h-11 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800">{isArabic ? "تطبيق" : "Apply"}</button>
      </form>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-panel">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-bold text-slate-800">{isArabic ? "سجل التحصيلات" : "Collection register"}</h2><span className="text-xs text-slate-400">{count} {isArabic ? "عملية" : "payments"}</span></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-start text-sm">
            <thead className="bg-sand text-xs text-slate-500"><tr>{[isArabic ? "رقم الإيصال" : "Receipt", translate(locale, "merchant"), translate(locale, "date"), isArabic ? "الطريقة" : "Method", isArabic ? "المبلغ" : "Amount", isArabic ? "المخصص للفواتير" : "Allocated", isArabic ? "الحالة" : "Status", ...(canReverse ? [isArabic ? "إجراء" : "Action"] : [])].map((label, index) => <th key={`${label}-${index}`} className={`px-5 py-3 font-medium ${index === 4 || index === 5 ? "text-right" : "text-start"}`}>{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {payments.map((payment) => {
                const allocated = payment.allocations.reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
                return <tr key={payment.id} className="hover:bg-sand/70">
                  <td className="px-5 py-3.5 font-semibold text-slate-800">{payment.reference ?? payment.id.slice(0, 10)}{payment.status === "REVERSED" && payment.reversalReason ? <span className="mt-1 block max-w-48 truncate text-[10px] font-normal text-rose-600">{payment.reversalReason}</span> : null}</td>
                  <td className="px-5 py-3.5"><a href={`/${locale}/merchants/${payment.merchant.id}`} className="text-slate-700 hover:text-brand-700">{payment.merchant.name}<span className="mt-1 block text-[11px] text-slate-400">{payment.merchant.merchantCode}</span></a></td>
                  <td className="px-5 py-3.5 text-slate-500">{formatDate(payment.paymentDate, locale)}<span className="mt-1 block text-[10px] text-slate-400">{payment.createdBy?.name ?? "—"}</span></td>
                  <td className="px-5 py-3.5 text-slate-600">{methods[payment.paymentMethod]}</td>
                  <td className="px-5 py-3.5 text-right font-semibold text-slate-800" dir="ltr">{formatCurrency(payment.amount.toString(), locale)}</td>
                  <td className="px-5 py-3.5 text-right text-slate-600" dir="ltr">{formatCurrency(allocated.toString(), locale)}</td>
                  <td className="px-5 py-3.5"><span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${payment.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{payment.status === "COMPLETED" ? (isArabic ? "مكتملة" : "Completed") : (isArabic ? "معكوسة" : "Reversed")}</span></td>
                  {canReverse && <td className="px-5 py-3.5">{payment.status === "COMPLETED" ? <PaymentReverseForm paymentId={payment.id} locale={locale} /> : <span className="text-xs text-slate-400">—</span>}</td>}
                </tr>;
              })}
              {!payments.length && <tr><td colSpan={canReverse ? 8 : 7} className="px-5 py-12 text-center text-sm text-slate-400">{isArabic ? "لا توجد تحصيلات مطابقة" : "No matching collections"}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500"><span>{isArabic ? `صفحة ${page} من ${pageCount}` : `Page ${page} of ${pageCount}`}</span><div className="flex gap-2">{page > 1 && <a href={`?q=${encodeURIComponent(search)}&status=${status ?? ""}&page=${page - 1}`} className="rounded-md border border-slate-200 px-3 py-1.5 hover:bg-sand">{isArabic ? "السابق" : "Previous"}</a>}{page < pageCount && <a href={`?q=${encodeURIComponent(search)}&status=${status ?? ""}&page=${page + 1}`} className="rounded-md border border-slate-200 px-3 py-1.5 hover:bg-sand">{isArabic ? "التالي" : "Next"}</a>}</div></div>
      </section>
    </div>
  );
}
