import Link from "next/link";
import { Languages } from "lucide-react";
import { translate, type Locale } from "@/lib/i18n";

export function LanguageSwitch({ locale, pathname }: { locale: Locale; pathname: string }) {
  const nextLocale = locale === "ar" ? "en" : "ar";
  const href = pathname.replace(/^\/(ar|en)(?=\/|$)/, `/${nextLocale}`);
  return (
    <Link href={href} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 transition hover:border-brand-300 hover:text-brand-700" aria-label={translate(locale, "language")}>
      <Languages size={16} aria-hidden="true" />
      <span>{translate(locale, "language")}</span>
    </Link>
  );
}
