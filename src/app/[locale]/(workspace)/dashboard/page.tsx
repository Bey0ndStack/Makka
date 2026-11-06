import Link from "next/link";
import {
  ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpLeft, ArrowUpRight, Clock3, Download,
  FileCheck2, ReceiptText, Store, Wallet
} from "lucide-react";
import { getDashboardData } from "@/features/dashboard/dashboard.service";
import { formatCurrency, formatDate } from "@/lib/format";
import { translate, type Locale } from "@/lib/i18n";
import { requirePermission, userHasPermission } from "@/lib/permissions";
import { isLocale } from "@/lib/i18n";
import { notFound } from "next/navigation";

const actionLabels: Record<string, string> = {
  "merchant.created": "merchant",
  "invoice.created": "invoice",
  "payment.created": "collection",
  "payment.reversed": "payment"
};

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  const actor = await requirePermission("dashboard.read", locale);

  const [data, canExport] = await Promise.all([
    getDashboardData(),
    userHasPermission(actor.id, "export.execute")
  ]);
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const cards = [
    { key: "outstanding" as const, value: data.totals.outstanding, icon: Wallet, tone: "emerald" },
    { key: "collectedToday" as const, value: data.totals.today, icon: ArrowDownLeft, tone: "gold" },
    { key: "collectedMonth" as const, value: data.totals.month, icon: ReceiptText, tone: "blue" },
    { key: "merchantsCount" as const, value: String(data.merchantCount), icon: Store, tone: "slate" },
    { key: "overdue" as const, value: data.totals.overdue, icon: Clock3, tone: "rose" }
  ];
  const isArabic = locale === "ar";
  const ForwardIcon = isArabic ? ArrowLeft : ArrowRight;

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-2 text-xs font-medium text-brand-700">{t("today")} · {formatDate(new Date(), locale)}</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t("dashboardTitle")}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{t("dashboardDescription")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-slate-400">{t("amountsInPounds")}</p>
          {canExport && (
            <a
              href={`/api/dashboard/export?locale=${locale}`}
              download
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-brand-700 transition hover:border-brand-200 hover:bg-brand-50"
            >
              <Download size={15} aria-hidden="true" />
              {isArabic ? "تصدير Excel (CSV)" : "Export Excel (CSV)"}
            </a>
          )}
        </div>
      </div>

      <section aria-label={t("dashboardTitle")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map(({ key, value, icon: Icon, tone }) => (
          <article key={key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-panel">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">{t(key)}</span>
              <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${tone === "emerald" ? "bg-brand-50 text-brand-700" : tone === "gold" ? "bg-amber-50 text-amber-700" : tone === "blue" ? "bg-blue-50 text-blue-700" : tone === "rose" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"}`}>
                <Icon size={17} aria-hidden="true" />
              </span>
            </div>
            <p className="text-[22px] font-bold tracking-tight text-slate-900" dir="ltr">{key === "merchantsCount" ? value : formatCurrency(value, locale)}</p>
            {key === "outstanding" && <p className="mt-1 text-[11px] text-slate-400">{t("amountsInPounds")}</p>}
          </article>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-panel">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-bold text-slate-800">{t("debtorsTitle")}</h2>
              <p className="mt-1 text-xs text-slate-400">{t("debtorsDescription")}</p>
            </div>
            <Link href={`/${locale}/debts`} className="flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-900">{t("viewAll")} <ForwardIcon size={14} aria-hidden="true" /></Link>
          </div>
          {data.topDebtors.length ? (
            <div className="divide-y divide-slate-100">
              {data.topDebtors.map((merchant, index) => (
                <Link key={merchant.id} href={`/${locale}/merchants/${merchant.id}`} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-sand">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><Store size={17} aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800">{merchant.name}</span>
                    <span className="mt-1 block text-[11px] text-slate-400">{merchant.merchantCode}</span>
                  </span>
                  <span className="text-end">
                    <span className="block text-sm font-bold text-slate-800" dir="ltr">{formatCurrency(merchant.outstanding, locale)}</span>
                    <span className="mt-1 block text-[10px] text-slate-400">{index + 1} / {data.topDebtors.length}</span>
                  </span>
                </Link>
              ))}
            </div>
          ) : <p className="px-5 py-10 text-center text-sm text-slate-400">{t("noData")}</p>}
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-panel">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-bold text-slate-800">{t("collectionsTitle")}</h2>
              <p className="mt-1 text-xs text-slate-400">{t("collectionsDescription")}</p>
            </div>
            <Link href={`/${locale}/payments`} className="flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-900">{t("viewAll")} <ForwardIcon size={14} aria-hidden="true" /></Link>
          </div>
          {data.recentPayments.length ? (
            <div className="divide-y divide-slate-100">
              {data.recentPayments.map((payment) => (
                <div key={payment.id} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><FileCheck2 size={17} aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800">{payment.merchant.name}</span>
                    <span className="mt-1 block text-[11px] text-slate-400">{formatDate(payment.paymentDate, locale)} · {payment.createdBy?.name ?? "—"}</span>
                  </span>
                  <span className="text-sm font-bold text-brand-700" dir="ltr">{formatCurrency(payment.amount.toString(), locale)}</span>
                </div>
              ))}
            </div>
          ) : <p className="px-5 py-10 text-center text-sm text-slate-400">{t("noData")}</p>}
        </section>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-panel">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-bold text-slate-800">{t("activityTitle")}</h2>
          <p className="mt-1 text-xs text-slate-400">{t("activityDescription")}</p>
        </div>
        {data.activity.length ? (
          <div className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-y-0">
            {data.activity.map((item, index) => (
              <div key={item.id} className={`flex items-center gap-3 px-5 py-3.5 ${index > 0 ? "sm:border-t sm:border-slate-100" : ""} ${index % 2 ? "sm:border-s" : ""}`}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sand text-slate-500"><Clock3 size={16} aria-hidden="true" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-700">{t(actionLabels[item.action] ? actionLabels[item.action] as Parameters<typeof translate>[1] : "action")} · {item.entityId.slice(0, 8)}</span>
                  <span className="mt-1 block text-[11px] text-slate-400">{t("by")} {item.actor?.name ?? "—"}</span>
                </span>
                <span className="shrink-0 text-[11px] text-slate-400">{formatDate(item.createdAt, locale)}</span>
              </div>
            ))}
          </div>
        ) : <p className="px-5 py-10 text-center text-sm text-slate-400">{t("noData")}</p>}
      </section>
    </div>
  );
}
