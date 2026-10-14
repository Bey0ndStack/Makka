import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MerchantCreateForm } from "@/components/merchant-create-form";
import { isLocale } from "@/lib/i18n";
import { requirePermission } from "@/lib/permissions";
import { notFound } from "next/navigation";

export default async function NewMerchantPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale = rawLocale;
  await requirePermission("merchant.create", locale);
  const isArabic = locale === "ar";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/${locale}/merchants`} className="mb-4 inline-flex items-center gap-2 text-xs text-slate-500 hover:text-brand-700"><ArrowRight size={14} aria-hidden="true" />{isArabic ? "العودة إلى التجار" : "Back to merchants"}</Link>
        <h1 className="text-2xl font-bold text-slate-900">{isArabic ? "إضافة تاجر جديد" : "Add a merchant"}</h1>
        <p className="mt-1.5 text-sm text-slate-500">{isArabic ? "أدخل بيانات التاجر الأساسية. الأرصدة تُحتسب من الفواتير والتحصيلات." : "Enter the merchant's details. Balances are derived from invoices and collections."}</p>
      </div>
      <MerchantCreateForm locale={locale} />
    </div>
  );
}
