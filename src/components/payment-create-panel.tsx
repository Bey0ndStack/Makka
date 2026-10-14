import { Prisma } from "@prisma/client";
import { PaymentCreateForm } from "@/components/payment-create-form";
import { getUserPermissionKeys } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function PaymentCreatePanel({ locale, actorId }: { locale: "ar" | "en"; actorId: string }) {
  const permissions = await getUserPermissionKeys(actorId);
  if (!permissions.has("payment.create")) return null;

  const [merchants, openInvoices] = await Promise.all([
    prisma.merchant.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, merchantCode: true }
    }),
    prisma.invoice.findMany({
      where: { status: "CONFIRMED", merchant: { status: "ACTIVE" } },
      orderBy: { transactionDate: "asc" },
      take: 500,
      select: {
        id: true,
        invoiceNumber: true,
        totalAmount: true,
        merchant: { select: { id: true, name: true } },
        allocations: { where: { payment: { status: "COMPLETED" } }, select: { amount: true } }
      }
    })
  ]);
  const invoices = openInvoices.flatMap((invoice) => {
    const paid = invoice.allocations.reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
    const outstanding = invoice.totalAmount.minus(paid);
    return outstanding.gt(0) ? [{
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      merchantId: invoice.merchant.id,
      merchantName: invoice.merchant.name,
      outstanding: outstanding.toString()
    }] : [];
  });
  const currentDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());

  return <PaymentCreateForm locale={locale} merchants={merchants} invoices={invoices} currentDate={currentDate} />;
}
