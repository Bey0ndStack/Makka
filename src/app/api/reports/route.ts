import { NextRequest, NextResponse } from "next/server";
import { getMerchantReport, parseReportFilters } from "@/features/reports/report.service";
import { isLocale } from "@/lib/i18n";
import { requirePermission } from "@/lib/permissions";

function csvCell(value: string | number) {
  const text = String(value);
  const safe = /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const localeValue = query.get("locale") ?? "ar";
  if (!isLocale(localeValue)) return NextResponse.json({ error: "Unsupported locale." }, { status: 400 });
  await requirePermission("report.read", localeValue);
  await requirePermission("export.execute", localeValue);
  const parsed = parseReportFilters({
    from: query.get("from") || undefined,
    to: query.get("to") || undefined,
    merchantId: query.get("merchantId") || undefined
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid report filters." }, { status: 400 });
  const report = await getMerchantReport(parsed.data);
  const headers = localeValue === "ar"
    ? ["كود التاجر", "اسم التاجر", "عدد الفواتير", "إجمالي الفواتير (EGP)", "الرصيد المتبقي (EGP)", "عدد التحصيلات", "إجمالي التحصيلات (EGP)"]
    : ["Merchant code", "Merchant", "Invoices", "Invoice total (EGP)", "Outstanding (EGP)", "Collections", "Collections total (EGP)"];
  const rows = report.rows.map((row) => [row.merchantCode, row.merchantName, row.invoiceCount, row.invoiceTotal, row.invoiceOutstanding, row.paymentCount, row.paymentTotal]);
  const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="makkah-report-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store"
    }
  });
}
