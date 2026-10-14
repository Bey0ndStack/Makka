"use server";

import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isLocale } from "@/lib/i18n";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const amountSchema = z.string().trim().regex(/^\d{1,10}(?:\.\d{1,2})?$/);
const allocationsSchema = z.array(z.object({
  invoiceId: z.string().min(1),
  amount: amountSchema
})).max(100);

export type PaymentFormState = { error?: string; success?: string };

function getLocale(formData: FormData) {
  const value = formData.get("locale");
  return typeof value === "string" && isLocale(value) ? value : "ar";
}

function requestMetadata(requestHeaders: Headers) {
  return {
    ipAddress: requestHeaders.get("x-real-ip"),
    userAgent: requestHeaders.get("user-agent"),
    requestId: requestHeaders.get("x-request-id") ?? randomUUID()
  };
}

export async function createPaymentAction(_previous: PaymentFormState, formData: FormData): Promise<PaymentFormState> {
  const locale = getLocale(formData);
  const actor = await requirePermission("payment.create", locale);
  const rawAllocations = formData.get("allocations");
  let allocationsInput: unknown;
  try {
    allocationsInput = JSON.parse(typeof rawAllocations === "string" ? rawAllocations : "[]");
  } catch {
    return { error: locale === "ar" ? "بيانات توزيع التحصيل غير صالحة." : "The allocation data is invalid." };
  }
  const parsed = z.object({
    merchantId: z.string().min(1),
    amount: amountSchema,
    paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "CARD", "OTHER"]),
    paymentDate: z.string().date(),
    reference: z.string().trim().max(100).optional(),
    notes: z.string().trim().max(1000).optional(),
    allocations: allocationsSchema
  }).safeParse({
    merchantId: formData.get("merchantId"),
    amount: formData.get("amount"),
    paymentMethod: formData.get("paymentMethod"),
    paymentDate: formData.get("paymentDate"),
    reference: formData.get("reference") || undefined,
    notes: formData.get("notes") || undefined,
    allocations: allocationsInput
  });
  if (!parsed.success) {
    return { error: locale === "ar" ? "راجع بيانات التحصيل والمبالغ المدخلة." : "Check the collection details and amounts." };
  }

  const total = new Prisma.Decimal(parsed.data.amount);
  const requested = parsed.data.allocations.map((item) => ({ ...item, amount: new Prisma.Decimal(item.amount) }));
  if (total.lte(0) || requested.some((item) => item.amount.lte(0))) {
    return { error: locale === "ar" ? "يجب أن تكون المبالغ أكبر من صفر." : "Amounts must be greater than zero." };
  }
  const allocatedTotal = requested.reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
  if (allocatedTotal.gt(total)) {
    return { error: locale === "ar" ? "إجمالي التوزيع لا يمكن أن يتجاوز قيمة التحصيل." : "Allocations cannot exceed the payment amount." };
  }
  if (new Set(requested.map((item) => item.invoiceId)).size !== requested.length) {
    return { error: locale === "ar" ? "لا يمكن اختيار الفاتورة أكثر من مرة." : "An invoice can only be selected once." };
  }

  const requestHeaders = await headers();
  const metadata = requestMetadata(requestHeaders);
  try {
    await prisma.$transaction(async (tx) => {
      const merchant = await tx.merchant.findFirst({
        where: { id: parsed.data.merchantId, status: "ACTIVE" },
        select: { id: true }
      });
      if (!merchant) throw new Error("PAYMENT_MERCHANT_UNAVAILABLE");

      const invoices = requested.length ? await tx.invoice.findMany({
        where: {
          id: { in: requested.map((item) => item.invoiceId) },
          merchantId: merchant.id,
          status: "CONFIRMED"
        },
        select: {
          id: true,
          invoiceNumber: true,
          totalAmount: true,
          allocations: { where: { payment: { status: "COMPLETED" } }, select: { amount: true } }
        }
      }) : [];
      if (invoices.length !== requested.length) throw new Error("PAYMENT_INVOICE_UNAVAILABLE");
      for (const allocation of requested) {
        const invoice = invoices.find((item) => item.id === allocation.invoiceId);
        const alreadyAllocated = invoice!.allocations.reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
        if (alreadyAllocated.plus(allocation.amount).gt(invoice!.totalAmount)) throw new Error("PAYMENT_ALLOCATION_EXCEEDS_BALANCE");
      }

      const payment = await tx.payment.create({
        data: {
          merchantId: merchant.id,
          amount: total,
          paymentDate: new Date(`${parsed.data.paymentDate}T12:00:00`),
          paymentMethod: parsed.data.paymentMethod,
          reference: parsed.data.reference || null,
          notes: parsed.data.notes || null,
          createdById: actor.id,
          allocations: {
            create: requested.map((item) => ({ invoiceId: item.invoiceId, amount: item.amount, createdById: actor.id }))
          }
        }
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: "payment.created",
          entityType: "Payment",
          entityId: payment.id,
          afterData: {
            merchantId: merchant.id,
            amount: total.toFixed(2),
            reference: payment.reference,
            allocations: requested.map((item) => ({ invoiceId: item.invoiceId, amount: item.amount.toFixed(2) }))
          },
          ...metadata
        }
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Error && error.message === "PAYMENT_MERCHANT_UNAVAILABLE") {
      return { error: locale === "ar" ? "التاجر غير موجود أو غير نشط." : "The merchant does not exist or is inactive." };
    }
    if (error instanceof Error && error.message === "PAYMENT_INVOICE_UNAVAILABLE") {
      return { error: locale === "ar" ? "اختر فواتير مؤكدة تخص التاجر المحدد." : "Choose confirmed invoices belonging to this merchant." };
    }
    if (error instanceof Error && error.message === "PAYMENT_ALLOCATION_EXCEEDS_BALANCE") {
      return { error: locale === "ar" ? "أحد التوزيعات يتجاوز الرصيد المتبقي للفاتورة." : "An allocation exceeds its invoice's remaining balance." };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { error: locale === "ar" ? "تغيرت الأرصدة أثناء الحفظ. راجع الفواتير وحاول مرة أخرى." : "Balances changed while saving. Refresh the invoices and retry." };
    }
    throw error;
  }

  revalidatePath(`/${locale}/payments`);
  revalidatePath(`/${locale}/dashboard`);
  revalidatePath(`/${locale}/invoices`);
  revalidatePath(`/${locale}/debts`);
  return { success: locale === "ar" ? "تم تسجيل التحصيل وتوزيعه بنجاح." : "The payment was recorded and allocated." };
}

export async function reversePaymentAction(_previous: PaymentFormState, formData: FormData): Promise<PaymentFormState> {
  const locale = getLocale(formData);
  const actor = await requirePermission("payment.reverse", locale);
  const parsed = z.object({
    paymentId: z.string().min(1),
    reason: z.string().trim().min(3).max(500)
  }).safeParse({ paymentId: formData.get("paymentId"), reason: formData.get("reason") });
  if (!parsed.success) return { error: locale === "ar" ? "اكتب سبب عكس التحصيل (3 أحرف على الأقل)." : "Enter a reversal reason (at least 3 characters)." };

  const requestHeaders = await headers();
  const metadata = requestMetadata(requestHeaders);
  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: parsed.data.paymentId },
      select: { id: true, amount: true, reference: true, status: true, merchantId: true }
    });
    if (!payment) return "missing" as const;
    if (payment.status !== "COMPLETED") return "reversed" as const;
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "REVERSED", reversedAt: new Date(), reversedById: actor.id, reversalReason: parsed.data.reason }
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "payment.reversed",
        entityType: "Payment",
        entityId: payment.id,
        beforeData: { status: payment.status, amount: payment.amount.toString() },
        afterData: { status: "REVERSED", reason: parsed.data.reason, reference: payment.reference },
        ...metadata
      }
    });
    return "reversed-now" as const;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  if (result !== "reversed-now") return {
    error: result === "missing"
      ? (locale === "ar" ? "التحصيل غير موجود." : "Payment not found.")
      : (locale === "ar" ? "هذا التحصيل معكوس بالفعل." : "This payment is already reversed.")
  };
  revalidatePath(`/${locale}/payments`);
  revalidatePath(`/${locale}/dashboard`);
  revalidatePath(`/${locale}/invoices`);
  revalidatePath(`/${locale}/debts`);
  return { success: locale === "ar" ? "تم عكس التحصيل." : "Payment reversed." };
}
