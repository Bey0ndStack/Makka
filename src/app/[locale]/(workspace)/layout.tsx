import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, ChevronDown } from "lucide-react";
import { LanguageSwitch } from "@/components/language-switch";
import { SignOutButton } from "@/components/sign-out-button";
import { WorkspaceSearch } from "@/components/workspace-search";
import { WorkspaceNavigation } from "@/components/workspace-navigation";
import { MakkaAIChat } from "@/components/makka-ai-chat";
import { isLocale, translate, type Locale } from "@/lib/i18n";
import { isMakkaAIConfigured } from "@/lib/makka-ai";
import { getUserPermissionKeys, getWorkspaceSession, getWorkspaceUser } from "@/lib/permissions";
import { notFound } from "next/navigation";

export default async function WorkspaceLayout({
  children,
  params
}: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  const session = await getWorkspaceSession();
  if (!session?.user?.id) redirect(`/${locale}/login`);

  const [user, permissions] = await Promise.all([
    getWorkspaceUser(session.user.id),
    getUserPermissionKeys(session.user.id)
  ]);
  if (!user || user.status !== "ACTIVE") redirect(`/${locale}/login`);

  const pathname = `/${locale}`;
  const isArabic = locale === "ar";
  return (
    <div className="min-h-screen md:flex">
      <aside className="flex w-full shrink-0 flex-col border-b border-slate-200 bg-white md:min-h-screen md:w-[250px] md:border-b-0 md:border-e">
        <Link href={`${pathname}/dashboard`} className="flex h-[76px] items-center gap-3 border-b border-slate-100 px-5">
          <Image src="/logo/makkah-lockup-color.svg" alt="مكة — Makkah" width={150} height={52} priority />
        </Link>
        <WorkspaceNavigation locale={locale} permissionKeys={[...permissions]} />
        <div className="hidden border-t border-slate-100 p-3 md:block">
          <div className="mb-2 flex items-center gap-3 rounded-lg bg-sand p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800">{user.name.slice(0, 1)}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800">{user.name}</p>
              <p className="truncate text-xs text-slate-500">{user.roles[0]?.role.name ?? (isArabic ? "مستخدم" : "User")}</p>
            </div>
            <ChevronDown size={15} className="text-slate-400" aria-hidden="true" />
          </div>
          <SignOutButton locale={locale} />
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex h-[68px] items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-7">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Activity size={16} className="text-brand-600" aria-hidden="true" />
            <span>{translate(locale, "workspace")}</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <WorkspaceSearch locale={locale} />
            <LanguageSwitch locale={locale} pathname={pathname} />
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800 md:hidden" title={user.name}>{user.name.slice(0, 1)}</div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-7 sm:py-8">{children}</main>
      </div>
      <MakkaAIChat locale={locale} configured={isMakkaAIConfigured()} />
    </div>
  );
}
