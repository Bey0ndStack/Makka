import { cache } from "react";
import { prisma } from "@/lib/prisma";

export const getInvoiceDocument = cache((id: string) => prisma.invoice.findUnique({
  where: { id },
  select: {
    id: true,
    invoiceNumber: true,
    internalNumber: true,
    transactionDate: true,
    dueDate: true,
    status: true,
    notes: true,
    subtotal: true,
    taxRate: true,
    taxAmount: true,
    totalAmount: true,
    merchant: { select: { name: true, merchantCode: true, taxNumber: true, phone: true, address: true, city: true, region: true } },
    items: { orderBy: { id: "asc" }, select: { id: true, codeName: true, itemCode: true, unit: true, description: true, quantity: true, unitPrice: true, subtotal: true } }
  }
}));

const cairoDateParts = (value: Date) => Object.fromEntries(new Intl.DateTimeFormat("en-US", {
  timeZone: "Africa/Cairo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23"
}).formatToParts(value).map((part) => [part.type, part.value]));

const arabicDigits = (value: string) => value.replace(/\d/g, (digit) => "٠١٢٣٤٥٦٧٨٩"[Number(digit)]);

/** Formats a date as yyyy/mm/dd with Arabic-Indic digits, as on the reference invoice. */
export function printedDate(value: Date) {
  const parts = cairoDateParts(value);
  return arabicDigits(`${parts.year}/${parts.month}/${parts.day}`);
}

export function printedDateTime(value: Date) {
  const parts = cairoDateParts(value);
  return arabicDigits(`${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`);
}

export function isoDate(value: Date) {
  const parts = cairoDateParts(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
}
