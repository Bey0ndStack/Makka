import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function getMerchantDirectory(search: string, page: number, pageSize: number) {
  const query = search.trim();
  const pattern = `%${query}%`;
  const filter = query
    ? Prisma.sql`WHERE m."status" <> 'ARCHIVED'
        AND (m."name" ILIKE ${pattern} OR m."merchantCode" ILIKE ${pattern} OR m."phone" ILIKE ${pattern})`
    : Prisma.sql`WHERE m."status" <> 'ARCHIVED'`;
  const offset = (page - 1) * pageSize;

  const [rows, count] = await Promise.all([
    prisma.$queryRaw<Array<{
      id: string;
      merchantCode: string;
      name: string;
      phone: string;
      city: string | null;
      region: string | null;
      status: string;
      outstanding: string;
      lastTransactionAt: Date | null;
    }>>(Prisma.sql`
      WITH page AS (
        SELECT m."id", m."merchantCode", m."name", m."phone", m."city", m."region", m."status", m."createdAt"
        FROM "merchants" m
        ${filter}
        ORDER BY m."createdAt" DESC
        LIMIT ${pageSize} OFFSET ${offset}
      )
      SELECT pg."id", pg."merchantCode", pg."name", pg."phone", pg."city", pg."region", pg."status",
        COALESCE(SUM(i."totalAmount" - COALESCE(allocated.amount, 0)), 0)::text AS outstanding,
        MAX(i."transactionDate") AS "lastTransactionAt"
      FROM page pg
      LEFT JOIN "invoices" i ON i."merchantId" = pg."id" AND i."status" = 'CONFIRMED'
      LEFT JOIN LATERAL (
        SELECT SUM(pa."amount") AS amount
        FROM "payment_allocations" pa
        JOIN "payments" p ON p."id" = pa."paymentId" AND p."status" = 'COMPLETED'
        WHERE pa."invoiceId" = i."id"
      ) allocated ON true
      GROUP BY pg."id", pg."merchantCode", pg."name", pg."phone", pg."city", pg."region", pg."status", pg."createdAt"
      ORDER BY pg."createdAt" DESC
    `),
    prisma.merchant.count({ where: query ? {
      status: { not: "ARCHIVED" },
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { merchantCode: { contains: query, mode: "insensitive" } },
        { phone: { contains: query, mode: "insensitive" } }
      ]
    } : { status: { not: "ARCHIVED" } } })
  ]);

  return { rows, count, pageCount: Math.max(1, Math.ceil(count / pageSize)) };
}

export async function getMerchantDetails(id: string) {
  const [merchant, summaries] = await Promise.all([
    prisma.merchant.findUnique({
      where: { id },
      select: {
        id: true,
        merchantCode: true,
        name: true,
        phone: true,
        alternatePhone: true,
        address: true,
        city: true,
        region: true,
        taxNumber: true,
        status: true,
        notes: true,
        createdAt: true,
        invoices: {
          where: { status: "CONFIRMED" },
          orderBy: { transactionDate: "desc" },
          take: 20,
          select: {
            id: true,
            invoiceNumber: true,
            transactionDate: true,
            dueDate: true,
            totalAmount: true,
            allocations: {
              where: { payment: { status: "COMPLETED" } },
              select: { amount: true }
            }
          }
        },
        payments: {
          where: { status: "COMPLETED" },
          orderBy: { paymentDate: "desc" },
          take: 20,
          select: { id: true, amount: true, paymentDate: true, paymentMethod: true, reference: true }
        }
      }
    }),
    prisma.$queryRaw<Array<{ totalInvoices: string; totalPaid: string; outstanding: string }>>`
      SELECT
        COALESCE(SUM(i."totalAmount"), 0)::text AS "totalInvoices",
        COALESCE(SUM(COALESCE(allocated.amount, 0)), 0)::text AS "totalPaid",
        COALESCE(SUM(i."totalAmount" - COALESCE(allocated.amount, 0)), 0)::text AS outstanding
      FROM "invoices" i
      LEFT JOIN (
        SELECT pa."invoiceId", SUM(pa."amount") AS amount
        FROM "payment_allocations" pa
        JOIN "payments" p ON p."id" = pa."paymentId" AND p."status" = 'COMPLETED'
        GROUP BY pa."invoiceId"
      ) allocated ON allocated."invoiceId" = i."id"
      WHERE i."merchantId" = ${id} AND i."status" = 'CONFIRMED'
    `
  ]);
  if (!merchant) return null;
  return {
    merchant,
    totals: summaries[0] ?? { totalInvoices: "0", totalPaid: "0", outstanding: "0" }
  };
}
