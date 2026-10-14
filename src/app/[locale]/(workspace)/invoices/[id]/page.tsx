import Link from "next/link";
import { Prisma } from "@prisma/client";
import { notFound } from "next/navigation";
import { InvoiceCancelForm } from "@/components/invoice-cancel-form";
import { InvoiceEditorForm } from "@/components/invoice-editor-form";
import { formatCurrency, formatDate } from "@/lib/format";
import { isLocale } from "@/lib/i18n";
import { requirePermission, userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export default async function InvoiceDetailsPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: rawLocale, id } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale = rawLocale;
  const actor = await requirePermission("invoice.read", locale);
  const [invoice, canUpdate, canCancel, merchants] = await Promise.all([
    prisma.invoice.findUnique({
      where: { id },
      select: {
        id: true, invoiceNumber: true, merchantId: true, transactionDate: true, dueDate: true,
        status: true, notes: true, totalAmount: true, subtotal: true, cancellationReason: true,
        merchant: { select: { name: true, merchantCode: true } },
        items: { orderBy: { id: "asc" }, select: { description: true, quantity: true, unitPrice: true } },
        allocations: { select: { amount: true, payment: { select: { status: true } } } }
      }
    }),
    userHasPermission(actor.id, "invoice.update"),
    userHasPermission(actor.id, "invoice.cancel"),
    prisma.merchant.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true, merchantCode: true } })
  ]);
  if (!invoice) notFound();
  const isArabic = locale === "ar";
  const canEditThisInvoice = canUpdate && invoice.status === "DRAFT" && invoice.allocations.length === 0;
  const paid = invoice.allocations.filter((allocation) => allocation.payment.status === "COMPLETED").reduce((sum, allocation) => sum.plus(allocation.amount), new Prisma.Decimal(0));
  const editModel = {
    id: invoice.id,
    merchantId: invoice.merchantId,
    transactionDate: invoice.transactionDate.toISOString().slice(0, 10),
    dueDate: invoice.dueDate?.toISOString().slice(0, 10) ?? "",
    status: invoice.status as "DRAFT" | "CONFIRMED",
    notes: invoice.notes ?? "",
    items: invoice.items.map((item) => ({ description: item.description, quantity: item.quantity.toString(), unitPrice: item.unitPrice.toString() }))
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href={`/${locale}/invoices`} className="mb-4 inline-flex items-center gap-2 text-xs text-slate-500 hover:text-brand-700">{isArabic ? "العودة إلى الفواتير" : "Back to invoices"}</Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-brand-700">{invoice.invoiceNumber}</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">{isArabic ? "تفاصيل الفاتورة" : "Invoice details"}</h1>
            <p className="mt-1.5 text-sm text-slate-500">{invoice.merchant.name} · {invoice.merchant.merchantCode} · {formatDate(invoice.transactionDate, locale)}</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">{invoice.status === "DRAFT" ? (isArabic ? "مسودة" : "Draft") : invoice.status === "CONFIRMED" ? (isArabic ? "مؤكدة" : "Confirmed") : (isArabic ? "ملغاة" : "Cancelled")}</span>
        </div>
      </div>
      {canEditThisInvoice && <InvoiceEditorForm locale={locale} merchants={merchants} invoice={editModel} />}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-panel">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-bold text-slate-800">{isArabic ? "بنود الفاتورة" : "Invoice items"}</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-start text-sm">
            <thead className="bg-sand text-xs text-slate-500"><tr>{[isArabic ? "الوصف" : "Description", isArabic ? "الكمية" : "Quantity", isArabic ? "سعر الوحدة" : "Unit price", isArabic ? "الإجمالي" : "Subtotal"].map((label, index) => <th key={label} className={`px-5 py-3 font-medium ${index > 0 ? "text-right" : "text-start"}`}>{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{invoice.items.map((item, index) => <tr key={index}><td className="px-5 py-3">{item.description}</td><td className="px-5 py-3 text-right tabular-nums" dir="ltr">{item.quantity.toString()}</td><td className="px-5 py-3 text-right tabular-nums" dir="ltr">{formatCurrency(item.unitPrice.toString(), locale)}</td><td className="px-5 py-3 text-right tabular-nums" dir="ltr">{formatCurrency(item.quantity.mul(item.unitPrice).toDecimalPlaces(2).toString(), locale)}</td></tr>)}</tbody>
            <tfoot><tr className="border-t border-slate-200 font-bold"><td colSpan={3} className="px-5 py-3 text-end">{isArabic ? "الإجمالي" : "Total"}</td><td className="px-5 py-3 text-right tabular-nums" dir="ltr">{formatCurrency(invoice.totalAmount.toString(), locale)}</td></tr></tfoot>
          </table>
        </div>
        <div className="grid gap-3 border-t border-slate-100 p-5 sm:grid-cols-3">
          <p className="text-xs text-slate-500">{isArabic ? "تاريخ الاستحقاق" : "Due date"}: {invoice.dueDate ? formatDate(invoice.dueDate, locale) : "—"}</p>
          <p className="text-xs text-slate-500">{isArabic ? "المسدد" : "Paid"}: {formatCurrency(paid.toString(), locale)}</p>
          <p className="text-xs text-slate-500">{isArabic ? "ملاحظات" : "Notes"}: {invoice.notes || "—"}</p>
          {invoice.cancellationReason && <p className="text-xs text-rose-600 sm:col-span-3">{isArabic ? "سبب الإلغاء" : "Cancellation reason"}: {invoice.cancellationReason}</p>}
        </div>
      </section>
      {canCancel && invoice.status !== "CANCELLED" && <section className="rounded-xl border border-rose-100 bg-white p-5 shadow-panel"><h2 className="mb-3 text-sm font-bold text-slate-800">{isArabic ? "إلغاء الفاتورة" : "Cancel invoice"}</h2><InvoiceCancelForm invoiceId={invoice.id} locale={locale} /></section>}
      {invoice.status === "DRAFT" && !canEditThisInvoice && <p className="text-xs text-slate-500">{isArabic ? "ليس لديك صلاحية تعديل هذه المسودة." : "You do not have permission to edit this draft."}</p>}
    </div>
  );
}
