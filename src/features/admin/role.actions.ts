"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isLocale } from "@/lib/i18n";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export type RoleActionState = { error?: string; success?: string };
const permissionKeys = [
  "dashboard.read", "merchant.read", "merchant.create", "merchant.update", "merchant.archive",
  "invoice.read", "invoice.create", "invoice.update", "invoice.cancel",
  "payment.read", "payment.create", "payment.reverse", "debt.read", "report.read",
  "import.execute", "export.execute", "user.manage", "audit.read"
] as const;
const roleSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().min(3).max(240),
  permissionIds: z.array(z.string().min(1)).max(50)
});

function localeFrom(data: FormData) {
  const value = data.get("locale");
  return typeof value === "string" && isLocale(value) ? value : "ar";
}

function parseRole(data: FormData) {
  return roleSchema.safeParse({
    name: data.get("name"),
    description: data.get("description"),
    permissionIds: data.getAll("permissionIds")
  });
}

async function validatePermissionIds(ids: string[]) {
  const permissions = await prisma.permission.findMany({
    where: { id: { in: ids } },
    select: { id: true, key: true }
  });
  return permissions.length === new Set(ids).size && permissions.every((permission) => permissionKeys.includes(permission.key as (typeof permissionKeys)[number]));
}

export async function createRoleAction(_previous: RoleActionState, data: FormData): Promise<RoleActionState> {
  const locale = localeFrom(data);
  const actor = await requirePermission("role.manage", locale);
  const parsed = parseRole(data);
  if (!parsed.success) return { error: locale === "ar" ? "راجع اسم الدور ووصفه وصلاحياته." : "Check the role name, description, and permissions." };
  if (!(await validatePermissionIds(parsed.data.permissionIds))) return { error: locale === "ar" ? "بعض الصلاحيات المختارة غير صالحة." : "Some selected permissions are invalid." };
  const key = `CUSTOM_${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
  const requestHeaders = await headers();
  await prisma.$transaction(async (tx) => {
    const role = await tx.role.create({
      data: {
        key, name: parsed.data.name, description: parsed.data.description,
        permissions: { create: parsed.data.permissionIds.map((permissionId) => ({ permissionId })) }
      }
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id, action: "role.created", entityType: "Role", entityId: role.id,
        afterData: { key, name: role.name, permissionIds: parsed.data.permissionIds },
        ipAddress: requestHeaders.get("x-real-ip"), userAgent: requestHeaders.get("user-agent"),
        requestId: requestHeaders.get("x-request-id") ?? randomUUID()
      }
    });
  });
  revalidatePath(`/${locale}/settings`);
  revalidatePath(`/${locale}/users`);
  return { success: locale === "ar" ? "تم إنشاء الدور المخصص." : "Custom role created." };
}

export async function updateRolePermissionsAction(_previous: RoleActionState, data: FormData): Promise<RoleActionState> {
  const locale = localeFrom(data);
  const actor = await requirePermission("role.manage", locale);
  const parsed = parseRole(data);
  const roleId = data.get("roleId");
  if (!parsed.success || typeof roleId !== "string" || !roleId) return { error: locale === "ar" ? "راجع بيانات الدور." : "Check the role details." };
  if (!(await validatePermissionIds(parsed.data.permissionIds))) return { error: locale === "ar" ? "بعض الصلاحيات المختارة غير صالحة." : "Some selected permissions are invalid." };
  const requestHeaders = await headers();
  const result = await prisma.$transaction(async (tx) => {
    const role = await tx.role.findUnique({ where: { id: roleId }, select: { id: true, key: true, name: true, description: true, permissions: { select: { permission: { select: { id: true, key: true } } } } } });
    if (!role) return "missing" as const;
    if (!role.key.startsWith("CUSTOM_")) return "protected" as const;
    await tx.role.update({ where: { id: role.id }, data: { name: parsed.data.name, description: parsed.data.description } });
    await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (parsed.data.permissionIds.length) {
      await tx.rolePermission.createMany({ data: parsed.data.permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })) });
    }
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id, action: "role.permissions.updated", entityType: "Role", entityId: role.id,
        beforeData: { name: role.name, permissionKeys: role.permissions.map((item) => item.permission.key) },
        afterData: { name: parsed.data.name, permissionIds: parsed.data.permissionIds },
        ipAddress: requestHeaders.get("x-real-ip"), userAgent: requestHeaders.get("user-agent"),
        requestId: requestHeaders.get("x-request-id") ?? randomUUID()
      }
    });
    return "updated" as const;
  });
  if (result !== "updated") return { error: result === "missing" ? (locale === "ar" ? "الدور غير موجود." : "Role not found.") : (locale === "ar" ? "الأدوار الأساسية محمية ولا يمكن تعديلها هنا." : "Built-in roles cannot be changed here.") };
  revalidatePath(`/${locale}/settings`);
  revalidatePath(`/${locale}/users`);
  return { success: locale === "ar" ? "تم تحديث صلاحيات الدور." : "Role permissions updated." };
}
