import { createHmac, randomUUID } from "node:crypto";
import { compare } from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128)
});

function privateIdentifier(value: string) {
  return createHmac("sha256", process.env.AUTH_SECRET ?? "").update(value).digest("hex");
}

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: { signIn: "/ar/login" },
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(rawCredentials, request) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase();
        const emailHash = privateIdentifier(email);
        const rawIp = request.headers?.["x-real-ip"];
        const ipHash = typeof rawIp === "string" ? privateIdentifier(rawIp.slice(0, 64)) : null;
        const cutoff = new Date(Date.now() - 15 * 60 * 1000);
        const rateLimitMatches = [
          { emailHash, createdAt: { gte: cutoff } },
          ...(ipHash ? [{ ipHash, createdAt: { gte: cutoff } }] : [])
        ];
        const attempts = await prisma.loginAttempt.count({ where: { OR: rateLimitMatches } });
        if (attempts >= 10) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, email: true, name: true, passwordHash: true, status: true }
        });
        if (!user || user.status !== "ACTIVE" || !(await compare(parsed.data.password, user.passwordHash))) {
          await prisma.$transaction([
            prisma.loginAttempt.create({ data: { emailHash, ipHash } }),
            prisma.auditLog.create({
              data: {
                action: "auth.login.failed",
                entityType: "AuthenticationAttempt",
                entityId: emailHash,
                metadata: { emailHash, ipHash, userAgent: request.headers?.["user-agent"] ?? null }
              }
            })
          ]);
          return null;
        }

        await prisma.$transaction([
          prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
          prisma.loginAttempt.deleteMany({ where: { emailHash } }),
          prisma.auditLog.create({
            data: {
              actorUserId: user.id,
              action: "auth.login",
              entityType: "User",
              entityId: user.id,
              metadata: { ipHash, userAgent: request.headers?.["user-agent"] ?? null, requestId: randomUUID() }
            }
          })
        ]);
        return { id: user.id, email: user.email, name: user.name };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.userId = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.userId === "string") {
        session.user.id = token.userId;
      }
      return session;
    }
  },
  events: {
    async signOut({ token }) {
      if (typeof token?.userId !== "string") return;
      await prisma.auditLog.create({
        data: {
          actorUserId: token.userId,
          action: "auth.logout",
          entityType: "User",
          entityId: token.userId
        }
      });
    }
  }
};
