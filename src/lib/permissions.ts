import { cache } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const getWorkspaceSession = cache(() => getServerSession(authOptions));

export const getWorkspaceUser = cache((userId: string) => prisma.user.findUnique({
  where: { id: userId },
  select: {
    id: true,
    name: true,
    email: true,
    status: true,
    roles: {
      take: 1,
      select: { role: { select: { name: true } } }
    }
  }
}));

export const getUserPermissionKeys = cache(async (userId: string) => {
  const assignments = await prisma.userRole.findMany({
    where: { userId },
    select: { role: { select: { permissions: { select: { permission: { select: { key: true } } } } } } }
  });
  return new Set(assignments.flatMap((assignment) => assignment.role.permissions.map((item) => item.permission.key)));
});

export async function userHasPermission(userId: string, permission: string) {
  const permissions = await getUserPermissionKeys(userId);
  return permissions.has(permission);
}

export async function requirePermission(permission: string, locale = "ar") {
  const session = await getWorkspaceSession();
  if (!session?.user?.id) redirect(`/${locale}/login`);

  // One round trip instead of two: both lookups are cached per request.
  const [user, permissions] = await Promise.all([
    getWorkspaceUser(session.user.id),
    getUserPermissionKeys(session.user.id)
  ]);
  if (!user || user.status !== "ACTIVE") redirect(`/${locale}/login`);

  if (!permissions.has(permission)) redirect(`/${locale}/forbidden`);
  return session.user;
}
