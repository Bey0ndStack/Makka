import Link from "next/link";
import { InvoiceEditorForm } from "@/components/invoice-editor-form";
import { isLocale } from "@/lib/i18n";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

export default async function NewInvoicePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale = rawLocale;
  await requirePermission("invoice.create", locale);
  const merchants = await prisma.merchant.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, merchantCode: true }
  });
  const isArabic = locale === "ar";
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href={`/${locale}/invoices`} className="mb-4 inline-flex items-center gap-2 text-xs text-slate-500 hover:text-brand-700">{isArabic ? "العودة إلى الفواتير" : "Back to invoices"}</Link>
        <h1 className="text-2xl font-bold text-slate-900">{isArabic ? "إنشاء فاتورة" : "Create invoice"}</h1>
        <p className="mt-1.5 text-sm text-slate-500">{isArabic ? "أضف بيانات الفاتورة وبنودها؛ تُحفظ المبالغ بدقة عشرية." : "Enter invoice details and line items; amounts are stored using exact decimal arithmetic."}</p>
      </div>
      {merchants.length
        ? <InvoiceEditorForm locale={locale} merchants={merchants} />
        : <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">{isArabic ? "أضف تاجرًا نشطًا قبل إنشاء فاتورة." : "Add an active merchant before creating an invoice."}</div>}
    </div>
  );
}
