import { Prisma } from "@prisma/client";
import { z } from "zod";
import { calendarDayOffset, startOfDayInTimeZone } from "@/lib/market";
import { prisma } from "@/lib/prisma";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const filterSchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  merchantId: z.string().min(1).optional()
}).refine((filters) => !filters.from || !filters.to || filters.from <= filters.to, {
  message: "The start date must be on or before the end date."
});

export type ReportFilters = z.infer<typeof filterSchema>;
export type MerchantReportRow = {
  merchantId: string;
  merchantCode: string;
  merchantName: string;
  invoiceCount: number;
  invoiceTotal: string;
  invoiceOutstanding: string;
  paymentCount: number;
  paymentTotal: string;
};

export function parseReportFilters(input: unknown) {
  return filterSchema.safeParse(input);
}

export async function getMerchantReport(filters: ReportFilters) {
  const dateFrom = filters.from ? startOfDayInTimeZone(new Date(`${filters.from}T12:00:00Z`)) : null;
  const dateTo = filters.to
    ? startOfDayInTimeZone(calendarDayOffset(new Date(`${filters.to}T12:00:00Z`), 1))
    : null;
  const rows = await prisma.$queryRaw<MerchantReportRow[]>(Prisma.sql`
    WITH scoped_invoices AS (
      SELECT i."id", i."merchantId", i."totalAmount"
      FROM "invoices" i
      WHERE i."status" = 'CONFIRMED'
        AND (${dateFrom}::timestamp IS NULL OR i."transactionDate" >= ${dateFrom})
        AND (${dateTo}::timestamp IS NULL OR i."transactionDate" < ${dateTo})
        AND (${filters.merchantId ?? null}::text IS NULL OR i."merchantId" = ${filters.merchantId ?? null})
    ),
    invoice_paid AS (
      SELECT pa."invoiceId", SUM(pa."amount") AS "paidAmount"
      FROM "payment_allocations" pa
      JOIN "payments" p ON p."id" = pa."paymentId" AND p."status" = 'COMPLETED'
      GROUP BY pa."invoiceId"
    ),
    invoice_summary AS (
      SELECT si."merchantId",
        COUNT(*)::int AS "invoiceCount",
        SUM(si."totalAmount") AS "invoiceTotal",
        SUM(si."totalAmount" - COALESCE(ip."paidAmount", 0)) AS "invoiceOutstanding"
      FROM scoped_invoices si
      LEFT JOIN invoice_paid ip ON ip."invoiceId" = si."id"
      GROUP BY si."merchantId"
    ),
    scoped_payments AS (
      SELECT p."merchantId", p."amount"
      FROM "payments" p
      WHERE p."status" = 'COMPLETED'
        AND (${dateFrom}::timestamp IS NULL OR p."paymentDate" >= ${dateFrom})
        AND (${dateTo}::timestamp IS NULL OR p."paymentDate" < ${dateTo})
        AND (${filters.merchantId ?? null}::text IS NULL OR p."merchantId" = ${filters.merchantId ?? null})
    ),
    payment_summary AS (
      SELECT sp."merchantId", COUNT(*)::int AS "paymentCount", SUM(sp."amount") AS "paymentTotal"
      FROM scoped_payments sp
      GROUP BY sp."merchantId"
    )
    SELECT
      m."id" AS "merchantId",
      m."merchantCode",
      m."name" AS "merchantName",
      COALESCE(ins."invoiceCount", 0)::int AS "invoiceCount",
      COALESCE(ins."invoiceTotal", 0)::text AS "invoiceTotal",
      COALESCE(ins."invoiceOutstanding", 0)::text AS "invoiceOutstanding",
      COALESCE(pas."paymentCount", 0)::int AS "paymentCount",
      COALESCE(pas."paymentTotal", 0)::text AS "paymentTotal"
    FROM "merchants" m
    LEFT JOIN invoice_summary ins ON ins."merchantId" = m."id"
    LEFT JOIN payment_summary pas ON pas."merchantId" = m."id"
    WHERE m."status" = 'ACTIVE'
      AND (${filters.merchantId ?? null}::text IS NULL OR m."id" = ${filters.merchantId ?? null})
      AND (ins."merchantId" IS NOT NULL OR pas."merchantId" IS NOT NULL)
    ORDER BY m."name" ASC
  `);
  const totals = rows.reduce((result, row) => ({
    invoiceCount: result.invoiceCount + row.invoiceCount,
    invoiceTotal: result.invoiceTotal.plus(row.invoiceTotal),
    invoiceOutstanding: result.invoiceOutstanding.plus(row.invoiceOutstanding),
    paymentCount: result.paymentCount + row.paymentCount,
    paymentTotal: result.paymentTotal.plus(row.paymentTotal)
  }), {
    invoiceCount: 0,
    invoiceTotal: new Prisma.Decimal(0),
    invoiceOutstanding: new Prisma.Decimal(0),
    paymentCount: 0,
    paymentTotal: new Prisma.Decimal(0)
  });
  return { rows, totals };
}
