import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { ImportExecuteForm } from "@/components/import-execute-form";
import { formatDate } from "@/lib/format";
import { isLocale } from "@/lib/i18n";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

function field(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "—";
  const item = (value as Record<string, unknown>)[key];
  return typeof item === "string" || typeof item === "number" ? String(item) : "—";
}

function rowErrors(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export default async function ImportBatchPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: rawLocale, id } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale = rawLocale;
  await requirePermission("import.execute", locale);
  const batch = await prisma.importBatch.findUnique({
    where: { id },
    select: {
      id: true, fileName: true, status: true, totalRows: true, successfulRows: true, failedRows: true,
      createdAt: true, completedAt: true, importedBy: { select: { name: true } },
      rows: { orderBy: { rowNumber: "asc" }, select: { id: true, rowNumber: true, payload: true, errors: true, importedAt: true } }
    }
  });
  if (!batch) notFound();
  const isArabic = locale === "ar";
  const validRows = batch.rows.filter((row) => rowErrors(row.errors).length === 0 && !row.importedAt).length;
  return (
    <div className="space-y-6">
      <div>
        <Link href={`/${locale}/imports`} className="mb-4 inline-flex items-center gap-2 text-xs text-slate-500 hover:text-brand-700"><ArrowLeft size={14} aria-hidden="true" />{isArabic ? "العودة إلى الاستيراد" : "Back to imports"}</Link>
        <h1 className="text-2xl font-bold text-slate-900">{batch.fileName}</h1>
        <p className="mt-1.5 text-sm text-slate-500">{batch.importedBy.name} · {formatDate(batch.createdAt, locale)} · {batch.status}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-panel"><p className="text-xs text-slate-500">{isArabic ? "إجمالي الصفوف" : "Total rows"}</p><p className="mt-2 text-xl font-bold text-slate-900">{batch.totalRows}</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-panel"><p className="text-xs text-slate-500">{isArabic ? "صفوف صالحة / مستوردة" : "Valid / imported rows"}</p><p className="mt-2 text-xl font-bold text-emerald-700">{batch.successfulRows}</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-panel"><p className="text-xs text-slate-500">{isArabic ? "صفوف بها أخطاء" : "Rows with errors"}</p><p className="mt-2 text-xl font-bold text-rose-700">{batch.failedRows}</p></article>
      </div>
      {batch.status === "VALIDATING" && validRows > 0 && <section className="rounded-xl border border-brand-100 bg-brand-50 p-5"><h2 className="mb-3 text-sm font-bold text-brand-900">{isArabic ? "مراجعة قبل الاستيراد" : "Review before importing"}</h2><p className="mb-4 text-xs text-brand-800">{isArabic ? "سيتم إنشاء فواتير مؤكدة للتجار النشطين من الصفوف الصالحة فقط. الصفوف ذات الأخطاء ستظل مستبعدة." : "Valid rows create confirmed invoices for active merchants. Rows with errors remain excluded."}</p><ImportExecuteForm locale={locale} batchId={batch.id} /></section>}
      {batch.status === "VALIDATING" && validRows === 0 && <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">{isArabic ? "لا توجد صفوف صالحة للاستيراد؛ أصلح الملف وارفعه مرة أخرى." : "There are no valid rows to import. Correct the file and upload it again."}</p>}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-panel">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-bold text-slate-800">{isArabic ? "معاينة الصفوف" : "Row preview"}</h2></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-start text-sm">
          <thead className="bg-sand text-xs text-slate-500"><tr>{[isArabic ? "الصف" : "Row", isArabic ? "رقم الفاتورة" : "Invoice number", isArabic ? "كود التاجر" : "Merchant code", isArabic ? "التاريخ" : "Date", isArabic ? "المبلغ (EGP)" : "Amount (EGP)", isArabic ? "الحالة / الأخطاء" : "Status / errors"].map((label) => <th key={label} className="px-4 py-3 text-start font-medium">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{batch.rows.map((row) => {
            const errors = rowErrors(row.errors);
            return <tr key={row.id} className={errors.length ? "bg-rose-50/40" : ""}>
              <td className="px-4 py-3">{row.rowNumber}</td>
              <td className="px-4 py-3 font-medium text-slate-800">{field(row.payload, "invoiceNumber")}</td>
              <td className="px-4 py-3">{field(row.payload, "merchantCode")}</td>
              <td className="px-4 py-3">{field(row.payload, "transactionDate")}</td>
              <td className="px-4 py-3" dir="ltr">{field(row.payload, "totalAmount")}</td>
              <td className="px-4 py-3">{row.importedAt ? <span className="text-emerald-700">{isArabic ? "مستورد" : "Imported"}</span> : errors.length ? <ul className="list-inside list-disc text-xs text-rose-700">{errors.map((error, index) => <li key={index}>{error}</li>)}</ul> : <span className="text-emerald-700">{isArabic ? "صالح" : "Valid"}</span>}</td>
            </tr>;
          })}</tbody>
        </table></div>
      </section>
    </div>
  );
}
