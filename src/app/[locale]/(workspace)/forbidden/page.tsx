import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export default async function ForbiddenPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const isArabic = locale === "ar";
  return (
    <div className="mx-auto mt-16 max-w-lg rounded-xl border border-slate-200 bg-white p-8 text-center shadow-panel">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-700"><ShieldAlert size={23} aria-hidden="true" /></span>
      <h1 className="mt-4 text-xl font-bold text-slate-900">{isArabic ? "لا تملك الصلاحية المطلوبة" : "Permission required"}</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">{isArabic ? "ليس لديك الإذن لعرض هذه الصفحة أو تنفيذ هذا الإجراء." : "You are not allowed to view this page or perform this action."}</p>
      <Link href={`/${locale}/dashboard`} className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800">{isArabic ? "العودة إلى لوحة المعلومات" : "Return to dashboard"}</Link>
    </div>
  );
}
