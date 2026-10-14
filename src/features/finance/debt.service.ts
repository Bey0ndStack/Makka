import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type DebtAging = "all" | "0-30" | "31-60" | "61-90" | "90+";

const agingFilters: Record<DebtAging, Prisma.Sql> = {
  all: Prisma.empty,
  "0-30": Prisma.sql`AND b."dueDate" < CURRENT_DATE AND b."dueDate" >= CURRENT_DATE - INTERVAL '30 days'`,
  "31-60": Prisma.sql`AND b."dueDate" < CURRENT_DATE - INTERVAL '30 days' AND b."dueDate" >= CURRENT_DATE - INTERVAL '60 days'`,
  "61-90": Prisma.sql`AND b."dueDate" < CURRENT_DATE - INTERVAL '60 days' AND b."dueDate" >= CURRENT_DATE - INTERVAL '90 days'`,
  "90+": Prisma.sql`AND b."dueDate" < CURRENT_DATE - INTERVAL '90 days'`
};

export async function getDebtDirectory(search: string, aging: DebtAging, page: number, pageSize: number) {
  const searchPattern = `%${search.trim()}%`;
  const agingFilter = agingFilters[aging];
  const searchFilter = search.trim()
    ? Prisma.sql`WHERE d."name" ILIKE ${searchPattern} OR d."merchantCode" ILIKE ${searchPattern} OR d."phone" ILIKE ${searchPattern}`
    : Prisma.empty;
  const debtors = Prisma.sql`
    WITH invoice_balances AS (
      SELECT i."id", i."merchantId", i."transactionDate", i."dueDate", i."totalAmount",
        i."totalAmount" - COALESCE(SUM(CASE WHEN p."status" = 'COMPLETED' THEN pa."amount" ELSE 0 END), 0) AS remaining,
        COALESCE(SUM(CASE WHEN p."status" = 'COMPLETED' THEN pa."amount" ELSE 0 END), 0) AS paid
      FROM "invoices" i
      LEFT JOIN "payment_allocations" pa ON pa."invoiceId" = i."id"
      LEFT JOIN "payments" p ON p."id" = pa."paymentId"
      WHERE i."status" = 'CONFIRMED'
      GROUP BY i."id"
    ),
    filtered_balances AS (
      SELECT b.* FROM invoice_balances b
      WHERE b.remaining > 0 ${agingFilter}
    ),
    debt_totals AS (
      SELECT m."id", m."merchantCode", m."name", m."phone", m."city",
        COUNT(b."id")::integer AS "invoiceCount",
        SUM(b."totalAmount")::text AS "totalInvoices",
        SUM(b.paid)::text AS "totalPaid",
        SUM(b.remaining)::text AS outstanding,
        SUM(CASE WHEN b."dueDate" < CURRENT_DATE THEN b.remaining ELSE 0 END)::text AS overdue,
        MIN(b."transactionDate") AS "oldestUnpaidDate"
      FROM "merchants" m
      JOIN filtered_balances b ON b."merchantId" = m."id"
      WHERE m."status" <> 'ARCHIVED'
      GROUP BY m."id"
    )
  `;

  const [rows, counts] = await Promise.all([
    prisma.$queryRaw<Array<{
      id: string;
      merchantCode: string;
      name: string;
      phone: string;
      city: string | null;
      invoiceCount: number;
      totalInvoices: string;
      totalPaid: string;
      outstanding: string;
      overdue: string;
      oldestUnpaidDate: Date;
    }>>(Prisma.sql`${debtors}
      SELECT d.* FROM debt_totals d
      ${searchFilter}
      ORDER BY d.outstanding::numeric DESC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`),
    prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`${debtors}
      SELECT COUNT(*)::integer AS count FROM debt_totals d ${searchFilter}`)
  ]);

  const count = counts[0]?.count ?? 0;
  return { rows, count, pageCount: Math.max(1, Math.ceil(count / pageSize)) };
}
