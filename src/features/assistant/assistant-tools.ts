import { Prisma } from "@prisma/client";
import { z } from "zod";
import { accessiblePages } from "@/features/assistant/assistant-knowledge";
import { chequeStatuses } from "@/features/cheques/cheque.service";
import { getDashboardData } from "@/features/dashboard/dashboard.service";
import { getDebtDirectory } from "@/features/finance/debt.service";
import { isoDate } from "@/features/finance/invoice-document";
import { getMerchantDetails, getMerchantDirectory } from "@/features/merchants/merchant.service";
import { getMerchantReport } from "@/features/reports/report.service";
import type { Locale } from "@/lib/i18n";
import { calendarDayOffset, startOfDayInTimeZone } from "@/lib/market";
import { prisma } from "@/lib/prisma";

export type ToolContext = {
  locale: Locale;
  permissions: ReadonlySet<string>;
  user: { id: string; name: string; email: string; roleName: string | null };
};

type ToolDefinition<Schema extends z.ZodType> = {
  name: string;
  description: string;
  status: { ar: string; en: string };
  allowed: (permissions: ReadonlySet<string>) => boolean;
  schema: Schema;
  run: (args: z.infer<Schema>, context: ToolContext) => Promise<unknown>;
};

const defineTool = <Schema extends z.ZodType>(tool: ToolDefinition<Schema>) => tool;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Calendar date YYYY-MM-DD (Cairo)");
const limit = (fallback: number) => z.number().int().min(1).max(25).optional().default(fallback).describe("Maximum rows to return (1-25)");
const query = z.string().trim().max(100).optional().describe("Free-text search");
const money = (value: Prisma.Decimal | string | number | null | undefined) => new Prisma.Decimal(value ?? 0).toFixed(2);
const dayStart = (value: string) => startOfDayInTimeZone(new Date(`${value}T12:00:00Z`));
const dayEnd = (value: string) => calendarDayOffset(new Date(`${value}T12:00:00Z`), 1);
const dateRange = (from?: string, to?: string) => (from || to ? { ...(from ? { gte: dayStart(from) } : {}), ...(to ? { lt: dayEnd(to) } : {}) } : undefined);
const insensitive = (value: string) => ({ contains: value, mode: "insensitive" as const });

async function merchantIdByCode(merchantCode: string | undefined) {
  if (!merchantCode) return undefined;
  const merchant = await prisma.merchant.findFirst({ where: { merchantCode: { equals: merchantCode.trim(), mode: "insensitive" } }, select: { id: true } });
  return merchant?.id ?? null;
}

const paidOf = (allocations: { amount: Prisma.Decimal }[]) => allocations.reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));

export const assistantTools = [
  defineTool({
    name: "get_my_account",
    description: "The signed-in user's own name, email, role, permission keys and the pages they can open.",
    status: { ar: "بيراجع بيانات حسابك", en: "Checking your account" },
    allowed: () => true,
    schema: z.object({}),
    run: async (_args, { user, permissions, locale }) => ({
      name: user.name,
      email: user.email,
      role: user.roleName,
      permissions: [...permissions].sort(),
      pages: accessiblePages(permissions).map((page) => ({ title: page.title[locale], url: `/${locale}/${page.path}` }))
    })
  }),
  defineTool({
    name: "get_dashboard_summary",
    description: "Live totals: outstanding and overdue balances, collections today and this month, active merchants, top 5 debtors, latest 5 collections.",
    status: { ar: "بيجمع ملخص لوحة المعلومات", en: "Reading the dashboard" },
    allowed: (permissions) => permissions.has("dashboard.read"),
    schema: z.object({}),
    run: async (_args, { locale }) => {
      const data = await getDashboardData();
      return {
        currency: "EGP",
        totals: {
          outstanding: money(data.totals.outstanding),
          overdue: money(data.totals.overdue),
          collectedToday: money(data.totals.today),
          collectedThisMonth: money(data.totals.month),
          activeMerchants: data.merchantCount
        },
        topDebtors: data.topDebtors.map((row) => ({ merchant: row.name, merchantCode: row.merchantCode, outstanding: money(row.outstanding), url: `/${locale}/merchants/${row.id}` })),
        recentCollections: data.recentPayments.map((payment) => ({ date: isoDate(payment.paymentDate), merchant: payment.merchant.name, amount: money(payment.amount), method: payment.paymentMethod, recordedBy: payment.createdBy?.name ?? null }))
      };
    }
  }),
  defineTool({
    name: "search_merchants",
    description: "Search merchants by name, merchant code or phone (empty query lists newest). Returns outstanding balance and last transaction date per merchant.",
    status: { ar: "بيدور في التجار", en: "Searching merchants" },
    allowed: (permissions) => permissions.has("merchant.read"),
    schema: z.object({ query, limit: limit(10) }),
    run: async ({ query: search, limit: take }, { locale }) => {
      const result = await getMerchantDirectory(search ?? "", 1, take);
      return {
        totalMatching: result.count,
        returned: result.rows.length,
        rows: result.rows.map((row) => ({ name: row.name, merchantCode: row.merchantCode, phone: row.phone, city: row.city, region: row.region, status: row.status, outstanding: money(row.outstanding), lastTransaction: row.lastTransactionAt ? isoDate(row.lastTransactionAt) : null, url: `/${locale}/merchants/${row.id}` }))
      };
    }
  }),
  defineTool({
    name: "get_merchant",
    description: "Full profile of one merchant by merchant code (preferred) or name: contact details, totals invoiced/paid/outstanding, latest invoices with remaining balance and latest collections.",
    status: { ar: "بيفتح ملف التاجر", en: "Opening the merchant profile" },
    allowed: (permissions) => permissions.has("merchant.read"),
    schema: z.object({ merchantCode: z.string().trim().max(40).optional(), name: z.string().trim().max(150).optional() }),
    run: async ({ merchantCode, name }, { locale }) => {
      const where = merchantCode ? { merchantCode: { equals: merchantCode, mode: "insensitive" as const } } : name ? { name: insensitive(name) } : null;
      if (!where) return { error: "Provide merchantCode or name." };
      const candidates = await prisma.merchant.findMany({ where, take: 6, orderBy: { name: "asc" }, select: { id: true, name: true, merchantCode: true } });
      if (!candidates.length) return { found: false };
      if (candidates.length > 1 && !merchantCode) {
        const exact = candidates.find((candidate) => candidate.name.trim() === name?.trim());
        if (!exact) return { found: false, ambiguous: true, candidates: candidates.map((candidate) => ({ name: candidate.name, merchantCode: candidate.merchantCode })) };
        candidates.splice(0, candidates.length, exact);
      }
      const details = await getMerchantDetails(candidates[0].id);
      if (!details) return { found: false };
      const { merchant, totals } = details;
      return {
        found: true,
        url: `/${locale}/merchants/${merchant.id}`,
        merchant: { name: merchant.name, merchantCode: merchant.merchantCode, phone: merchant.phone, alternatePhone: merchant.alternatePhone, city: merchant.city, region: merchant.region, address: merchant.address, taxNumber: merchant.taxNumber, status: merchant.status, since: isoDate(merchant.createdAt), notes: merchant.notes },
        totals: { invoiced: money(totals.totalInvoices), paid: money(totals.totalPaid), outstanding: money(totals.outstanding) },
        latestConfirmedInvoices: merchant.invoices.map((invoice) => {
          const paid = paidOf(invoice.allocations);
          return { invoiceNumber: invoice.invoiceNumber, date: isoDate(invoice.transactionDate), dueDate: invoice.dueDate ? isoDate(invoice.dueDate) : null, total: money(invoice.totalAmount), paid: money(paid), remaining: money(invoice.totalAmount.minus(paid)), url: `/${locale}/invoices/${invoice.id}` };
        }),
        latestCollections: merchant.payments.map((payment) => ({ date: isoDate(payment.paymentDate), amount: money(payment.amount), method: payment.paymentMethod, reference: payment.reference }))
      };
    }
  }),
  defineTool({
    name: "search_invoices",
    description: "Search invoices with filters. Returns the total count and total value of ALL matching invoices plus a sample of rows with paid and remaining amounts.",
    status: { ar: "بيدور في الفواتير", en: "Searching invoices" },
    allowed: (permissions) => permissions.has("invoice.read"),
    schema: z.object({
      query: query.describe("Invoice number or merchant name/code"),
      status: z.enum(["DRAFT", "CONFIRMED", "CANCELLED"]).optional(),
      merchantCode: z.string().trim().max(40).optional(),
      from: date.optional().describe("Invoice date from (inclusive)"),
      to: date.optional().describe("Invoice date to (inclusive)"),
      dueBefore: date.optional().describe("Only invoices due before this date"),
      sort: z.enum(["newest", "oldest", "largest"]).optional().default("newest"),
      limit: limit(10)
    }),
    run: async ({ query: search, status, merchantCode, from, to, dueBefore, sort, limit: take }, { locale }) => {
      const merchantId = await merchantIdByCode(merchantCode);
      if (merchantId === null) return { totalMatching: 0, note: "No merchant with that code." };
      const where: Prisma.InvoiceWhereInput = {
        ...(status ? { status } : {}),
        ...(merchantId ? { merchantId } : {}),
        ...(dateRange(from, to) ? { transactionDate: dateRange(from, to) } : {}),
        ...(dueBefore ? { dueDate: { lt: dayStart(dueBefore) } } : {}),
        ...(search ? { OR: [{ invoiceNumber: insensitive(search) }, { merchant: { name: insensitive(search) } }, { merchant: { merchantCode: insensitive(search) } }] } : {})
      };
      const [aggregate, rows] = await Promise.all([
        prisma.invoice.aggregate({ where, _count: { _all: true }, _sum: { totalAmount: true, taxAmount: true } }),
        prisma.invoice.findMany({
          where,
          take,
          orderBy: sort === "largest" ? { totalAmount: "desc" } : { transactionDate: sort === "oldest" ? "asc" : "desc" },
          select: { id: true, invoiceNumber: true, internalNumber: true, transactionDate: true, dueDate: true, status: true, totalAmount: true, merchant: { select: { name: true, merchantCode: true } }, allocations: { where: { payment: { status: "COMPLETED" } }, select: { amount: true } } }
        })
      ]);
      return {
        totalMatching: aggregate._count._all,
        totalValue: money(aggregate._sum.totalAmount),
        totalVat: money(aggregate._sum.taxAmount),
        returned: rows.length,
        rows: rows.map((invoice) => {
          const paid = paidOf(invoice.allocations);
          return { invoiceNumber: invoice.invoiceNumber, internalNumber: invoice.internalNumber, date: isoDate(invoice.transactionDate), dueDate: invoice.dueDate ? isoDate(invoice.dueDate) : null, status: invoice.status, merchant: invoice.merchant.name, merchantCode: invoice.merchant.merchantCode, total: money(invoice.totalAmount), paid: money(paid), remaining: money(invoice.status === "CONFIRMED" ? invoice.totalAmount.minus(paid) : 0), url: `/${locale}/invoices/${invoice.id}` };
        })
      };
    }
  }),
  defineTool({
    name: "get_invoice",
    description: "One invoice by invoice number (INV-...) or internal number: lines, sales total, VAT, total, paid, remaining, allocated collections, and links to the invoice and its PDF.",
    status: { ar: "بيفتح الفاتورة", en: "Opening the invoice" },
    allowed: (permissions) => permissions.has("invoice.read"),
    schema: z.object({ invoiceNumber: z.string().trim().max(60).optional(), internalNumber: z.number().int().positive().optional() }),
    run: async ({ invoiceNumber, internalNumber }, { locale }) => {
      if (!invoiceNumber && !internalNumber) return { error: "Provide invoiceNumber or internalNumber." };
      const invoice = await prisma.invoice.findFirst({
        where: internalNumber ? { internalNumber } : { invoiceNumber: { equals: invoiceNumber, mode: "insensitive" } },
        select: {
          id: true, invoiceNumber: true, internalNumber: true, transactionDate: true, dueDate: true, status: true, notes: true, subtotal: true, taxRate: true, taxAmount: true, totalAmount: true, cancellationReason: true,
          merchant: { select: { id: true, name: true, merchantCode: true } },
          items: { orderBy: { id: "asc" }, select: { description: true, codeName: true, itemCode: true, unit: true, quantity: true, unitPrice: true, subtotal: true } },
          allocations: { select: { amount: true, payment: { select: { status: true, paymentDate: true, reference: true, paymentMethod: true } } } }
        }
      });
      if (!invoice) return { found: false };
      const completed = invoice.allocations.filter((allocation) => allocation.payment.status === "COMPLETED");
      const paid = paidOf(completed);
      return {
        found: true,
        url: `/${locale}/invoices/${invoice.id}`,
        pdfUrl: `/${locale}/print/invoices/${invoice.id}`,
        invoiceNumber: invoice.invoiceNumber,
        internalNumber: invoice.internalNumber,
        status: invoice.status,
        date: isoDate(invoice.transactionDate),
        dueDate: invoice.dueDate ? isoDate(invoice.dueDate) : null,
        merchant: { name: invoice.merchant.name, merchantCode: invoice.merchant.merchantCode, url: `/${locale}/merchants/${invoice.merchant.id}` },
        lines: invoice.items.map((item) => ({ description: item.description, codeName: item.codeName, itemCode: item.itemCode, unit: item.unit ?? "EA", quantity: item.quantity.toString(), unitPrice: money(item.unitPrice), total: money(item.subtotal) })),
        salesTotal: money(invoice.subtotal),
        vatRatePercent: invoice.taxRate.toString(),
        vat: money(invoice.taxAmount),
        total: money(invoice.totalAmount),
        paid: money(paid),
        remaining: money(invoice.status === "CONFIRMED" ? invoice.totalAmount.minus(paid) : 0),
        collections: invoice.allocations.map((allocation) => ({ amount: money(allocation.amount), status: allocation.payment.status, date: isoDate(allocation.payment.paymentDate), reference: allocation.payment.reference, method: allocation.payment.paymentMethod })),
        notes: invoice.notes,
        cancellationReason: invoice.cancellationReason
      };
    }
  }),
  defineTool({
    name: "search_payments",
    description: "Search collections (payments) with filters. Returns the count and sum of ALL matching collections plus a sample of rows.",
    status: { ar: "بيدور في التحصيلات", en: "Searching collections" },
    allowed: (permissions) => permissions.has("payment.read"),
    schema: z.object({
      query: query.describe("Receipt reference or merchant name/code"),
      status: z.enum(["COMPLETED", "REVERSED"]).optional(),
      method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "OTHER"]).optional(),
      merchantCode: z.string().trim().max(40).optional(),
      from: date.optional(),
      to: date.optional(),
      limit: limit(10)
    }),
    run: async ({ query: search, status, method, merchantCode, from, to, limit: take }, { locale }) => {
      const merchantId = await merchantIdByCode(merchantCode);
      if (merchantId === null) return { totalMatching: 0, note: "No merchant with that code." };
      const where: Prisma.PaymentWhereInput = {
        ...(status ? { status } : {}),
        ...(method ? { paymentMethod: method } : {}),
        ...(merchantId ? { merchantId } : {}),
        ...(dateRange(from, to) ? { paymentDate: dateRange(from, to) } : {}),
        ...(search ? { OR: [{ reference: insensitive(search) }, { merchant: { name: insensitive(search) } }, { merchant: { merchantCode: insensitive(search) } }] } : {})
      };
      const [aggregate, rows] = await Promise.all([
        prisma.payment.aggregate({ where, _count: { _all: true }, _sum: { amount: true } }),
        prisma.payment.findMany({ where, take, orderBy: { paymentDate: "desc" }, select: { amount: true, paymentDate: true, paymentMethod: true, status: true, reference: true, reversalReason: true, merchant: { select: { id: true, name: true, merchantCode: true } }, createdBy: { select: { name: true } } } })
      ]);
      return {
        totalMatching: aggregate._count._all,
        totalAmount: money(aggregate._sum.amount),
        note: status ? undefined : "totalAmount includes reversed collections unless status=COMPLETED is used.",
        returned: rows.length,
        rows: rows.map((payment) => ({ date: isoDate(payment.paymentDate), merchant: payment.merchant.name, merchantCode: payment.merchant.merchantCode, amount: money(payment.amount), method: payment.paymentMethod, status: payment.status, reference: payment.reference, reversalReason: payment.reversalReason, recordedBy: payment.createdBy?.name ?? null, merchantUrl: `/${locale}/merchants/${payment.merchant.id}` }))
      };
    }
  }),
  defineTool({
    name: "get_collections_summary",
    description: "Totals of COMPLETED collections for a date range, optionally grouped by day, month, payment method or merchant. Use this for 'how much did we collect' questions.",
    status: { ar: "بيحسب إجمالي التحصيلات", en: "Totalling collections" },
    allowed: (permissions) => permissions.has("payment.read"),
    schema: z.object({ from: date, to: date, groupBy: z.enum(["none", "day", "month", "method", "merchant"]).optional().default("none") }),
    run: async ({ from, to, groupBy }) => {
      const start = dayStart(from);
      const end = dayEnd(to);
      const total = await prisma.payment.aggregate({ where: { status: "COMPLETED", paymentDate: { gte: start, lt: end } }, _count: { _all: true }, _sum: { amount: true } });
      let groups: unknown[] = [];
      if (groupBy === "day" || groupBy === "month") {
        const format = groupBy === "day" ? "YYYY-MM-DD" : "YYYY-MM";
        const rows = await prisma.$queryRaw<Array<{ period: string; count: number; amount: string }>>(Prisma.sql`
          SELECT to_char(("paymentDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Cairo', ${format}) AS period,
            COUNT(*)::int AS count, SUM("amount")::text AS amount
          FROM "payments"
          WHERE "status" = 'COMPLETED' AND "paymentDate" >= ${start} AND "paymentDate" < ${end}
          GROUP BY period ORDER BY period
          LIMIT 400`);
        groups = rows.map((row) => ({ period: row.period, count: row.count, amount: money(row.amount) }));
      } else if (groupBy === "method") {
        const rows = await prisma.payment.groupBy({ by: ["paymentMethod"], where: { status: "COMPLETED", paymentDate: { gte: start, lt: end } }, _count: { _all: true }, _sum: { amount: true } });
        groups = rows.map((row) => ({ method: row.paymentMethod, count: row._count._all, amount: money(row._sum.amount) }));
      } else if (groupBy === "merchant") {
        const rows = await prisma.$queryRaw<Array<{ name: string; merchantCode: string; count: number; amount: string }>>(Prisma.sql`
          SELECT m."name", m."merchantCode", COUNT(*)::int AS count, SUM(p."amount")::text AS amount
          FROM "payments" p JOIN "merchants" m ON m."id" = p."merchantId"
          WHERE p."status" = 'COMPLETED' AND p."paymentDate" >= ${start} AND p."paymentDate" < ${end}
          GROUP BY m."id" ORDER BY SUM(p."amount") DESC LIMIT 25`);
        groups = rows.map((row) => ({ merchant: row.name, merchantCode: row.merchantCode, count: row.count, amount: money(row.amount) }));
      }
      return { period: { from, to, timeZone: "Africa/Cairo" }, completedCount: total._count._all, totalAmount: money(total._sum.amount), currency: "EGP", groups };
    }
  }),
  defineTool({
    name: "get_debts",
    description: "Merchants with outstanding balances (largest first) with overdue amounts, optionally filtered by search and overdue aging bucket.",
    status: { ar: "بيراجع الديون المستحقة", en: "Reviewing outstanding debts" },
    allowed: (permissions) => permissions.has("debt.read"),
    schema: z.object({ query, aging: z.enum(["all", "0-30", "31-60", "61-90", "90+"]).optional().default("all"), limit: limit(10) }),
    run: async ({ query: search, aging, limit: take }, { locale }) => {
      const result = await getDebtDirectory(search ?? "", aging, 1, take);
      return {
        totalMatchingMerchants: result.count,
        returned: result.rows.length,
        rows: result.rows.map((row) => ({ merchant: row.name, merchantCode: row.merchantCode, phone: row.phone, invoiceCount: row.invoiceCount, invoiced: money(row.totalInvoices), paid: money(row.totalPaid), outstanding: money(row.outstanding), overdue: money(row.overdue), oldestUnpaid: isoDate(row.oldestUnpaidDate), url: `/${locale}/merchants/${row.id}` }))
      };
    }
  }),
  defineTool({
    name: "search_cheques",
    description: "Search the cheque register by company, cheque number or bank, status and cheque date range. Returns counts and sums per status for ALL matching cheques plus rows.",
    status: { ar: "بيدور في الشيكات", en: "Searching cheques" },
    allowed: (permissions) => permissions.has("cheque.read"),
    schema: z.object({ query, status: z.enum(chequeStatuses).optional(), from: date.optional(), to: date.optional(), limit: limit(10) }),
    run: async ({ query: search, status, from, to, limit: take }, { locale }) => {
      const where: Prisma.ChequeWhereInput = {
        ...(status ? { status } : {}),
        ...(from || to ? { chequeDate: { ...(from ? { gte: new Date(`${from}T00:00:00Z`) } : {}), ...(to ? { lte: new Date(`${to}T00:00:00Z`) } : {}) } } : {}),
        ...(search ? { OR: [{ companyName: insensitive(search) }, { chequeNumber: insensitive(search) }, { bankName: insensitive(search) }] } : {})
      };
      const [groups, rows] = await Promise.all([
        prisma.cheque.groupBy({ by: ["status"], where, _count: { _all: true }, _sum: { amount: true } }),
        prisma.cheque.findMany({ where, take, orderBy: [{ chequeDate: "asc" }, { createdAt: "desc" }], select: { companyName: true, amount: true, chequeDate: true, chequeNumber: true, bankName: true, status: true, notes: true } })
      ]);
      return {
        totalMatching: groups.reduce((sum, group) => sum + group._count._all, 0),
        byStatus: groups.map((group) => ({ status: group.status, count: group._count._all, amount: money(group._sum.amount) })),
        returned: rows.length,
        rows: rows.map((cheque) => ({ company: cheque.companyName, amount: money(cheque.amount), date: cheque.chequeDate.toISOString().slice(0, 10), chequeNumber: cheque.chequeNumber, bank: cheque.bankName, status: cheque.status, notes: cheque.notes })),
        url: `/${locale}/cheques`
      };
    }
  }),
  defineTool({
    name: "get_report",
    description: "Merchant report for an optional date range and merchant: invoices in period, invoice value, remaining balance of those invoices and collections in period, with grand totals.",
    status: { ar: "بيجهز التقرير", en: "Preparing the report" },
    allowed: (permissions) => permissions.has("report.read"),
    schema: z.object({ from: date.optional(), to: date.optional(), merchantCode: z.string().trim().max(40).optional() }),
    run: async ({ from, to, merchantCode }, { locale }) => {
      const merchantId = await merchantIdByCode(merchantCode);
      if (merchantId === null) return { note: "No merchant with that code." };
      const report = await getMerchantReport({ from, to, merchantId: merchantId ?? undefined });
      return {
        period: { from: from ?? "all time", to: to ?? "today" },
        totals: { invoiceCount: report.totals.invoiceCount, invoiceValue: money(report.totals.invoiceTotal), outstanding: money(report.totals.invoiceOutstanding), collectionCount: report.totals.paymentCount, collected: money(report.totals.paymentTotal) },
        merchantCount: report.rows.length,
        rows: report.rows.slice(0, 25).map((row) => ({ merchant: row.merchantName, merchantCode: row.merchantCode, invoiceCount: row.invoiceCount, invoiceValue: money(row.invoiceTotal), outstanding: money(row.invoiceOutstanding), collected: money(row.paymentTotal) })),
        url: `/${locale}/reports${from || to ? `?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) })}` : ""}`
      };
    }
  }),
  defineTool({
    name: "get_recent_activity",
    description: "Audit trail entries (who did what and when), newest first, filterable by action (e.g. invoice.created, payment.reversed, cheque.status_changed, auth.login), entity type, user name and date range.",
    status: { ar: "بيراجع سجل المراجعة", en: "Reading the audit trail" },
    allowed: (permissions) => permissions.has("audit.read"),
    schema: z.object({ action: z.string().trim().max(80).optional(), entityType: z.string().trim().max(80).optional(), actorName: z.string().trim().max(100).optional(), from: date.optional(), to: date.optional(), limit: limit(15) }),
    run: async ({ action, entityType, actorName, from, to, limit: take }, { locale }) => {
      const where: Prisma.AuditLogWhereInput = {
        ...(action ? { action: insensitive(action) } : {}),
        ...(entityType ? { entityType: { equals: entityType, mode: "insensitive" } } : {}),
        ...(actorName ? { actor: { name: insensitive(actorName) } } : {}),
        ...(dateRange(from, to) ? { createdAt: dateRange(from, to) } : {})
      };
      const [count, rows] = await Promise.all([
        prisma.auditLog.count({ where }),
        prisma.auditLog.findMany({ where, take, orderBy: { createdAt: "desc" }, select: { action: true, entityType: true, entityId: true, createdAt: true, actor: { select: { name: true } } } })
      ]);
      return {
        totalMatching: count,
        returned: rows.length,
        rows: rows.map((row) => ({ at: row.createdAt.toISOString(), action: row.action, entity: row.entityType, entityId: row.entityId.slice(0, 12), by: row.actor?.name ?? "system" })),
        url: `/${locale}/audit`
      };
    }
  }),
  defineTool({
    name: "list_users",
    description: "Platform user accounts with role, status and last login. Account status is not online presence.",
    status: { ar: "بيراجع المستخدمين", en: "Reviewing users" },
    allowed: (permissions) => permissions.has("user.manage"),
    schema: z.object({ status: z.enum(["ACTIVE", "SUSPENDED"]).optional(), query: query.describe("Name or email") }),
    run: async ({ status, query: search }, { locale }) => {
      const where: Prisma.UserWhereInput = { ...(status ? { status } : {}), ...(search ? { OR: [{ name: insensitive(search) }, { email: insensitive(search) }] } : {}) };
      const [count, rows] = await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({ where, take: 25, orderBy: [{ lastLoginAt: { sort: "desc", nulls: "last" } }, { name: "asc" }], select: { name: true, email: true, status: true, lastLoginAt: true, roles: { select: { role: { select: { name: true } } } } } })
      ]);
      return { totalMatching: count, rows: rows.map((row) => ({ name: row.name, email: row.email, status: row.status, roles: row.roles.map((item) => item.role.name), lastLogin: row.lastLoginAt?.toISOString() ?? null })), url: `/${locale}/users` };
    }
  }),
  defineTool({
    name: "list_roles",
    description: "Roles with their permission keys and number of assigned users.",
    status: { ar: "بيراجع الأدوار والصلاحيات", en: "Reviewing roles" },
    allowed: (permissions) => permissions.has("role.manage") || permissions.has("settings.manage"),
    schema: z.object({}),
    run: async (_args, { locale }) => {
      const roles = await prisma.role.findMany({ orderBy: { name: "asc" }, select: { key: true, name: true, description: true, _count: { select: { users: true } }, permissions: { select: { permission: { select: { key: true } } } } } });
      return { roles: roles.map((role) => ({ key: role.key, name: role.name, description: role.description, users: role._count.users, permissions: role.permissions.map((item) => item.permission.key).sort() })), url: `/${locale}/settings` };
    }
  }),
  defineTool({
    name: "list_imports",
    description: "Latest spreadsheet import batches with row counts and status.",
    status: { ar: "بيراجع عمليات الاستيراد", en: "Reviewing imports" },
    allowed: (permissions) => permissions.has("import.execute"),
    schema: z.object({ limit: limit(10) }),
    run: async ({ limit: take }, { locale }) => {
      const batches = await prisma.importBatch.findMany({ take, orderBy: { createdAt: "desc" }, select: { id: true, fileName: true, status: true, totalRows: true, successfulRows: true, failedRows: true, createdAt: true, importedBy: { select: { name: true } } } });
      return { rows: batches.map((batch) => ({ file: batch.fileName, status: batch.status, totalRows: batch.totalRows, imported: batch.successfulRows, failed: batch.failedRows, at: isoDate(batch.createdAt), by: batch.importedBy.name, url: `/${locale}/imports/${batch.id}` })) };
    }
  })
];

type AnyTool = (typeof assistantTools)[number];

/** OpenAI-compatible tool declarations for the tools this user may call. */
export function toolDeclarationsFor(permissions: ReadonlySet<string>) {
  return assistantTools.filter((tool) => tool.allowed(permissions)).map((tool) => {
    const { $schema: _ignored, ...parameters } = z.toJSONSchema(tool.schema, { io: "input" }) as Record<string, unknown>;
    return { type: "function" as const, function: { name: tool.name, description: tool.description, parameters } };
  });
}

export function toolStatus(name: string, locale: Locale) {
  return assistantTools.find((tool) => tool.name === name)?.status[locale] ?? (locale === "ar" ? "بيجمع البيانات" : "Gathering data");
}

const MAX_RESULT_CHARS = 14_000;

/** Runs a tool call after re-checking the permission. Errors are returned to the model, never thrown. */
export async function runAssistantTool(name: string, rawArguments: string, context: ToolContext): Promise<string> {
  const tool = assistantTools.find((item) => item.name === name) as AnyTool | undefined;
  if (!tool) return JSON.stringify({ error: `Unknown tool ${name}.` });
  if (!tool.allowed(context.permissions)) return JSON.stringify({ error: "PERMISSION_DENIED: the signed-in user does not have permission for this data. Tell the user they lack access." });
  let args: unknown;
  try {
    args = rawArguments.trim() ? JSON.parse(rawArguments) : {};
  } catch {
    return JSON.stringify({ error: "Arguments must be valid JSON." });
  }
  const parsed = tool.schema.safeParse(args);
  if (!parsed.success) return JSON.stringify({ error: "Invalid arguments.", issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) });
  try {
    const result = await (tool.run as (args: unknown, context: ToolContext) => Promise<unknown>)(parsed.data, context);
    const text = JSON.stringify(result);
    return text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}… [truncated: ask for fewer rows]` : text;
  } catch (error) {
    console.error("Makka AI tool failed.", { tool: name, error: error instanceof Error ? error.message : "unknown" });
    return JSON.stringify({ error: "The data could not be loaded right now." });
  }
}
