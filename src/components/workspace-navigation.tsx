"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowDownUp, Banknote, BarChart3, BookOpenCheck, CircleDollarSign, ClipboardList,
  FileSpreadsheet, LayoutDashboard, Settings2, Store, Users, WalletCards
} from "lucide-react";
import { translate, type Locale, type TranslationKey } from "@/lib/i18n";

const navGroups: {
  heading: TranslationKey;
  links: { href: string; key: TranslationKey; icon: typeof LayoutDashboard; permission: string }[];
}[] = [
  {
    heading: "overview",
    links: [
      { href: "dashboard", key: "dashboard", icon: LayoutDashboard, permission: "dashboard.read" },
      { href: "roadmap", key: "roadmap", icon: ClipboardList, permission: "roadmap.read" }
    ]
  },
  {
    heading: "operations",
    links: [
      { href: "merchants", key: "merchants", icon: Store, permission: "merchant.read" },
      { href: "invoices", key: "invoices", icon: FileSpreadsheet, permission: "invoice.read" },
      { href: "payments", key: "payments", icon: WalletCards, permission: "payment.read" },
      { href: "debts", key: "debts", icon: CircleDollarSign, permission: "debt.read" },
      { href: "cheques", key: "cheques", icon: Banknote, permission: "cheque.read" },
      { href: "reports", key: "reports", icon: BarChart3, permission: "report.read" },
      { href: "imports", key: "imports", icon: ArrowDownUp, permission: "import.execute" }
    ]
  },
  {
    heading: "administration",
    links: [
      { href: "audit", key: "audit", icon: BookOpenCheck, permission: "audit.read" },
      { href: "users", key: "users", icon: Users, permission: "user.manage" },
      { href: "settings", key: "settings", icon: Settings2, permission: "settings.manage" }
    ]
  }
];

export function WorkspaceNavigation({ locale, permissionKeys }: { locale: Locale; permissionKeys: string[] }) {
  const pathname = usePathname();
  const basePath = `/${locale}`;
  const permissionSet = new Set(permissionKeys);

  return (
    <nav aria-label={locale === "ar" ? "التنقل الرئيسي" : "Main navigation"} className="flex-1 overflow-x-auto px-3 py-4 md:overflow-visible">
      {navGroups
        .map((group) => ({ ...group, links: group.links.filter((link) => permissionSet.has(link.permission)) }))
        .filter((group) => group.links.length > 0)
        .map((group) => (
          <div key={group.heading} className="mb-4">
            <p className="px-3 pb-2 text-[10px] font-semibold tracking-[0.08em] text-slate-400">{translate(locale, group.heading)}</p>
            <div className="flex gap-1 md:flex-col">
              {group.links.map(({ href, key, icon: Icon }) => {
                const target = `${basePath}/${href}`;
                const active = pathname === target || pathname.startsWith(`${target}/`);
                return (
                  <Link
                    key={href}
                    href={target}
                    aria-current={active ? "page" : undefined}
                    className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition ${
                      active
                        ? "bg-brand-50 text-brand-800 ring-1 ring-inset ring-brand-100"
                        : "text-slate-600 hover:bg-brand-50 hover:text-brand-800"
                    }`}
                  >
                    <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
                    <span className="whitespace-nowrap">{translate(locale, key)}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
    </nav>
  );
}
