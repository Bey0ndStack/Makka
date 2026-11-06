import { Prisma } from "@prisma/client";

export type InvoiceLineInput = {
  description: string;
  quantity: string;
  unitPrice: string;
  codeName?: string;
  itemCode?: string;
  unit?: string;
};

const MAX_TOTAL = new Prisma.Decimal("10000000000");

export function calculateInvoiceTotals(items: InvoiceLineInput[], taxRatePercent: string) {
  const taxRate = new Prisma.Decimal(taxRatePercent);
  if (!taxRate.isFinite() || taxRate.lt(0) || taxRate.gt(100)) return null;
  const normalized = items.map((item) => {
    const quantity = new Prisma.Decimal(item.quantity);
    const unitPrice = new Prisma.Decimal(item.unitPrice);
    return {
      description: item.description,
      codeName: item.codeName || null,
      itemCode: item.itemCode || null,
      unit: item.unit || null,
      quantity,
      unitPrice,
      subtotal: quantity.mul(unitPrice).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
    };
  });
  if (normalized.some((item) => item.quantity.lte(0) || item.unitPrice.lt(0))) return null;
  const subtotal = normalized.reduce((sum, item) => sum.plus(item.subtotal), new Prisma.Decimal(0));
  const taxAmount = subtotal.mul(taxRate).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const total = subtotal.plus(taxAmount);
  if (subtotal.lte(0) || total.gte(MAX_TOTAL)) return null;
  return { normalized, subtotal, taxRate, taxAmount, total };
}
