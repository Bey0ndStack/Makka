"use server";

import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isLocale } from "@/lib/i18n";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const chequeSchema = z.object({
  companyName: z.string().trim().min(2).max(150),
  amount: z.string().trim().regex(/^\d{1,10}(?:\.\d{1,2})?$/),
  chequeDate: z.string().date(),
  chequeNumber: z.string().trim().min(1).max(40),
  bankName: z.string().trim().min(2).max(120),
  notes: z.string().trim().max(500).optional()
});
const statusSchema = z.object({
  chequeId: z.string().min(1),
  status: z.enum(["PENDING", "CLEARED", "BOUNCED"])
});

export type ChequeFormState = {
  error?: string;
  success?: string;
  fieldErrors?: Partial<Record<keyof z.input<typeof chequeSchema>, string[]>>;
};

function localeFrom(formData: FormData) {
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

export async function createChequeAction(_previous: ChequeFormState, formData: FormData): Promise<ChequeFormState> {
  const locale = localeFrom(formData);
  const actor = await requirePermission("cheque.create", locale);
  const parsed = chequeSchema.safeParse({
    companyName: formData.get("companyName"),
    amount: formData.get("amount"),
    chequeDate: formData.get("chequeDate"),
    chequeNumber: formData.get("chequeNumber"),
    bankName: formData.get("bankName"),
    notes: formData.get("notes") || undefined
  });
  if (!parsed.success) {
    return {
      error: locale === "ar" ? "راجع بيانات الشيك ثم حاول مرة أخرى." : "Check the cheque details and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors
    };
  }
  const amount = new Prisma.Decimal(parsed.data.amount);
  if (amount.lte(0)) return { error: locale === "ar" ? "مبلغ الشيك يجب أن يكون أكبر من صفر." : "The cheque amount must be greater than zero." };

  const metadata = requestMetadata(await headers());
  const result = await prisma.$transaction(async (tx) => {
    const duplicate = await tx.cheque.findFirst({
      where: { chequeNumber: parsed.data.chequeNumber, bankName: { equals: parsed.data.bankName, mode: "insensitive" } },
      select: { id: true }
    });
    if (duplicate) return null;
    const cheque = await tx.cheque.create({
      data: {
        companyName: parsed.data.companyName,
        amount,
        chequeDate: new Date(`${parsed.data.chequeDate}T00:00:00Z`),
        chequeNumber: parsed.data.chequeNumber,
        bankName: parsed.data.bankName,
        notes: parsed.data.notes || null,
        createdById: actor.id
      }
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "cheque.created",
        entityType: "Cheque",
        entityId: cheque.id,
        afterData: { companyName: cheque.companyName, amount: amount.toFixed(2), chequeDate: parsed.data.chequeDate, chequeNumber: cheque.chequeNumber, bankName: cheque.bankName },
        ...metadata
      }
    });
    return cheque;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  if (!result) return { error: locale === "ar" ? "هذا الشيك مسجل بالفعل لنفس البنك." : "This cheque number is already recorded for this bank." };
  revalidatePath(`/${locale}/cheques`);
  return { success: locale === "ar" ? "تم تسجيل الشيك." : "Cheque recorded." };
}

export async function updateChequeStatusAction(_previous: ChequeFormState, formData: FormData): Promise<ChequeFormState> {
  const locale = localeFrom(formData);
  const actor = await requirePermission("cheque.update", locale);
  const parsed = statusSchema.safeParse({ chequeId: formData.get("chequeId"), status: formData.get("status") });
  if (!parsed.success) return { error: locale === "ar" ? "حالة غير صالحة." : "Invalid status." };

  const metadata = requestMetadata(await headers());
  const result = await prisma.$transaction(async (tx) => {
    const cheque = await tx.cheque.findUnique({ where: { id: parsed.data.chequeId }, select: { id: true, status: true, chequeNumber: true } });
    if (!cheque) return "missing" as const;
    if (cheque.status === parsed.data.status) return "unchanged" as const;
    await tx.cheque.update({ where: { id: cheque.id }, data: { status: parsed.data.status, updatedById: actor.id } });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "cheque.status_changed",
        entityType: "Cheque",
        entityId: cheque.id,
        beforeData: { status: cheque.status },
        afterData: { status: parsed.data.status, chequeNumber: cheque.chequeNumber },
        ...metadata
      }
    });
    return "updated" as const;
  });

  if (result === "missing") return { error: locale === "ar" ? "الشيك غير موجود." : "Cheque not found." };
  revalidatePath(`/${locale}/cheques`);
  return { success: locale === "ar" ? "تم تحديث الحالة." : "Status updated." };
}
