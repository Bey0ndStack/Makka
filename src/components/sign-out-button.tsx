"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { LoaderCircle, LogOut } from "lucide-react";
import { translate, type Locale } from "@/lib/i18n";

export function SignOutButton({ locale }: { locale: Locale }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function handleSignOut() {
    setError(false);
    setPending(true);
    try {
      const result = await signOut({ callbackUrl: `/${locale}/login`, redirect: false });
      window.location.assign(result.url);
    } catch (error) {
      console.error("Sign-out request failed", error);
      setError(true);
      setPending(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={handleSignOut} disabled={pending} aria-busy={pending} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start text-sm text-slate-500 transition hover:bg-red-50 hover:text-red-700 disabled:cursor-wait disabled:opacity-60">
        {pending ? <LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <LogOut size={18} aria-hidden="true" />}
        <span>{pending ? (locale === "ar" ? "جارٍ تسجيل الخروج..." : "Signing out...") : translate(locale, "signOut")}</span>
      </button>
      {error && <p role="alert" className="px-3 text-xs text-rose-700">{locale === "ar" ? "تعذر تسجيل الخروج. حاول مرة أخرى." : "Could not sign out. Please try again."}</p>}
    </div>
  );
}
