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

type DebtRow = {
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
  totalCount: number;
};

export async function getDebtDirectory(search: string, aging: DebtAging, page: number, pageSize: number) {
  const searchPattern = `%${search.trim()}%`;
  const agingFilter = agingFilters[aging];
  const searchFilter = search.trim()
    ? Prisma.sql`AND (m."name" ILIKE ${searchPattern} OR m."merchantCode" ILIKE ${searchPattern} OR m."phone" ILIKE ${searchPattern})`
    : Prisma.empty;

  // Allocations are aggregated once per invoice, and the page and total count come
  // from a single pass (COUNT(*) OVER ()) instead of evaluating the CTE twice.
  const rows = await prisma.$queryRaw<DebtRow[]>(Prisma.sql`
    WITH paid AS (
      SELECT pa."invoiceId", SUM(pa."amount") AS amount
      FROM "payment_allocations" pa
      JOIN "payments" p ON p."id" = pa."paymentId" AND p."status" = 'COMPLETED'
      GROUP BY pa."invoiceId"
    ),
    balances AS (
      SELECT i."id", i."merchantId", i."transactionDate", i."dueDate", i."totalAmount",
        COALESCE(paid.amount, 0) AS paid,
        i."totalAmount" - COALESCE(paid.amount, 0) AS remaining
      FROM "invoices" i
      LEFT JOIN paid ON paid."invoiceId" = i."id"
      WHERE i."status" = 'CONFIRMED'
    ),
    debt_totals AS (
      SELECT m."id", m."merchantCode", m."name", m."phone", m."city",
        COUNT(b."id")::integer AS "invoiceCount",
        SUM(b."totalAmount") AS "totalInvoices",
        SUM(b.paid) AS "totalPaid",
        SUM(b.remaining) AS outstanding,
        SUM(CASE WHEN b."dueDate" < CURRENT_DATE THEN b.remaining ELSE 0 END) AS overdue,
        MIN(b."transactionDate") AS "oldestUnpaidDate"
      FROM "merchants" m
      JOIN balances b ON b."merchantId" = m."id" AND b.remaining > 0 ${agingFilter}
      WHERE m."status" <> 'ARCHIVED' ${searchFilter}
      GROUP BY m."id"
    )
    SELECT d."id", d."merchantCode", d."name", d."phone", d."city", d."invoiceCount",
      d."totalInvoices"::text AS "totalInvoices", d."totalPaid"::text AS "totalPaid",
      d.outstanding::text AS outstanding, d.overdue::text AS overdue, d."oldestUnpaidDate",
      COUNT(*) OVER ()::integer AS "totalCount"
    FROM debt_totals d
    ORDER BY d.outstanding DESC
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`);

  // Past the last page the window count is unavailable; fall back to a count only then.
  const count = rows[0]?.totalCount ?? (page > 1 ? await countDebtors(agingFilter, searchFilter) : 0);
  return { rows, count, pageCount: Math.max(1, Math.ceil(count / pageSize)) };
}

async function countDebtors(agingFilter: Prisma.Sql, searchFilter: Prisma.Sql) {
  const result = await prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
    SELECT COUNT(DISTINCT m."id")::integer AS count
    FROM "merchants" m
    JOIN (
      SELECT i."id", i."merchantId", i."dueDate", i."totalAmount" - COALESCE(SUM(pa."amount") FILTER (WHERE p."status" = 'COMPLETED'), 0) AS remaining
      FROM "invoices" i
      LEFT JOIN "payment_allocations" pa ON pa."invoiceId" = i."id"
      LEFT JOIN "payments" p ON p."id" = pa."paymentId"
      WHERE i."status" = 'CONFIRMED'
      GROUP BY i."id"
    ) b ON b."merchantId" = m."id" AND b.remaining > 0 ${agingFilter}
    WHERE m."status" <> 'ARCHIVED' ${searchFilter}`);
  return result[0]?.count ?? 0;
}
