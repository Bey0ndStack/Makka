import { Prisma } from "@prisma/client";
import { PaymentCreateForm } from "@/components/payment-create-form";
import { getUserPermissionKeys } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function PaymentCreatePanel({ locale, actorId }: { locale: "ar" | "en"; actorId: string }) {
  const permissions = await getUserPermissionKeys(actorId);
  if (!permissions.has("payment.create")) return null;

  // Balances are computed in PostgreSQL so only invoices that are still open are sent to
  // the browser (previously the oldest 500 invoices were loaded, paid ones included).
  const [merchants, invoices] = await Promise.all([
    prisma.merchant.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, merchantCode: true }
    }),
    prisma.$queryRaw<Array<{ id: string; invoiceNumber: string; merchantId: string; merchantName: string; outstanding: string }>>(Prisma.sql`
      SELECT i."id", i."invoiceNumber", m."id" AS "merchantId", m."name" AS "merchantName",
        (i."totalAmount" - COALESCE(SUM(pa."amount") FILTER (WHERE p."status" = 'COMPLETED'), 0))::text AS outstanding
      FROM "invoices" i
      JOIN "merchants" m ON m."id" = i."merchantId" AND m."status" = 'ACTIVE'
      LEFT JOIN "payment_allocations" pa ON pa."invoiceId" = i."id"
      LEFT JOIN "payments" p ON p."id" = pa."paymentId"
      WHERE i."status" = 'CONFIRMED'
      GROUP BY i."id", m."id"
      HAVING i."totalAmount" - COALESCE(SUM(pa."amount") FILTER (WHERE p."status" = 'COMPLETED'), 0) > 0
      ORDER BY i."transactionDate" ASC
      LIMIT 500
    `)
  ]);
  const currentDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());

  return <PaymentCreateForm locale={locale} merchants={merchants} invoices={invoices} currentDate={currentDate} />;
}
