"use client";

import { useActionState } from "react";
import { LoaderCircle, Plus, Save, UserRoundPlus } from "lucide-react";
import { createUserAction, toggleUserStatusAction, updateUserRoleAction, type UserActionState } from "@/features/admin/user.actions";

type RoleOption = { id: string; key: string; name: string };

export function CreateUserForm({ locale, roles }: { locale: "ar" | "en"; roles: RoleOption[] }) {
  const [state, action, pending] = useActionState(createUserAction, {} as UserActionState);
  const isArabic = locale === "ar";
  return (
    <form action={action} aria-busy={pending} className="rounded-xl border border-slate-200 bg-white p-5 shadow-panel">
      <input type="hidden" name="locale" value={locale} />
      <div className="mb-4 flex items-center gap-2"><UserRoundPlus size={18} className="text-brand-700" aria-hidden="true" /><h2 className="text-sm font-bold text-slate-800">{isArabic ? "إضافة مستخدم" : "Add user"}</h2></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1.5 text-xs font-medium text-slate-600"><span>{isArabic ? "الاسم" : "Name"}</span><input name="name" minLength={2} maxLength={150} required className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" /></label>
        <label className="space-y-1.5 text-xs font-medium text-slate-600"><span>{isArabic ? "البريد الإلكتروني" : "Email"}</span><input name="email" type="email" maxLength={254} required dir="ltr" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" /></label>
        <label className="space-y-1.5 text-xs font-medium text-slate-600"><span>{isArabic ? "كلمة مرور مؤقتة (12 حرفًا على الأقل)" : "Temporary password (12+ characters)"}</span><input name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" /></label>
        <label className="space-y-1.5 text-xs font-medium text-slate-600"><span>{isArabic ? "الدور" : "Role"}</span><select name="roleId" required defaultValue="" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="" disabled>{isArabic ? "اختر دورًا" : "Select a role"}</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
      </div>
      {state.error && <p role="alert" className="mt-3 text-sm text-rose-700">{state.error}</p>}
      {state.success && <p role="status" className="mt-3 text-sm text-emerald-700">{state.success}</p>}
      <div className="mt-4 flex justify-end">      <button disabled={pending || !roles.length} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60">{pending ? <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}{pending ? (isArabic ? "جارٍ إنشاء الحساب..." : "Creating account...") : (isArabic ? "إنشاء الحساب" : "Create account")}</button></div>
    </form>
  );
}

export function UserRowActions({
  locale,
  userId,
  currentRoleId,
  currentStatus,
  roles,
  disabled
}: {
  locale: "ar" | "en";
  userId: string;
  currentRoleId: string;
  currentStatus: "ACTIVE" | "SUSPENDED";
  roles: RoleOption[];
  disabled: boolean;
}) {
  const [roleState, roleAction, rolePending] = useActionState(updateUserRoleAction, {} as UserActionState);
  const [statusState, statusAction, statusPending] = useActionState(toggleUserStatusAction, {} as UserActionState);
  const isArabic = locale === "ar";
  const nextStatus = currentStatus === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={roleAction} aria-busy={rolePending} className="flex items-center gap-1">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="userId" value={userId} />
        <select name="roleId" defaultValue={currentRoleId} disabled={disabled || rolePending} aria-label={isArabic ? "الدور" : "Role"} className="h-9 max-w-36 rounded-md border border-slate-200 bg-white px-2 text-xs">
          {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
        </select>
        <button disabled={disabled || rolePending} aria-label={isArabic ? (rolePending ? "جارٍ حفظ الدور" : "حفظ الدور") : (rolePending ? "Saving role" : "Save role")} className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs text-brand-700 disabled:opacity-40">{rolePending ? <LoaderCircle size={13} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Save size={13} aria-hidden="true" />}{rolePending ? (isArabic ? "جارٍ..." : "Saving...") : (isArabic ? "تعيين" : "Set")}</button>
      </form>
      <form action={statusAction} aria-busy={statusPending}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="status" value={nextStatus} />
        <button disabled={disabled || statusPending} className={`h-9 rounded-md border px-2 text-xs font-medium disabled:opacity-40 ${nextStatus === "SUSPENDED" ? "border-rose-200 text-rose-700 hover:bg-rose-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}>
          {statusPending ? (isArabic ? "جارٍ التحديث..." : "Updating...") : nextStatus === "SUSPENDED" ? (isArabic ? "إيقاف" : "Suspend") : (isArabic ? "تفعيل" : "Activate")}
        </button>
      </form>
      {(roleState.error || statusState.error) && <span role="alert" className="basis-full text-xs text-rose-700">{roleState.error ?? statusState.error}</span>}
      {(roleState.success || statusState.success) && <span role="status" className="basis-full text-xs text-emerald-700">{roleState.success ?? statusState.success}</span>}
    </div>
  );
}
