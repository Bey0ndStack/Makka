import Link from "next/link";
import Form from "next/form";
import { Search } from "lucide-react";
import { BrandSectionBadge } from "@/components/brand-section-badge";
import { isLocale } from "@/lib/i18n";
import { market } from "@/lib/market";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";

const getAuditFilterOptions = unstable_cache(async () => {
  const [actors, actions, entityTypes] = await Promise.all([
    prisma.user.findMany({ where: { auditLogs: { some: {} } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.auditLog.groupBy({ by: ["action"], orderBy: { action: "asc" } }),
    prisma.auditLog.groupBy({ by: ["entityType"], orderBy: { entityType: "asc" } })
  ]);
  return { actors, actions: actions.map((item) => item.action), entityTypes: entityTypes.map((item) => item.entityType) };
}, ["audit-filter-options"], { revalidate: 300 });

export default async function AuditPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; actor?: string; action?: string; entity?: string; from?: string; to?: string; page?: string }>;
}) {
  const [{ locale: rawLocale }, filters] = await Promise.all([params, searchParams]);
  if (!isLocale(rawLocale)) notFound();
  const locale = rawLocale;
  await requirePermission("audit.read", locale);

  const isArabic = locale === "ar";
  const query = (filters.q ?? "").trim().slice(0, 100);
  const fromDate = filters.from && !Number.isNaN(Date.parse(filters.from)) ? new Date(filters.from) : undefined;
  const toDate = filters.to && !Number.isNaN(Date.parse(filters.to)) ? new Date(filters.to) : undefined;
  const page = Math.min(100_000, Math.max(1, Number.isSafeInteger(Number(filters.page)) ? Number(filters.page) : 1));
  const where = {
    ...(query ? { OR: [
      { action: { contains: query, mode: "insensitive" as const } },
      { entityType: { contains: query, mode: "insensitive" as const } },
      { entityId: { contains: query, mode: "insensitive" as const } },
      { actor: { name: { contains: query, mode: "insensitive" as const } } }
    ] } : {}),
    ...(filters.action ? { action: filters.action.slice(0, 80) } : {}),
    ...(filters.entity ? { entityType: filters.entity.slice(0, 80) } : {}),
    ...(filters.actor ? { actorUserId: filters.actor.slice(0, 40) } : {}),
    ...(fromDate || toDate ? { createdAt: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } } : {})
  };
  const [logs, count, { actors, actions, entityTypes }] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 25,
      skip: (page - 1) * 25,
      select: {
        id: true,
        actorUserId: true,
        action: true,
        entityType: true,
        entityId: true,
        beforeData: true,
        afterData: true,
        metadata: true,
        ipAddress: true,
        requestId: true,
        createdAt: true,
        actor: { select: { name: true } }
      }
    }),
    prisma.auditLog.count({ where }),
    getAuditFilterOptions()
  ]);
  const pageCount = Math.max(1, Math.ceil(count / 25));
  const pageHref = (target: number) => {
    const next = new URLSearchParams(Object.entries(filters).filter(([key, value]) => key !== "page" && typeof value === "string" && value) as [string, string][]);
    next.set("page", String(target));
    return `?${next.toString()}`;
  };
  const timestamp = (date: Date) => new Intl.DateTimeFormat(isArabic ? market.arabicLocale : market.englishLocale, {
    timeZone: market.timeZone, dateStyle: "medium", timeStyle: "short"
  }).format(date);

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-xs font-medium text-brand-700">{isArabic ? "الإدارة" : "Administration"}</p>
        <div className="flex items-center gap-3">
          <BrandSectionBadge section="audit" />
          <h1 className="text-2xl font-bold text-slate-900">{isArabic ? "سجل المراجعة" : "Audit trail"}</h1>
        </div>
        <p className="mt-1.5 text-sm text-slate-500">{isArabic ? "تاريخ غير قابل للتعديل للعمليات المنفذة على المنصة" : "An append-only history of actions performed in the platform"}</p>
      </div>

      <Form action={`/${locale}/audit`} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-panel sm:grid-cols-2 xl:grid-cols-6">
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 xl:col-span-2">
          <Search size={16} className="text-slate-400" aria-hidden="true" />
          <input name="q" defaultValue={filters.q} maxLength={100} placeholder={isArabic ? "بحث في العمليات والسجلات" : "Search actions and records"} className="h-10 w-full bg-transparent text-sm outline-none" />
        </label>
        <select name="actor" defaultValue={filters.actor ?? ""} aria-label={isArabic ? "المستخدم" : "User"} className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600">
          <option value="">{isArabic ? "كل المستخدمين" : "All users"}</option>
          {actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.name}</option>)}
        </select>
        <select name="action" defaultValue={filters.action ?? ""} aria-label={isArabic ? "العملية" : "Action"} className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600">
          <option value="">{isArabic ? "كل العمليات" : "All actions"}</option>
          {actions.map((action) => <option key={action} value={action}>{action}</option>)}
        </select>
        <select name="entity" defaultValue={filters.entity ?? ""} aria-label={isArabic ? "نوع السجل" : "Entity"} className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600">
          <option value="">{isArabic ? "كل السجلات" : "All entities"}</option>
          {entityTypes.map((entityType) => <option key={entityType} value={entityType}>{entityType}</option>)}
        </select>
        <div className="flex gap-2 sm:col-span-2 xl:col-span-3">
          <label className="flex-1"><span className="sr-only">{isArabic ? "من تاريخ" : "From date"}</span><input type="date" name="from" defaultValue={filters.from} className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-600" /></label>
          <label className="flex-1"><span className="sr-only">{isArabic ? "إلى تاريخ" : "To date"}</span><input type="date" name="to" defaultValue={filters.to} className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-600" /></label>
        </div>
        <button className="h-11 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 sm:col-span-2 xl:col-span-3">{isArabic ? "تطبيق الفلاتر" : "Apply filters"}</button>
      </Form>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-panel">
        <div className="border-b border-slate-100 px-5 py-4 text-xs text-slate-500">{count} {isArabic ? "سجل" : "events"}</div>
        <div className="divide-y divide-slate-100">
          {logs.map((log) => (
            <details key={log.id} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-xs font-bold text-brand-700">{log.entityType.slice(0, 1)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-800">{log.action} <span className="font-normal text-slate-400">· {log.entityType} #{log.entityId.slice(0, 12)}</span></span>
                  <span className="mt-1 block text-[11px] text-slate-400">{log.actor?.name ?? (isArabic ? "النظام" : "System")} · {timestamp(log.createdAt)}</span>
                </span>
                <span className="text-xs text-slate-400">{log.ipAddress ?? "—"}</span>
                <span className="rounded-md px-2 py-1 text-xs text-brand-700 group-open:bg-brand-50">{isArabic ? "التفاصيل" : "Details"}</span>
              </summary>
              <div className="mt-4 grid gap-3 ps-12 lg:grid-cols-2">
                <div className="rounded-lg bg-slate-50 p-3">
                  <h3 className="mb-2 text-xs font-semibold text-slate-600">{isArabic ? "قبل" : "Before"}</h3>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-5 text-slate-600" dir="ltr">{JSON.stringify(log.beforeData, null, 2) ?? "—"}</pre>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <h3 className="mb-2 text-xs font-semibold text-slate-600">{isArabic ? "بعد" : "After"}</h3>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-5 text-slate-600" dir="ltr">{JSON.stringify(log.afterData ?? log.metadata, null, 2)}</pre>
                  {log.requestId && <p className="mt-2 border-t border-slate-200 pt-2 text-[10px] text-slate-400" dir="ltr">Request ID: {log.requestId}</p>}
                </div>
              </div>
            </details>
          ))}
          {!logs.length && <p className="px-5 py-12 text-center text-sm text-slate-400">{isArabic ? "لا توجد سجلات مطابقة" : "No matching events"}</p>}
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          <span>{isArabic ? `صفحة ${page} من ${pageCount}` : `Page ${page} of ${pageCount}`}</span>
          <div className="flex gap-2">
            {page > 1 && <Link href={pageHref(page - 1)} className="rounded-md border border-slate-200 px-3 py-1.5 hover:bg-sand">{isArabic ? "السابق" : "Previous"}</Link>}
            {page < pageCount && <Link href={pageHref(page + 1)} className="rounded-md border border-slate-200 px-3 py-1.5 hover:bg-sand">{isArabic ? "التالي" : "Next"}</Link>}
          </div>
        </div>
      </section>
    </div>
  );
}
