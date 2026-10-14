"use server";

import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isLocale } from "@/lib/i18n";
import { parseInvoiceWorkbook } from "@/features/imports/import.service";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export type ImportActionState = { error?: string; success?: string; batchId?: string };
const importPayloadSchema = z.object({
  invoiceNumber: z.string().min(1).max(100),
  merchantId: z.string().min(1),
  transactionDate: z.string().date(),
  dueDate: z.string().date().nullable(),
  totalAmount: z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/),
  description: z.string().min(1).max(200)
});

function localeFrom(data: FormData) {
  const value = data.get("locale");
  return typeof value === "string" && isLocale(value) ? value : "ar";
}

function auditMetadata(value: Headers) {
  return { ipAddress: value.get("x-real-ip"), userAgent: value.get("user-agent"), requestId: value.get("x-request-id") ?? randomUUID() };
}

export async function previewInvoiceImportAction(_previous: ImportActionState, data: FormData): Promise<ImportActionState> {
  const locale = localeFrom(data);
  const actor = await requirePermission("import.execute", locale);
  const file = data.get("file");
  if (!(file instanceof File) || !file.size) return { error: locale === "ar" ? "اختر ملف XLSX أو CSV." : "Choose an XLSX or CSV file." };
  if (file.size > 5 * 1024 * 1024) return { error: locale === "ar" ? "حجم الملف الأقصى 5 ميجابايت." : "The maximum file size is 5 MB." };
  let parsedRows;
  try {
    parsedRows = await parseInvoiceWorkbook(file.name, await file.arrayBuffer());
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) return { error: locale === "ar" ? `تعذر قراءة الملف: ${error.message}` : `Unable to read the file: ${error.message}` };
    throw error;
  }
  if (!parsedRows.length) return { error: locale === "ar" ? "الملف لا يحتوي على صفوف بيانات." : "The file has no data rows." };
  const merchantCodes = [...new Set(parsedRows.map((row) => row.merchantCode).filter(Boolean))];
  const invoiceNumbers = [...new Set(parsedRows.map((row) => row.invoiceNumber).filter(Boolean))];
  const [merchants, existingInvoices] = await Promise.all([
    prisma.merchant.findMany({ where: { merchantCode: { in: merchantCodes }, status: "ACTIVE" }, select: { id: true, merchantCode: true } }),
    prisma.invoice.findMany({ where: { invoiceNumber: { in: invoiceNumbers } }, select: { invoiceNumber: true } })
  ]);
  const merchantByCode = new Map(merchants.map((merchant) => [merchant.merchantCode.toUpperCase(), merchant.id]));
  const existingNumbers = new Set(existingInvoices.map((invoice) => invoice.invoiceNumber.toUpperCase()));
  const duplicateNumbers = new Set(parsedRows.filter((row, index) => parsedRows.some((other, otherIndex) => otherIndex !== index && other.invoiceNumber.toUpperCase() === row.invoiceNumber.toUpperCase())).map((row) => row.invoiceNumber.toUpperCase()));
  const validRows = parsedRows.map((row) => {
    const errors = [...row.errors];
    const merchantId = merchantByCode.get(row.merchantCode);
    if (!merchantId) errors.push("Merchant code is not active or does not exist.");
    if (existingNumbers.has(row.invoiceNumber.toUpperCase())) errors.push("Invoice number already exists.");
    if (duplicateNumbers.has(row.invoiceNumber.toUpperCase())) errors.push("Invoice number is duplicated in this file.");
    return {
      rowNumber: row.rowNumber,
      externalId: row.invoiceNumber || null,
      payload: {
        invoiceNumber: row.invoiceNumber,
        merchantCode: row.merchantCode,
        merchantId: merchantId ?? "",
        transactionDate: row.transactionDate,
        dueDate: row.dueDate,
        totalAmount: row.totalAmount,
        description: row.description
      },
      errors
    };
  });
  const successfulRows = validRows.filter((row) => !row.errors.length).length;
  const failedRows = validRows.length - successfulRows;
  const requestHeaders = await headers();
  const batch = await prisma.$transaction(async (tx) => {
    const created = await tx.importBatch.create({
      data: {
        fileName: file.name.slice(0, 255),
        importedById: actor.id,
        totalRows: validRows.length,
        successfulRows,
        failedRows,
        rows: { create: validRows.map((row) => ({ ...row, errors: row.errors })) }
      }
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id, action: "import.previewed", entityType: "ImportBatch", entityId: created.id,
        afterData: { fileName: created.fileName, totalRows: created.totalRows, successfulRows, failedRows },
        ...auditMetadata(requestHeaders)
      }
    });
    return created;
  });
  revalidatePath(`/${locale}/imports`);
  revalidatePath(`/${locale}/imports/${batch.id}`);
  return { success: locale === "ar" ? "انتهت المعاينة. راجع الصفوف والأخطاء قبل الاستيراد." : "Preview complete. Review rows and errors before importing.", batchId: batch.id };
}

export async function executeInvoiceImportAction(_previous: ImportActionState, data: FormData): Promise<ImportActionState> {
  const locale = localeFrom(data);
  const actor = await requirePermission("import.execute", locale);
  const batchId = data.get("batchId");
  if (typeof batchId !== "string" || !batchId) return { error: locale === "ar" ? "دفعة الاستيراد غير محددة." : "Import batch not specified." };
  const requestHeaders = await headers();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const batch = await tx.importBatch.findUnique({
        where: { id: batchId },
        select: { id: true, fileName: true, status: true, totalRows: true, rows: { orderBy: { rowNumber: "asc" }, select: { id: true, rowNumber: true, payload: true, errors: true, importedAt: true } } }
      });
      if (!batch) return { kind: "missing" as const };
      if (batch.status !== "VALIDATING") return { kind: "complete" as const };
      const rows = batch.rows.filter((row) => !row.importedAt && Array.isArray(row.errors) && row.errors.length === 0);
      if (!rows.length) return { kind: "empty" as const };
      const candidatePayloads = rows.map((row) => importPayloadSchema.safeParse(row.payload));
      const invalidIndexes = new Set(candidatePayloads.flatMap((payload, index) => payload.success ? [] : [index]));
      const ready = candidatePayloads.flatMap((payload, index) => payload.success && !invalidIndexes.has(index) ? [{ row: rows[index], payload: payload.data }] : []);
      if (!ready.length) return { kind: "empty" as const };
      const currentMerchants = await tx.merchant.findMany({
        where: { id: { in: [...new Set(ready.map((item) => item.payload.merchantId))] }, status: "ACTIVE" },
        select: { id: true }
      });
      const activeMerchantIds = new Set(currentMerchants.map((merchant) => merchant.id));
      if (ready.some((item) => !activeMerchantIds.has(item.payload.merchantId))) return { kind: "merchant" as const };
      const numbers = ready.map((item) => item.payload.invoiceNumber);
      const existing = await tx.invoice.findMany({ where: { invoiceNumber: { in: numbers } }, select: { invoiceNumber: true } });
      const existingNumbers = new Set(existing.map((invoice) => invoice.invoiceNumber.toUpperCase()));
      const duplicates = ready.filter((item) => existingNumbers.has(item.payload.invoiceNumber.toUpperCase()));
      for (const duplicate of duplicates) {
        await tx.importRow.update({ where: { id: duplicate.row.id }, data: { errors: ["Invoice number already exists at import time."] } });
      }
      const toImport = ready.filter((item) => !existingNumbers.has(item.payload.invoiceNumber.toUpperCase()));
      for (const item of toImport) {
        const amount = new Prisma.Decimal(item.payload.totalAmount);
        const invoice = await tx.invoice.create({
          data: {
            invoiceNumber: item.payload.invoiceNumber,
            merchantId: item.payload.merchantId,
            transactionDate: new Date(`${item.payload.transactionDate}T12:00:00`),
            dueDate: item.payload.dueDate ? new Date(`${item.payload.dueDate}T12:00:00`) : null,
            status: "CONFIRMED",
            subtotal: amount,
            totalAmount: amount,
            createdById: actor.id,
            items: { create: { description: item.payload.description, quantity: new Prisma.Decimal(1), unitPrice: amount, subtotal: amount } }
          }
        });
        await tx.importRow.update({ where: { id: item.row.id }, data: { importedAt: new Date() } });
        await tx.auditLog.create({
          data: {
            actorUserId: actor.id, action: "invoice.imported", entityType: "Invoice", entityId: invoice.id,
            afterData: { invoiceNumber: invoice.invoiceNumber, batchId, rowNumber: item.row.rowNumber, totalAmount: amount.toFixed(2) },
            ...auditMetadata(requestHeaders)
          }
        });
      }
      const remainingFailures = batch.rows.filter((row) => Array.isArray(row.errors) && row.errors.length > 0).length + duplicates.length;
      await tx.importBatch.update({
        where: { id: batch.id },
        data: {
          successfulRows: toImport.length,
          failedRows: remainingFailures,
          status: remainingFailures ? "COMPLETED_WITH_ERRORS" : "COMPLETED",
          completedAt: new Date()
        }
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id, action: "import.executed", entityType: "ImportBatch", entityId: batch.id,
          afterData: { fileName: batch.fileName, successfulRows: toImport.length, failedRows: remainingFailures },
          ...auditMetadata(requestHeaders)
        }
      });
      return { kind: "imported" as const, successfulRows: toImport.length, failedRows: remainingFailures };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (result.kind !== "imported") {
      return { error: result.kind === "missing" ? (locale === "ar" ? "دفعة الاستيراد غير موجودة." : "Import batch not found.") :
        result.kind === "complete" ? (locale === "ar" ? "تمت معالجة هذه الدفعة بالفعل." : "This batch has already been processed.") :
        result.kind === "merchant" ? (locale === "ar" ? "أحد التجار لم يعد نشطًا؛ أعد المعاينة." : "A merchant is no longer active; preview the file again.") :
        (locale === "ar" ? "لا توجد صفوف صالحة للاستيراد." : "There are no valid rows to import.") };
    }
    revalidatePath(`/${locale}/imports`);
    revalidatePath(`/${locale}/imports/${batchId}`);
    revalidatePath(`/${locale}/invoices`);
    revalidatePath(`/${locale}/dashboard`);
    return { success: locale === "ar" ? `تم استيراد ${result.successfulRows} صفًا، وتعذر استيراد ${result.failedRows} صفًا.` : `Imported ${result.successfulRows} rows; ${result.failedRows} rows were rejected.` };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: locale === "ar" ? "تكرر رقم فاتورة أثناء التنفيذ؛ لم تُحفظ الدفعة. أعد المعاينة للتحقق." : "An invoice number duplicated during import; the transaction was rolled back. Preview again." };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { error: locale === "ar" ? "تغيرت بيانات الدفعة أثناء الاستيراد؛ أعد المحاولة." : "The batch changed during import; retry." };
    }
    throw error;
  }
}
