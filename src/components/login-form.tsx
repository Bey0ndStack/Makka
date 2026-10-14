"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { ArrowLeft, ArrowRight, LoaderCircle } from "lucide-react";
import { translate, type Locale } from "@/lib/i18n";

export function LoginForm({ locale }: { locale: Locale }) {
  const [error, setError] = useState(false);
  const [phase, setPhase] = useState<"idle" | "submitting" | "redirecting">("idle");
  const submitting = phase !== "idle";
  const isArabic = locale === "ar";
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  async function submit(formData: FormData) {
    setError(false);
    setPhase("submitting");
    try {
      const result = await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirect: false,
        callbackUrl: `/${locale}/dashboard`
      });
      if (!result?.ok) {
        setError(true);
        setPhase("idle");
        return;
      }
      setPhase("redirecting");
      window.location.assign(result.url ?? `/${locale}/dashboard`);
    } catch (cause) {
      console.error("Sign-in request failed", cause);
      setError(true);
      setPhase("idle");
    }
  }

  return (
    <form action={submit} aria-busy={submitting} className="mt-8 space-y-5">
      <label className="block space-y-2 text-sm font-medium text-slate-700">
        <span>{t("email")}</span>
        <input name="email" type="email" autoComplete="username" required maxLength={254} dir="ltr" disabled={submitting} className="h-12 w-full rounded-lg border border-slate-200 bg-white px-3 text-start outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-100 disabled:opacity-60" placeholder="name@company.com" />
      </label>
      <label className="block space-y-2 text-sm font-medium text-slate-700">
        <span>{t("password")}</span>
        <input name="password" type="password" autoComplete="current-password" required maxLength={128} disabled={submitting} className="h-12 w-full rounded-lg border border-slate-200 bg-white px-3 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100 disabled:opacity-60" />
      </label>
      {error && <p role="alert" className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{t("loginFailed")}</p>}
      {submitting && <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-brand-700">
        <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {phase === "redirecting"
          ? (isArabic ? "تم تسجيل الدخول، جارٍ تحويلك إلى لوحة التحكم..." : "Signed in. Redirecting to your dashboard...")
          : (isArabic ? "جارٍ التحقق من بيانات الدخول..." : "Checking your sign-in details...")}
      </p>}
      <button disabled={submitting} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 font-semibold text-white transition hover:bg-brand-800 disabled:cursor-wait disabled:opacity-70">
        {submitting ? <LoaderCircle size={17} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
        <span>{submitting ? (phase === "redirecting" ? (isArabic ? "جارٍ التحويل..." : "Redirecting...") : (isArabic ? "جارٍ تسجيل الدخول..." : "Signing in...")) : t("login")}</span>
        {!submitting && (isArabic ? <ArrowLeft size={17} aria-hidden="true" /> : <ArrowRight size={17} aria-hidden="true" />)}
      </button>
    </form>
  );
}
