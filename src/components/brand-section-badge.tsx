import Image from "next/image";

export type BrandSection = "merchants" | "invoices" | "payments" | "debts" | "reports" | "audit";

const badgeAssets: Record<BrandSection, string> = {
  merchants: "/icons-badge/merchants-badge.svg",
  invoices: "/icons-badge/invoices-badge.svg",
  payments: "/icons-badge/payments-badge.svg",
  debts: "/icons-badge/debts-badge.svg",
  reports: "/icons-badge/reports-badge.svg",
  audit: "/icons-badge/audit-badge.svg"
};

export function BrandSectionBadge({ section }: { section: BrandSection }) {
  return (
    <Image
      src={badgeAssets[section]}
      alt=""
      aria-hidden="true"
      width={52}
      height={52}
      className="h-11 w-11 shrink-0 object-contain sm:h-[52px] sm:w-[52px]"
    />
  );
}
