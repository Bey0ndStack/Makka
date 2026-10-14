import Image from "next/image";
import { ShieldCheck } from "lucide-react";
import { LanguageSwitch } from "@/components/language-switch";
import { LoginForm } from "@/components/login-form";
import { BrandMark } from "@/components/brand-mark";
import { isLocale, translate } from "@/lib/i18n";
import { notFound } from "next/navigation";

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale = rawLocale;

  return (
    <main className="grid min-h-screen overflow-hidden bg-[#f7f7f3] lg:grid-cols-2" dir={locale === "ar" ? "rtl" : "ltr"}>
      <section className="relative hidden min-h-screen flex-col justify-between overflow-hidden bg-brand-800 p-10 text-white lg:flex xl:p-14">
        <div className="absolute inset-0 bg-cover bg-center opacity-50" style={{ backgroundImage: "url('/app/login-background.svg')" }} />
        <div className="relative z-10 flex items-center gap-3">
          <Image src="/logo/makkah-lockup-reverse.svg" alt="مكة — Makkah" width={150} height={52} priority />
        </div>
        <div className="relative z-10 max-w-md">
          <p className="mb-4 text-sm text-brand-100">{translate(locale, "workspace")}</p>
          <p className="text-3xl font-semibold leading-relaxed">وضوح في الحسابات،<br />وثقة في كل معاملة.</p>
          <div className="mt-7 h-px w-14 bg-gold" />
          <p className="mt-5 text-sm text-brand-100">منصة واحدة لإدارة التجار والفواتير والتحصيلات.</p>
        </div>
        <p className="relative z-10 text-xs text-brand-100">Makkah · Financial operations</p>
      </section>
      <div className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
      <section className="relative w-full max-w-[440px] rounded-2xl border border-slate-200/80 bg-white p-7 shadow-panel sm:p-10">
        <div className="absolute end-5 top-5">
          <LanguageSwitch locale={locale} pathname={`/${locale}/login`} />
        </div>
        <div className="mb-8 flex justify-center pt-12 lg:hidden">
          <BrandMark size={54} />
        </div>
        <div className="text-center">
          <div className="mx-auto mb-5 hidden h-14 w-14 items-center justify-center rounded-xl bg-brand-50 lg:flex">
            <Image src="/logo/makkah-mark-color.svg" width={38} height={38} alt="" aria-hidden="true" />
          </div>
          <p className="mb-2 text-sm font-medium text-brand-700">مكة <span className="mx-1 text-slate-300">/</span> Makkah</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{translate(locale, "loginTitle")}</h1>
          <p className="mt-2 text-sm text-slate-500">{translate(locale, "loginDescription")}</p>
        </div>
        <LoginForm locale={locale} />
        <p className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-400">
          <ShieldCheck size={15} className="text-brand-600" aria-hidden="true" />
          {translate(locale, "secureAccess")}
        </p>
      </section>
        </div>
    </main>
  );
}
