import { Prisma } from "@prisma/client";

export function calculateOutstanding(
  invoiceAmount: Prisma.Decimal.Value,
  allocatedPayments: readonly Prisma.Decimal.Value[]
): Prisma.Decimal {
  const startingAmount = new Prisma.Decimal(invoiceAmount);
  return allocatedPayments.reduce<Prisma.Decimal>(
    (remaining, amount) => remaining.minus(new Prisma.Decimal(amount)),
    startingAmount
  );
}
