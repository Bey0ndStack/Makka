"use server";

import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isLocale } from "@/lib/i18n";
import { requirePermission, userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export type UserActionState = { error?: string; success?: string };
const createSchema = z.object({
  name: z.string().trim().min(2).max(150),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
  roleId: z.string().min(1)
});

function localeFrom(data: FormData) {
  const locale = data.get("locale");
  return typeof locale === "string" && isLocale(locale) ? locale : "ar";
}

function auditMetadata(value: Headers) {
  return { ipAddress: value.get("x-real-ip"), userAgent: value.get("user-agent"), requestId: value.get("x-request-id") ?? randomUUID() };
}

async function verifyRoleAssignment(actorId: string, roleId: string) {
  const role = await prisma.role.findUnique({ where: { id: roleId }, select: { id: true, key: true } });
  if (!role) return false;
  return role.key !== "OWNER" || userHasPermission(actorId, "role.manage");
}

export async function createUserAction(_previous: UserActionState, data: FormData): Promise<UserActionState> {
  const locale = localeFrom(data);
  const actor = await requirePermission("user.manage", locale);
  const parsed = createSchema.safeParse({
    name: data.get("name"), email: data.get("email"), password: data.get("password"), roleId: data.get("roleId")
  });
  if (!parsed.success) return { error: locale === "ar" ? "راجع الاسم والبريد وكلمة المرور (12 حرفًا على الأقل)." : "Check the name, email, and password (at least 12 characters)." };
  if (!(await verifyRoleAssignment(actor.id, parsed.data.roleId))) return { error: locale === "ar" ? "الدور المختار غير موجود أو لا تملك صلاحية إسناده." : "The selected role is unavailable or you cannot assign it." };
  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() }, select: { id: true } });
  if (existing) return { error: locale === "ar" ? "هذا البريد مستخدم بالفعل." : "This email address is already in use." };

  const passwordHash = await hash(parsed.data.password, 12);
  const requestHeaders = await headers();
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email.toLowerCase(),
        passwordHash,
        roles: { create: { roleId: parsed.data.roleId } }
      },
      select: { id: true, name: true, email: true }
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "user.created",
        entityType: "User",
        entityId: user.id,
        afterData: { name: user.name, email: user.email, roleId: parsed.data.roleId },
        ...auditMetadata(requestHeaders)
      }
    });
  });
  revalidatePath(`/${locale}/users`);
  return { success: locale === "ar" ? "تم إنشاء المستخدم وإسناد الدور." : "User created and role assigned." };
}

export async function updateUserRoleAction(_previous: UserActionState, data: FormData): Promise<UserActionState> {
  const locale = localeFrom(data);
  const actor = await requirePermission("user.manage", locale);
  const parsed = z.object({ userId: z.string().min(1), roleId: z.string().min(1) }).safeParse({
    userId: data.get("userId"), roleId: data.get("roleId")
  });
  if (!parsed.success) return { error: locale === "ar" ? "اختيار المستخدم أو الدور غير صالح." : "The user or role selection is invalid." };
  if (parsed.data.userId === actor.id) return { error: locale === "ar" ? "لا يمكن تغيير دور حسابك من هذه الصفحة." : "You cannot change your own role here." };
  if (!(await verifyRoleAssignment(actor.id, parsed.data.roleId))) return { error: locale === "ar" ? "لا تملك صلاحية إسناد هذا الدور." : "You cannot assign this role." };

  const result = await prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true, status: true, roles: { select: { role: { select: { key: true } } } } } });
    const role = await tx.role.findUnique({ where: { id: parsed.data.roleId }, select: { id: true, key: true } });
    if (!target || !role) return "missing" as const;
    const removingLastOwner = target.status === "ACTIVE" && target.roles.some((item) => item.role.key === "OWNER") && role.key !== "OWNER";
    if (removingLastOwner) {
      const activeOwners = await tx.userRole.count({ where: { role: { key: "OWNER" }, user: { status: "ACTIVE" } } });
      if (activeOwners <= 1) return "last-owner" as const;
    }
    await tx.userRole.deleteMany({ where: { userId: target.id } });
    await tx.userRole.create({ data: { userId: target.id, roleId: role.id } });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id, action: "user.role.updated", entityType: "User", entityId: target.id,
        beforeData: { roleKeys: target.roles.map((item) => item.role.key) },
        afterData: { roleKey: role.key }, ...auditMetadata(await headers())
      }
    });
    return "updated" as const;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (result !== "updated") return { error: result === "last-owner" ? (locale === "ar" ? "لا يمكن إزالة دور آخر مالك نشط." : "The last active owner cannot lose the owner role.") : (locale === "ar" ? "المستخدم أو الدور غير موجود." : "User or role not found.") };
  revalidatePath(`/${locale}/users`);
  return { success: locale === "ar" ? "تم تحديث الدور." : "Role updated." };
}

export async function toggleUserStatusAction(_previous: UserActionState, data: FormData): Promise<UserActionState> {
  const locale = localeFrom(data);
  const actor = await requirePermission("user.manage", locale);
  const parsed = z.object({ userId: z.string().min(1), status: z.enum(["ACTIVE", "SUSPENDED"]) }).safeParse({
    userId: data.get("userId"), status: data.get("status")
  });
  if (!parsed.success) return { error: locale === "ar" ? "بيانات حالة المستخدم غير صالحة." : "The user status is invalid." };
  if (parsed.data.userId === actor.id && parsed.data.status === "SUSPENDED") return { error: locale === "ar" ? "لا يمكن إيقاف حسابك الحالي." : "You cannot suspend your current account." };
  const requestHeaders = await headers();
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true, status: true, roles: { select: { role: { select: { key: true } } } } } });
    if (!user) return "missing" as const;
    if (user.status === parsed.data.status) return "unchanged" as const;
    if (parsed.data.status === "SUSPENDED" && user.roles.some((item) => item.role.key === "OWNER")) {
      const activeOwners = await tx.userRole.count({ where: { role: { key: "OWNER" }, user: { status: "ACTIVE" } } });
      if (activeOwners <= 1) return "last-owner" as const;
    }
    await tx.user.update({ where: { id: user.id }, data: { status: parsed.data.status } });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id, action: "user.status.updated", entityType: "User", entityId: user.id,
        beforeData: { status: user.status }, afterData: { status: parsed.data.status },
        ...auditMetadata(requestHeaders)
      }
    });
    return "updated" as const;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (result !== "updated") return { error: result === "last-owner" ? (locale === "ar" ? "لا يمكن إيقاف آخر مالك نشط." : "The last active owner cannot be suspended.") : result === "missing" ? (locale === "ar" ? "المستخدم غير موجود." : "User not found.") : (locale === "ar" ? "المستخدم بالحالة المطلوبة بالفعل." : "The user already has that status.") };
  revalidatePath(`/${locale}/users`);
  return { success: locale === "ar" ? "تم تحديث حالة المستخدم." : "User status updated." };
}
