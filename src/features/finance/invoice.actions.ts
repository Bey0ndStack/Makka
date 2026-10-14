"use server";

import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isLocale } from "@/lib/i18n";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const lineSchema = z.object({
  description: z.string().trim().min(2).max(200),
  quantity: z.string().trim().regex(/^\d{1,9}(?:\.\d{1,3})?$/),
  unitPrice: z.string().trim().regex(/^\d{1,10}(?:\.\d{1,2})?$/)
});
const invoiceSchema = z.object({
  merchantId: z.string().min(1),
  transactionDate: z.string().date(),
  dueDate: z.string().date().optional(),
  status: z.enum(["DRAFT", "CONFIRMED"]),
  notes: z.string().trim().max(1000).optional(),
  items: z.array(lineSchema).min(1).max(100)
});
export type InvoiceFormState = { error?: string; success?: string };

function localeFrom(formData: FormData) {
  const value = formData.get("locale");
  return typeof value === "string" && isLocale(value) ? value : "ar";
}

function metadata(headersValue: Headers) {
  return {
    ipAddress: headersValue.get("x-real-ip"),
    userAgent: headersValue.get("user-agent"),
    requestId: headersValue.get("x-request-id") ?? randomUUID()
  };
}

function parseInput(formData: FormData) {
  let items: unknown;
  try {
    const raw = formData.get("items");
    items = JSON.parse(typeof raw === "string" ? raw : "[]");
  } catch {
    return null;
  }
  return invoiceSchema.safeParse({
    merchantId: formData.get("merchantId"),
    transactionDate: formData.get("transactionDate"),
    dueDate: formData.get("dueDate") || undefined,
    status: formData.get("status"),
    notes: formData.get("notes") || undefined,
    items
  });
}

function calculateItems(items: z.infer<typeof lineSchema>[]) {
  const normalized = items.map((item) => {
    const quantity = new Prisma.Decimal(item.quantity);
    const unitPrice = new Prisma.Decimal(item.unitPrice);
    return {
      description: item.description,
      quantity,
      unitPrice,
      subtotal: quantity.mul(unitPrice).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
    };
  });
  if (normalized.some((item) => item.quantity.lte(0) || item.unitPrice.lt(0))) return null;
  const total = normalized.reduce((sum, item) => sum.plus(item.subtotal), new Prisma.Decimal(0));
  if (total.lte(0) || total.gte(new Prisma.Decimal("10000000000"))) return null;
  return { normalized, total };
}

export async function createInvoiceAction(_previous: InvoiceFormState, formData: FormData): Promise<InvoiceFormState> {
  const locale = localeFrom(formData);
  const actor = await requirePermission("invoice.create", locale);
  const parsed = parseInput(formData);
  if (!parsed?.success) return { error: locale === "ar" ? "راجع بيانات الفاتورة وبنودها." : "Check the invoice details and line items." };
  const calculated = calculateItems(parsed.data.items);
  if (!calculated) return { error: locale === "ar" ? "تحقق من الكميات والأسعار والإجمالي." : "Check quantities, prices, and the invoice total." };
  if (parsed.data.dueDate && parsed.data.dueDate < parsed.data.transactionDate) return { error: locale === "ar" ? "تاريخ الاستحقاق يجب ألا يسبق تاريخ الفاتورة." : "The due date cannot be before the invoice date." };
  const requestHeaders = await headers();
  const requestMetadata = metadata(requestHeaders);
  const invoiceNumber = `INV-${new Date().getFullYear()}-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;

  const created = await prisma.$transaction(async (tx) => {
    const merchant = await tx.merchant.findFirst({ where: { id: parsed.data.merchantId, status: "ACTIVE" }, select: { id: true } });
    if (!merchant) return false;
    const invoice = await tx.invoice.create({
      data: {
        invoiceNumber,
        merchantId: merchant.id,
        transactionDate: new Date(`${parsed.data.transactionDate}T12:00:00`),
        dueDate: parsed.data.dueDate ? new Date(`${parsed.data.dueDate}T12:00:00`) : null,
        status: parsed.data.status,
        notes: parsed.data.notes || null,
        subtotal: calculated.total,
        totalAmount: calculated.total,
        createdById: actor.id,
        items: { create: calculated.normalized }
      }
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "invoice.created",
        entityType: "Invoice",
        entityId: invoice.id,
        afterData: {
          invoiceNumber,
          merchantId: merchant.id,
          status: invoice.status,
          totalAmount: calculated.total.toFixed(2),
          items: calculated.normalized.map((item) => ({ description: item.description, quantity: item.quantity.toString(), unitPrice: item.unitPrice.toFixed(2), subtotal: item.subtotal.toFixed(2) }))
        },
        ...requestMetadata
      }
    });
    return true;
  });
  if (!created) return { error: locale === "ar" ? "التاجر غير موجود أو غير نشط." : "The merchant does not exist or is inactive." };
  revalidatePath(`/${locale}/invoices`);
  revalidatePath(`/${locale}/dashboard`);
  redirect(`/${locale}/invoices`);
}

export async function updateInvoiceAction(_previous: InvoiceFormState, formData: FormData): Promise<InvoiceFormState> {
  const locale = localeFrom(formData);
  const actor = await requirePermission("invoice.update", locale);
  const invoiceId = formData.get("invoiceId");
  if (typeof invoiceId !== "string" || !invoiceId) return { error: locale === "ar" ? "الفاتورة غير محددة." : "Invoice not specified." };
  const parsed = parseInput(formData);
  if (!parsed?.success) return { error: locale === "ar" ? "راجع بيانات الفاتورة وبنودها." : "Check the invoice details and line items." };
  const calculated = calculateItems(parsed.data.items);
  if (!calculated) return { error: locale === "ar" ? "تحقق من الكميات والأسعار والإجمالي." : "Check quantities, prices, and the invoice total." };
  if (parsed.data.dueDate && parsed.data.dueDate < parsed.data.transactionDate) return { error: locale === "ar" ? "تاريخ الاستحقاق يجب ألا يسبق تاريخ الفاتورة." : "The due date cannot be before the invoice date." };
  const requestHeaders = await headers();
  const requestMetadata = metadata(requestHeaders);
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, invoiceNumber: true, merchantId: true, status: true, totalAmount: true, items: { select: { description: true, quantity: true, unitPrice: true } }, allocations: { select: { id: true } } }
    });
    if (!existing) return "missing" as const;
    if (existing.status !== "DRAFT" || existing.allocations.length) return "locked" as const;
    const merchant = await tx.merchant.findFirst({ where: { id: parsed.data.merchantId, status: "ACTIVE" }, select: { id: true } });
    if (!merchant) return "merchant" as const;
    await tx.invoiceItem.deleteMany({ where: { invoiceId } });
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        merchantId: merchant.id,
        transactionDate: new Date(`${parsed.data.transactionDate}T12:00:00`),
        dueDate: parsed.data.dueDate ? new Date(`${parsed.data.dueDate}T12:00:00`) : null,
        status: parsed.data.status,
        notes: parsed.data.notes || null,
        subtotal: calculated.total,
        totalAmount: calculated.total,
        updatedById: actor.id,
        items: { create: calculated.normalized }
      }
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "invoice.updated",
        entityType: "Invoice",
        entityId: invoiceId,
        beforeData: { status: existing.status, totalAmount: existing.totalAmount.toString(), merchantId: existing.merchantId },
        afterData: { status: parsed.data.status, totalAmount: calculated.total.toFixed(2), merchantId: merchant.id, items: calculated.normalized.map((item) => ({ description: item.description, quantity: item.quantity.toString(), unitPrice: item.unitPrice.toFixed(2) })) },
        ...requestMetadata
      }
    });
    return "updated" as const;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (result !== "updated") return { error: result === "missing" ? (locale === "ar" ? "الفاتورة غير موجودة." : "Invoice not found.") : result === "merchant" ? (locale === "ar" ? "التاجر غير موجود أو غير نشط." : "The merchant does not exist or is inactive.") : (locale === "ar" ? "يمكن تعديل المسودات فقط قبل تسجيل أي تحصيل عليها." : "Only drafts without recorded payments can be edited.") };
  revalidatePath(`/${locale}/invoices`);
  revalidatePath(`/${locale}/invoices/${invoiceId}`);
  return { success: locale === "ar" ? "تم حفظ تعديلات الفاتورة." : "Invoice changes saved." };
}

export async function cancelInvoiceAction(_previous: InvoiceFormState, formData: FormData): Promise<InvoiceFormState> {
  const locale = localeFrom(formData);
  const actor = await requirePermission("invoice.cancel", locale);
  const parsed = z.object({ invoiceId: z.string().min(1), reason: z.string().trim().min(3).max(500) }).safeParse({
    invoiceId: formData.get("invoiceId"),
    reason: formData.get("reason")
  });
  if (!parsed.success) return { error: locale === "ar" ? "اكتب سبب إلغاء الفاتورة." : "Enter a cancellation reason." };
  const requestHeaders = await headers();
  const requestMetadata = metadata(requestHeaders);
  const result = await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({ where: { id: parsed.data.invoiceId }, select: { id: true, invoiceNumber: true, status: true, totalAmount: true, allocations: { select: { id: true } } } });
    if (!invoice) return "missing" as const;
    if (invoice.status === "CANCELLED") return "cancelled" as const;
    if (invoice.allocations.length) return "allocated" as const;
    await tx.invoice.update({ where: { id: invoice.id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: actor.id, cancellationReason: parsed.data.reason, updatedById: actor.id } });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "invoice.cancelled",
        entityType: "Invoice",
        entityId: invoice.id,
        beforeData: { status: invoice.status, totalAmount: invoice.totalAmount.toString() },
        afterData: { status: "CANCELLED", invoiceNumber: invoice.invoiceNumber, reason: parsed.data.reason },
        ...requestMetadata
      }
    });
    return "cancelled-now" as const;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (result !== "cancelled-now") return { error: result === "missing" ? (locale === "ar" ? "الفاتورة غير موجودة." : "Invoice not found.") : result === "allocated" ? (locale === "ar" ? "لا يمكن إلغاء فاتورة عليها تحصيلات مكتملة. اعكس التحصيلات أولًا." : "This invoice has completed payments. Reverse those payments before cancellation.") : (locale === "ar" ? "الفاتورة ملغاة بالفعل." : "Invoice is already cancelled.") };
  revalidatePath(`/${locale}/invoices`);
  revalidatePath(`/${locale}/dashboard`);
  return { success: locale === "ar" ? "تم إلغاء الفاتورة." : "Invoice cancelled." };
}
