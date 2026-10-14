import { Prisma } from "@prisma/client";
import type { Locale } from "@/lib/i18n";
import { market } from "@/lib/market";

export function formatCurrency(value: string | number, locale: Locale) {
  let amount: string;
  try {
    const decimal = new Prisma.Decimal(value);
    if (!decimal.isFinite()) {
      throw new TypeError("Currency amounts must be finite decimal numbers.");
    }
    amount = decimal.toFixed(2);
  } catch {
    throw new TypeError("Currency amounts must be finite decimal numbers.");
  }
  const localeName = locale === "ar" ? market.arabicLocale : market.englishLocale;
  const isNegative = amount.startsWith("-");
  const [integerPart, decimalPart] = amount.replace(/^-/, "").split(".");
  const parts = new Intl.NumberFormat(localeName, {
    style: "currency",
    currency: market.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).formatToParts(BigInt(`${isNegative ? "-" : ""}${integerPart}`));
  if (decimalPart === undefined) {
    throw new TypeError("Currency formatting does not support the configured locale.");
  }
  const digitFormatter = new Intl.NumberFormat(localeName, { useGrouping: false });
  const localizedFraction = decimalPart.replace(/\d/g, (digit) => digitFormatter.format(Number(digit)));
  return parts.map((part) => part.type === "fraction" ? localizedFraction : part.value).join("");
}

export function formatDate(value: Date, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? market.arabicLocale : market.englishLocale, {
    timeZone: market.timeZone,
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(value);
}
