import Form from "next/form";
import { formatCurrency } from "@/lib/format";
import { getMerchantReport, parseReportFilters } from "@/features/reports/report.service";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";

export async function ReportsPanel({
  locale,
  actorId,
  searchParams
}: {
  locale: "ar" | "en";
  actorId: string;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const isArabic = locale === "ar";
  const scalar = (value: string | string[] | undefined) => typeof value === "string" ? value : undefined;
  const filters = { from: scalar(searchParams.from), to: scalar(searchParams.to), merchantId: scalar(searchParams.merchantId) };
  const parsed = parseReportFilters(filters);
  const [merchants, canExport] = await Promise.all([
    prisma.merchant.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true, merchantCode: true } }),
    userHasPermission(actorId, "export.execute")
  ]);
  const report = parsed.success ? await getMerchantReport(parsed.data) : null;
  const exportQuery = new URLSearchParams({
    locale,
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
    ...(filters.merchantId ? { merchantId: filters.merchantId } : {})
  });
  const metrics = report ? [
    { label: isArabic ? "الفواتير خلال الفترة" : "Invoices in period", value: String(report.totals.invoiceCount) },
    { label: isArabic ? "قيمة الفواتير" : "Invoice value", value: formatCurrency(report.totals.invoiceTotal.toString(), locale) },
    { label: isArabic ? "الرصيد المتبقي" : "Outstanding balance", value: formatCurrency(report.totals.invoiceOutstanding.toString(), locale) },
    { label: isArabic ? "التحصيلات خلال الفترة" : "Collections in period", value: formatCurrency(report.totals.paymentTotal.toString(), locale) }
  ] : [];

  return (
    <div className="space-y-6">
      <Form action={`/${locale}/reports`} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-panel sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.4fr_auto_auto]">
        <label className="space-y-1 text-xs text-slate-500"><span>{isArabic ? "من تاريخ" : "From date"}</span><input type="date" name="from" defaultValue={filters.from} className="h-10 w-full rounded-lg border border-slate-200 px-2 text-sm text-slate-700" /></label>
        <label className="space-y-1 text-xs text-slate-500"><span>{isArabic ? "إلى تاريخ" : "To date"}</span><input type="date" name="to" defaultValue={filters.to} className="h-10 w-full rounded-lg border border-slate-200 px-2 text-sm text-slate-700" /></label>
        <label className="space-y-1 text-xs text-slate-500"><span>{isArabic ? "التاجر" : "Merchant"}</span><select name="merchantId" defaultValue={filters.merchantId} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700"><option value="">{isArabic ? "كل التجار" : "All merchants"}</option>{merchants.map((merchant) => <option key={merchant.id} value={merchant.id}>{merchant.name} · {merchant.merchantCode}</option>)}</select></label>
        <button className="mt-auto h-10 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800">{isArabic ? "تطبيق الفلاتر" : "Apply filters"}</button>
        {canExport && <a href={`/api/reports?${exportQuery.toString()}`} className="mt-auto inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 px-4 text-sm font-semibold text-brand-700 hover:bg-brand-50">{isArabic ? "تصدير CSV" : "Export CSV"}</a>}
      </Form>
      {!parsed.success && <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{isArabic ? "نطاق التاريخ غير صالح؛ تأكد من أن تاريخ البداية يسبق تاريخ النهاية." : "Invalid date range; ensure the start date is on or before the end date."}</p>}
      {report && <>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map((metric) => <article key={metric.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-panel"><p className="text-xs text-slate-500">{metric.label}</p><p className="mt-3 text-xl font-bold text-slate-900" dir="ltr">{metric.value}</p></article>)}</section>
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-panel">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-bold text-slate-800">{isArabic ? "ملخص حسب التاجر" : "Merchant breakdown"}</h2><p className="mt-1 text-xs text-slate-500">{isArabic ? "الفواتير والتحصيلات تتبع الفترة؛ الرصيد يخص الفواتير المشمولة ويحسب المدفوعات المكتملة." : "Invoices and collections follow the selected period; outstanding is for matching invoices after completed payments."}</p></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-start text-sm">
            <thead className="bg-sand text-xs text-slate-500"><tr>{[isArabic ? "التاجر" : "Merchant", isArabic ? "عدد الفواتير" : "Invoices", isArabic ? "إجمالي الفواتير" : "Invoice total", isArabic ? "الرصيد المتبقي" : "Outstanding", isArabic ? "التحصيلات" : "Collections"].map((label, index) => <th key={label} className={`px-5 py-3 font-medium ${index === 0 ? "text-start" : "text-right"}`}>{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{report.rows.map((row) => <tr key={row.merchantId}><td className="px-5 py-3.5 font-semibold text-slate-800">{row.merchantName}<span className="mt-1 block text-[11px] text-slate-400">{row.merchantCode}</span></td><td className="px-5 py-3.5 text-right tabular-nums">{row.invoiceCount}</td><td className="px-5 py-3.5 text-right tabular-nums" dir="ltr">{formatCurrency(row.invoiceTotal, locale)}</td><td className="px-5 py-3.5 text-right tabular-nums" dir="ltr">{formatCurrency(row.invoiceOutstanding, locale)}</td><td className="px-5 py-3.5 text-right tabular-nums" dir="ltr">{formatCurrency(row.paymentTotal, locale)}</td></tr>)}
              {!report.rows.length && <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-400">{isArabic ? "لا توجد بيانات لهذه الفلاتر." : "No data for these filters."}</td></tr>}</tbody>
          </table></div>
        </section>
      </>}
    </div>
  );
}
