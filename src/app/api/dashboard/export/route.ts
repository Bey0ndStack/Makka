import { NextRequest, NextResponse } from "next/server";
import { getDashboardData } from "@/features/dashboard/dashboard.service";
import { isLocale } from "@/lib/i18n";
import { requirePermission } from "@/lib/permissions";

function textCell(value: string) {
  const safe = /^[\t\r\n ]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

function valueCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export async function GET(request: NextRequest) {
  const localeValue = request.nextUrl.searchParams.get("locale") ?? "ar";
  if (!isLocale(localeValue)) {
    return NextResponse.json({ error: "Unsupported locale." }, { status: 400 });
  }

  await requirePermission("dashboard.read", localeValue);
  await requirePermission("export.execute", localeValue);

  const data = await getDashboardData();
  const isArabic = localeValue === "ar";
  const rows: string[][] = [];
  const addRow = (section: string, item: string, value: string | number, date = "", details = "") => {
    rows.push([
      textCell(section),
      textCell(item),
      valueCell(value),
      date ? textCell(date) : "",
      details ? textCell(details) : ""
    ]);
  };

  const headers = isArabic
    ? ["القسم", "البند", "القيمة", "التاريخ", "التفاصيل"]
    : ["Section", "Item", "Value", "Date", "Details"];
  const summarySection = isArabic ? "ملخص المؤشرات" : "Summary";
  addRow(summarySection, isArabic ? "إجمالي الرصيد المستحق" : "Outstanding balance", data.totals.outstanding);
  addRow(summarySection, isArabic ? "الرصيد المتأخر" : "Overdue balance", data.totals.overdue);
  addRow(summarySection, isArabic ? "التحصيل اليوم" : "Collected today", data.totals.today);
  addRow(summarySection, isArabic ? "التحصيل هذا الشهر" : "Collected this month", data.totals.month);
  addRow(summarySection, isArabic ? "التجار النشطون" : "Active merchants", data.merchantCount);

  const debtorSection = isArabic ? "أعلى الأرصدة المستحقة" : "Top debtors";
  for (const merchant of data.topDebtors) {
    addRow(debtorSection, merchant.name, merchant.outstanding, "", merchant.merchantCode);
  }

  const paymentSection = isArabic ? "أحدث التحصيلات" : "Recent payments";
  for (const payment of data.recentPayments) {
    const details = [
      payment.paymentMethod,
      payment.merchant.merchantCode,
      payment.createdBy?.name ?? ""
    ].filter(Boolean).join(" · ");
    addRow(paymentSection, payment.merchant.name, payment.amount.toString(), payment.paymentDate.toISOString(), details);
  }

  const activitySection = isArabic ? "سجل النشاط" : "Recent activity";
  for (const item of data.activity) {
    const details = [item.entityType, item.entityId, item.actor?.name ?? ""].filter(Boolean).join(" · ");
    addRow(activitySection, item.action, "", item.createdAt.toISOString(), details);
  }

  const csv = `\uFEFF${[headers.map(textCell), ...rows].map((row) => row.join(",")).join("\r\n")}`;
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="makkah-dashboard-${date}.csv"`,
      "Cache-Control": "private, no-store"
    }
  });
}
