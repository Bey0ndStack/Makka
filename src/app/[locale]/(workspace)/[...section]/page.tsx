import Link from "next/link";
import { Database, ShieldCheck } from "lucide-react";
import { BrandSectionBadge, type BrandSection } from "@/components/brand-section-badge";
import { CreateUserForm, UserRowActions } from "@/components/user-management-forms";
import { RoleManagement } from "@/components/role-management";
import { ImportBatchList } from "@/components/import-batch-list";
import { ImportUploadForm } from "@/components/import-upload-form";
import { formatDate } from "@/lib/format";
import { ReportsPanel } from "@/components/reports-panel";
import { isLocale, translate, type Locale, type TranslationKey } from "@/lib/i18n";
import { requirePermission, userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

const modules = {
  reports: {
    permission: "report.read",
    title: { ar: "التقارير", en: "Reports" },
    description: { ar: "تقارير مبنية مباشرة على المعاملات والفواتير المسجلة.", en: "Reports derived directly from recorded transactions and invoices." }
  },
  roadmap: {
    permission: "roadmap.read",
    title: { ar: "حالة المنصة", en: "Platform status" },
    description: { ar: "إيه اللي جاهز دلوقتي وإيه اللي لسه داخل في التطوير.", en: "What is ready now, and what is still being built." }
  },
  imports: {
    permission: "import.execute",
    title: { ar: "استيراد البيانات", en: "Data imports" },
    description: { ar: "سجل عمليات الاستيراد والتحقق من البيانات.", en: "Import history and validation results." }
  },
  users: {
    permission: "user.manage",
    title: { ar: "المستخدمون والصلاحيات", en: "Users and permissions" },
    description: { ar: "مستخدمو المنصة والأدوار المسندة إليهم.", en: "Platform users and their assigned roles." }
  },
  settings: {
    permission: "settings.manage",
    title: { ar: "الإعدادات", en: "Settings" },
    description: { ar: "إعدادات العرض والبيئة التشغيلية للمنصة.", en: "Platform display and operational environment settings." }
  }
} as const;

export default async function FoundationModulePage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string; section: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale: rawLocale, section }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(rawLocale)) notFound();
  const locale = rawLocale;
  const key = section[0] as keyof typeof modules | undefined;
  if (!key || !(key in modules) || section.length !== 1) notFound();
  const module = modules[key];
  const actor = await requirePermission(module.permission, locale);
  const isArabic = locale === "ar";

  if (key === "roadmap") {
    const services = [
      { status: "done", title: isArabic ? "التشغيل وقاعدة البيانات" : "Runtime and database", description: t(locale, "infrastructureSummary") },
      { status: "done", title: isArabic ? "السوق المحلي واللغة" : "Egyptian localization", description: t(locale, "localization") },
      { status: "done", title: isArabic ? "الحسابات والصلاحيات" : "Authentication and authorization", description: t(locale, "securitySummary") },
      { status: "done", title: isArabic ? "بيانات التجار" : "Merchant management", description: t(locale, "merchantsSummary") },
      { status: "done", title: isArabic ? "احتساب الأرصدة" : "Financial balances", description: t(locale, "financeSummary") },
      { status: "done", title: isArabic ? "إدارة الفواتير" : "Invoice management", description: t(locale, "invoiceManagement") },
      { status: "done", title: isArabic ? "مراقبة الدفتر المالي" : "Financial monitoring", description: t(locale, "dashboardSummary") },
      { status: "done", title: isArabic ? "التدقيق وسجل الأنشطة" : "Audit history", description: t(locale, "auditSummary") },
      { status: "done", title: isArabic ? "إدارة المستخدمين والأدوار" : "User and role management", description: t(locale, "userManagement") },
      { status: "done", title: isArabic ? "التحصيلات" : "Collections", description: t(locale, "paymentsSummary") },
      { status: "done", title: isArabic ? "التقارير والتصدير" : "Reports and exports", description: t(locale, "reportsSummary") },
      { status: "done", title: isArabic ? "استيراد البيانات" : "Spreadsheet imports", description: t(locale, "importsSummary") }
    ] as const;
    const pages = [
      { key: "merchantsDone", status: "done", href: "merchants" },
      { key: "dashboardDone", status: "done", href: "dashboard" },
      { key: "invoicesDone", status: "done", href: "invoices" },
      { key: "debtsDone", status: "done", href: "debts" },
      { key: "paymentsDone", status: "done", href: "payments" },
      { key: "auditDone", status: "done", href: "audit" },
      { key: "usersDone", status: "done", href: "users" },
      { key: "reportsDone", status: "done", href: "reports" },
      { key: "importsDone", status: "done", href: "imports" },
      { key: "settingsPartial", status: "partial", href: "settings" }
    ] as const;
    const upcoming = [
      { title: t(locale, "platformSettings"), area: isArabic ? "الإعدادات" : "Settings" }
    ];
    const statusClasses = { done: "bg-emerald-50 text-emerald-700", partial: "bg-amber-50 text-amber-700" };

    return (
      <div className="space-y-7">
        <PageHeading title={t(locale, "roadmapTitle")} description={t(locale, "roadmapDescription")} isArabic={isArabic} />
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-900">
          <span className="rounded-full bg-white px-3 py-1 text-xs font-bold">{t(locale, "localization")}</span>
          <span>{t(locale, "roadmapNote")}</span>
        </div>
        <section>
          <h2 className="mb-3 text-sm font-bold text-slate-800">{t(locale, "servicesTitle")}</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {services.map((service) => (
              <article key={service.title} className="rounded-xl border border-slate-200 bg-white p-4 shadow-panel">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-800">{service.title}</h3>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${statusClasses[service.status as keyof typeof statusClasses]}`}>{t(locale, service.status)}</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">{service.description}</p>
              </article>
            ))}
          </div>
        </section>
        <section>
          <h2 className="mb-3 text-sm font-bold text-slate-800">{t(locale, "pagesTitle")}</h2>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-panel">
            {pages.map((page) => (
              <Link key={page.href} href={`/${locale}/${page.href}`} className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5 last:border-0 hover:bg-sand">
                <span className="text-sm font-medium text-slate-700">{t(locale, page.key)}</span>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${statusClasses[page.status]}`}>{t(locale, page.status)}</span>
              </Link>
            ))}
          </div>
        </section>
        <section>
          <h2 className="mb-3 text-sm font-bold text-slate-800">{t(locale, "upcomingSections")}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {upcoming.map((item) => (
              <article key={item.area} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-panel">
                <div><h3 className="text-sm font-semibold text-slate-800">{item.area}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{item.title}</p></div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">{t(locale, "comingSoon")}</span>
              </article>
            ))}
          </div>
        </section>
      </div>
    );
  }

  if (key === "reports") {
    return <div className="space-y-6"><PageHeading title={module.title[locale]} description={module.description[locale]} isArabic={isArabic} badge="reports" /><ReportsPanel locale={locale} actorId={actor.id} searchParams={query} /></div>;
  }

  if (key === "settings") {
    const [roles, permissions, canManageRoles] = await Promise.all([
      prisma.role.findMany({
        orderBy: { name: "asc" },
        select: { id: true, key: true, name: true, description: true, permissions: { select: { permissionId: true } } }
      }),
      prisma.permission.findMany({
        where: { key: { notIn: ["role.manage", "settings.manage"] } },
        orderBy: { key: "asc" },
        select: { id: true, key: true, description: true }
      }),
      userHasPermission(actor.id, "role.manage")
    ]);
    return (
      <div className="space-y-6">
        <PageHeading title={module.title[locale]} description={module.description[locale]} isArabic={isArabic} />
        <section className="grid gap-4 sm:grid-cols-2">
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-panel"><div className="flex items-center gap-3"><Database size={19} className="text-brand-700" aria-hidden="true" /><h2 className="text-sm font-bold text-slate-800">{isArabic ? "اللغة الافتراضية" : "Default language"}</h2></div><p className="mt-3 text-sm text-slate-600">{isArabic ? "العربية المصرية (RTL)" : "Egyptian Arabic (RTL)"}</p><p className="mt-1 text-xs text-slate-400">{isArabic ? "يمكن التبديل إلى الإنجليزية من شريط التنقل." : "Switch to English from the workspace header."}</p></article>
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-panel"><div className="flex items-center gap-3"><ShieldCheck size={19} className="text-brand-700" aria-hidden="true" /><h2 className="text-sm font-bold text-slate-800">{isArabic ? "العملة المحلية" : "Local currency"}</h2></div><p className="mt-3 text-sm text-slate-600">{isArabic ? "الجنيه المصري (EGP)" : "Egyptian Pound (EGP)"}</p><p className="mt-1 text-xs text-slate-400">Africa/Cairo</p><p className="mt-3 text-xs text-slate-500">{isArabic ? "إعدادات السوق ثابتة حاليًا لحماية اتساق الدفتر المالي." : "Market settings are fixed to preserve financial ledger consistency."}</p></article>
        </section>
        <section className="space-y-3">
          <div><h2 className="text-base font-bold text-slate-900">{isArabic ? "الأدوار والصلاحيات" : "Roles and permissions"}</h2><p className="mt-1 text-xs text-slate-500">{isArabic ? "الأدوار الأساسية محمية؛ يمكنك إنشاء أدوار تشغيلية مخصصة." : "Built-in roles are protected; create custom operational roles."}</p></div>
          {canManageRoles
            ? <RoleManagement locale={locale} roles={roles.map((role) => ({ ...role, permissionIds: role.permissions.map((item) => item.permissionId) }))} permissions={permissions} />
            : <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">{isArabic ? "تحتاج صلاحية إدارة الأدوار لإجراء تغييرات." : "Role management permission is required to make changes."}</div>}
        </section>
      </div>
    );
  }

  if (key === "imports") {
    const batches = await prisma.importBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, fileName: true, totalRows: true, successfulRows: true, failedRows: true, status: true, createdAt: true, importedBy: { select: { name: true } } }
    });
    return <div className="space-y-6"><PageHeading title={module.title[locale]} description={module.description[locale]} isArabic={isArabic} /><ImportUploadForm locale={locale} /><ImportBatchList locale={locale} batches={batches} /></div>;
  }

  if (key === "users") {
    const [users, allRoles, canManagePrivilegedRoles] = await Promise.all([
      prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, name: true, email: true, status: true, lastLoginAt: true, roles: { select: { role: { select: { id: true, key: true, name: true } } } } }
      }),
      prisma.role.findMany({ orderBy: { name: "asc" }, select: { id: true, key: true, name: true } }),
      userHasPermission(actor.id, "role.manage")
    ]);
    const assignableRoles = canManagePrivilegedRoles ? allRoles : allRoles.filter((role) => role.key !== "OWNER");
    return (
      <div className="space-y-6">
        <PageHeading title={module.title[locale]} description={module.description[locale]} isArabic={isArabic} />
        <CreateUserForm locale={locale} roles={assignableRoles} />
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-panel">
          <div className="border-b border-slate-100 px-5 py-4 text-xs text-slate-500">{isArabic ? "آخر 50 مستخدمًا؛ كلمة المرور لا تُعرض بعد إنشائها." : "Latest 50 users; passwords are never displayed after creation."}</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-start text-sm">
              <thead className="bg-sand text-xs text-slate-500"><tr>{[isArabic ? "الاسم والبريد" : "Name and email", isArabic ? "الأدوار" : "Roles", isArabic ? "آخر دخول" : "Last login", isArabic ? "الحالة" : "Status", isArabic ? "الإدارة" : "Manage"].map((label) => <th key={label} className="px-5 py-3 text-start font-medium">{label}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-5 py-3.5"><span className="block font-semibold text-slate-800">{user.name}</span><span className="mt-1 block text-xs text-slate-500" dir="ltr">{user.email}</span></td>
                    <td className="px-5 py-3.5 text-slate-600">{user.roles.map((item) => item.role.name).join("، ") || "—"}</td>
                    <td className="px-5 py-3.5 text-slate-500">{user.lastLoginAt ? formatDate(user.lastLoginAt, locale) : "—"}</td>
                    <td className="px-5 py-3.5"><span className={`rounded-full px-2.5 py-1 text-[11px] ${user.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{user.status === "ACTIVE" ? (isArabic ? "نشط" : "Active") : (isArabic ? "موقوف" : "Suspended")}</span></td>
                    <td className="px-5 py-3.5"><UserRowActions locale={locale} userId={user.id} currentRoleId={user.roles[0]?.role.id ?? ""} currentStatus={user.status} roles={assignableRoles} disabled={user.id === actor.id || !user.roles.length} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }

  return <div className="space-y-6"><PageHeading title={module.title[locale]} description={module.description[locale]} isArabic={isArabic} /><section className="grid gap-4 sm:grid-cols-2"><article className="rounded-xl border border-slate-200 bg-white p-5 shadow-panel"><div className="flex items-center gap-3"><Database size={19} className="text-brand-700" aria-hidden="true" /><h2 className="text-sm font-bold text-slate-800">{isArabic ? "اللغة الافتراضية" : "Default language"}</h2></div><p className="mt-3 text-sm text-slate-600">{isArabic ? "العربية المصرية (RTL)" : "Egyptian Arabic (RTL)"}</p><p className="mt-1 text-xs text-slate-400">{isArabic ? "يمكن التبديل إلى الإنجليزية من شريط التنقل." : "Switch to English from the workspace header."}</p></article><article className="rounded-xl border border-slate-200 bg-white p-5 shadow-panel"><div className="flex items-center gap-3"><ShieldCheck size={19} className="text-brand-700" aria-hidden="true" /><h2 className="text-sm font-bold text-slate-800">{isArabic ? "العملة المحلية" : "Local currency"}</h2></div><p className="mt-3 text-sm text-slate-600">{isArabic ? "الجنيه المصري (EGP)" : "Egyptian Pound (EGP)"}</p><p className="mt-1 text-xs text-slate-400">Africa/Cairo</p><p className="mt-3 text-xs text-slate-500">{isArabic ? "العملة والمنطقة الزمنية ثابتتان حاليًا لحماية اتساق السجلات المالية." : "Currency and timezone are currently fixed to preserve financial record consistency."}</p></article></section></div>;
}

function PageHeading({ title, description, isArabic, badge }: { title: string; description: string; isArabic: boolean; badge?: BrandSection }) {
  return <div><p className="mb-2 text-xs font-medium text-brand-700">{isArabic ? "مساحات المنصة" : "Workspace"}</p><div className="flex items-center gap-3">{badge && <BrandSectionBadge section={badge} />}<h1 className="text-2xl font-bold text-slate-900">{title}</h1></div><p className="mt-1.5 text-sm text-slate-500">{description}</p></div>;
}

function t(locale: Locale, key: TranslationKey) {
  return translate(locale, key);
}
