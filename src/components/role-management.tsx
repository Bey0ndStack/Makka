"use client";

import { useActionState } from "react";
import { LoaderCircle, Plus, Save } from "lucide-react";
import { createRoleAction, updateRolePermissionsAction, type RoleActionState } from "@/features/admin/role.actions";

type PermissionOption = { id: string; key: string; description: string };
type RoleData = { id: string; key: string; name: string; description: string; permissionIds: string[] };

export function RoleManagement({ locale, roles, permissions }: { locale: "ar" | "en"; roles: RoleData[]; permissions: PermissionOption[] }) {
  const isArabic = locale === "ar";
  return (
    <section className="space-y-4">
      <CreateRoleForm locale={locale} permissions={permissions} />
      {roles.filter((role) => role.key.startsWith("CUSTOM_")).map((role) => <EditRoleForm key={role.id} locale={locale} role={role} permissions={permissions} />)}
      {!roles.some((role) => role.key.startsWith("CUSTOM_")) && <p className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">{isArabic ? "لا توجد أدوار مخصصة بعد." : "No custom roles yet."}</p>}
      <p className="text-xs leading-5 text-slate-500">{isArabic ? "الأدوار الأساسية محمية. لا يتم حذف الأدوار المخصصة عند تعديلها حتى لا يتأثر المستخدمون المسندون إليها." : "Built-in roles are protected. Custom roles are not deleted when edited, preserving existing user assignments."}</p>
    </section>
  );
}

function CreateRoleForm({ locale, permissions }: { locale: "ar" | "en"; permissions: PermissionOption[] }) {
  const [state, action, pending] = useActionState(createRoleAction, {} as RoleActionState);
  const isArabic = locale === "ar";
  return (
    <form action={action} aria-busy={pending} className="rounded-xl border border-slate-200 bg-white p-5 shadow-panel">
      <input type="hidden" name="locale" value={locale} />
      <div className="mb-4 flex items-center gap-2"><Plus size={17} className="text-brand-700" aria-hidden="true" /><h3 className="text-sm font-bold text-slate-800">{isArabic ? "إنشاء دور مخصص" : "Create a custom role"}</h3></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-xs text-slate-600"><span>{isArabic ? "اسم الدور" : "Role name"}</span><input name="name" required minLength={2} maxLength={80} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" /></label>
        <label className="space-y-1.5 text-xs text-slate-600"><span>{isArabic ? "الوصف" : "Description"}</span><input name="description" required minLength={3} maxLength={240} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" /></label>
      </div>
      <PermissionChecklist locale={locale} permissions={permissions} />
      {state.error && <p role="alert" className="mt-3 text-sm text-rose-700">{state.error}</p>}
      {state.success && <p role="status" className="mt-3 text-sm text-emerald-700">{state.success}</p>}
      <div className="mt-4 flex justify-end"><button disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60">{pending ? <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}{pending ? (isArabic ? "جارٍ إنشاء الدور..." : "Creating role...") : (isArabic ? "إنشاء الدور" : "Create role")}</button></div>
    </form>
  );
}

function EditRoleForm({ locale, role, permissions }: { locale: "ar" | "en"; role: RoleData; permissions: PermissionOption[] }) {
  const [state, action, pending] = useActionState(updateRolePermissionsAction, {} as RoleActionState);
  const isArabic = locale === "ar";
  return (
    <form action={action} aria-busy={pending} className="rounded-xl border border-slate-200 bg-white p-5 shadow-panel">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="roleId" value={role.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-xs text-slate-600"><span>{isArabic ? "اسم الدور" : "Role name"}</span><input name="name" required minLength={2} maxLength={80} defaultValue={role.name} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" /></label>
        <label className="space-y-1.5 text-xs text-slate-600"><span>{isArabic ? "الوصف" : "Description"}</span><input name="description" required minLength={3} maxLength={240} defaultValue={role.description} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" /></label>
      </div>
      <PermissionChecklist locale={locale} permissions={permissions} selectedIds={role.permissionIds} />
      {state.error && <p role="alert" className="mt-3 text-sm text-rose-700">{state.error}</p>}
      {state.success && <p role="status" className="mt-3 text-sm text-emerald-700">{state.success}</p>}
      <div className="mt-4 flex justify-end"><button disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-brand-700 disabled:cursor-wait disabled:opacity-60">{pending ? <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Save size={15} aria-hidden="true" />}{pending ? (isArabic ? "جارٍ الحفظ..." : "Saving...") : (isArabic ? "حفظ صلاحيات الدور" : "Save role permissions")}</button></div>
    </form>
  );
}

function PermissionChecklist({ locale, permissions, selectedIds = [] }: { locale: "ar" | "en"; permissions: PermissionOption[]; selectedIds?: string[] }) {
  const isArabic = locale === "ar";
  return (
    <fieldset className="mt-5">
      <legend className="mb-2 text-xs font-semibold text-slate-700">{isArabic ? "الصلاحيات" : "Permissions"}</legend>
      <div className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50/60 p-3 sm:grid-cols-2 lg:grid-cols-3">
        {permissions.map((permission) => (
          <label key={permission.id} className="flex min-w-0 items-start gap-2 rounded-md bg-white px-2.5 py-2 text-xs">
            <input type="checkbox" name="permissionIds" value={permission.id} defaultChecked={selectedIds.includes(permission.id)} className="mt-0.5 accent-brand-700" />
            <span className="min-w-0"><span className="block font-medium text-slate-700">{permission.description}</span><span className="mt-0.5 block truncate font-mono text-[10px] text-slate-400" dir="ltr">{permission.key}</span></span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
