import { prisma } from "@/lib/prisma";
import { calendarDayOffset, startOfDayInTimeZone, startOfMonthInTimeZone, startOfNextMonthInTimeZone } from "@/lib/market";

export async function getDashboardData(now = new Date()) {
  const dayStart = startOfDayInTimeZone(now);
  const dayEnd = calendarDayOffset(now, 1);
  const monthStart = startOfMonthInTimeZone(now);
  const nextMonthStart = startOfNextMonthInTimeZone(now);

  const [totals, merchantCount, topDebtors, recentPayments, activity] = await Promise.all([
    prisma.$queryRaw<Array<{ outstanding: string; overdue: string; today: string; month: string }>>`
      WITH invoice_balances AS (
        SELECT i."id", i."totalAmount", i."dueDate", i."merchantId",
          i."totalAmount" - COALESCE(SUM(
            CASE WHEN p."status" = 'COMPLETED' THEN pa."amount" ELSE 0 END
          ), 0) AS remaining
        FROM "invoices" i
        LEFT JOIN "payment_allocations" pa ON pa."invoiceId" = i."id"
        LEFT JOIN "payments" p ON p."id" = pa."paymentId"
        WHERE i."status" = 'CONFIRMED'
        GROUP BY i."id"
      )
      SELECT
        COALESCE((SELECT SUM(remaining) FROM invoice_balances), 0)::text AS outstanding,
        COALESCE((SELECT SUM(remaining) FROM invoice_balances
          WHERE "dueDate" < ${dayStart} AND remaining > 0), 0)::text AS overdue,
        COALESCE((SELECT SUM("amount") FROM "payments"
          WHERE "status" = 'COMPLETED' AND "paymentDate" >= ${dayStart} AND "paymentDate" < ${dayEnd}), 0)::text AS today,
        COALESCE((SELECT SUM("amount") FROM "payments"
          WHERE "status" = 'COMPLETED' AND "paymentDate" >= ${monthStart} AND "paymentDate" < ${nextMonthStart}), 0)::text AS month
    `,
    prisma.merchant.count({ where: { status: "ACTIVE" } }),
    prisma.$queryRaw<Array<{ id: string; name: string; merchantCode: string; outstanding: string }>>`
      SELECT m."id", m."name", m."merchantCode",
        SUM(i."totalAmount" - COALESCE(allocated.amount, 0))::text AS outstanding
      FROM "merchants" m
      JOIN "invoices" i ON i."merchantId" = m."id" AND i."status" = 'CONFIRMED'
      LEFT JOIN (
        SELECT pa."invoiceId", SUM(pa."amount") AS amount
        FROM "payment_allocations" pa
        JOIN "payments" p ON p."id" = pa."paymentId" AND p."status" = 'COMPLETED'
        GROUP BY pa."invoiceId"
      ) allocated ON allocated."invoiceId" = i."id"
      WHERE m."status" <> 'ARCHIVED'
      GROUP BY m."id"
      HAVING SUM(i."totalAmount" - COALESCE(allocated.amount, 0)) > 0
      ORDER BY SUM(i."totalAmount" - COALESCE(allocated.amount, 0)) DESC
      LIMIT 5
    `,
    prisma.payment.findMany({
      where: { status: "COMPLETED" },
      orderBy: { paymentDate: "desc" },
      take: 5,
      select: {
        id: true,
        amount: true,
        paymentDate: true,
        paymentMethod: true,
        merchant: { select: { name: true, merchantCode: true } },
        createdBy: { select: { name: true } }
      }
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
        actor: { select: { name: true } }
      }
    })
  ]);

  return {
    totals: totals[0] ?? { outstanding: "0", overdue: "0", today: "0", month: "0" },
    merchantCount,
    topDebtors,
    recentPayments,
    activity
  };
}
