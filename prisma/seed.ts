import { Prisma, PrismaClient } from "@prisma/client";
import type { Invoice, Merchant } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

const permissionDescriptions: Record<string, string> = {
  "dashboard.read": "View the dashboard",
  "merchant.read": "View merchants",
  "merchant.create": "Create merchants",
  "merchant.update": "Update merchants",
  "merchant.archive": "Archive merchants",
  "invoice.read": "View invoices",
  "invoice.create": "Create invoices",
  "invoice.update": "Update draft invoices",
  "invoice.cancel": "Cancel invoices",
  "payment.read": "View payments",
  "payment.create": "Create payments",
  "payment.reverse": "Reverse payments",
  "debt.read": "View outstanding balances",
  "cheque.read": "View cheques",
  "cheque.create": "Record cheques",
  "cheque.update": "Update cheque status",
  "report.read": "View reports",
  "import.execute": "استيراد ملفات Excel",
  "export.execute": "تصدير البيانات",
  "user.manage": "Manage users",
  "role.manage": "Manage roles and permissions",
  "audit.read": "View audit logs",
  "settings.manage": "Manage system settings",
  "roadmap.read": "عرض خارطة تنفيذ المنصة"
};

const roleDefinitions: Record<string, { name: string; description: string; permissions: string[] }> = {
  OWNER: { name: "المالك", description: "صلاحيات كاملة لإدارة المنصة", permissions: Object.keys(permissionDescriptions) },
  ADMIN: {
    name: "مدير النظام",
    description: "إدارة العمليات اليومية والمستخدمين",
    permissions: Object.keys(permissionDescriptions).filter((key) => !["role.manage", "settings.manage"].includes(key))
  },
  COLLECTOR: {
    name: "محصل",
    description: "الاطلاع على التجار والديون وتسجيل التحصيلات",
    permissions: ["dashboard.read", "merchant.read", "invoice.read", "payment.read", "payment.create", "debt.read", "cheque.read", "cheque.create", "roadmap.read"]
  },
  VIEWER: {
    name: "مشاهد",
    description: "اطلاع للقراءة فقط",
    permissions: ["dashboard.read", "merchant.read", "invoice.read", "payment.read", "debt.read", "cheque.read", "report.read", "roadmap.read"]
  }
};

async function main() {
  for (const [key, description] of Object.entries(permissionDescriptions)) {
    await prisma.permission.upsert({
      where: { key },
      update: { description },
      create: { key, description }
    });
  }

  for (const [key, definition] of Object.entries(roleDefinitions)) {
    const role = await prisma.role.upsert({
      where: { key },
      update: { name: definition.name, description: definition.description },
      create: { key, name: definition.name, description: definition.description }
    });
    for (const permissionKey of definition.permissions) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { key: permissionKey } });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id }
      });
    }
  }

  const email = (process.env.SEED_ADMIN_EMAIL ?? "owner@makkah.eg").toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (process.env.NODE_ENV === "production" && !adminPassword) {
    throw new Error("SEED_ADMIN_PASSWORD must be set before seeding a production database.");
  }
  const passwordHash = await hash(adminPassword ?? "Makkah-Local-2026!", 12);
  const legacyOwner = await prisma.user.findUnique({ where: { email: "owner@makkah.local" } });
  const owner = legacyOwner && legacyOwner.email !== email
    ? await prisma.user.update({
        where: { id: legacyOwner.id },
        data: { name: "أحمد محمد", email, passwordHash, status: "ACTIVE" }
      })
    : await prisma.user.upsert({
        where: { email },
        update: { name: "أحمد محمد", passwordHash, status: "ACTIVE" },
        create: { name: "أحمد محمد", email, passwordHash }
      });
  const ownerRole = await prisma.role.findUniqueOrThrow({ where: { key: "OWNER" } });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: owner.id, roleId: ownerRole.id } },
    update: {},
    create: { userId: owner.id, roleId: ownerRole.id }
  });

  if (process.env.NODE_ENV === "production") return;

  const merchantFixtures = [
    { merchantCode: "MK-001", name: "مؤسسة النيل للتوريدات", phone: "01012345678", city: "القاهرة", region: "مدينة نصر" },
    { merchantCode: "MK-002", name: "أسواق الإسكندرية", phone: "01123456789", city: "الإسكندرية", region: "سموحة" },
    { merchantCode: "MK-003", name: "شركة الجيزة للتجارة", phone: "01234567890", city: "الجيزة", region: "الدقي" },
    { merchantCode: "MK-004", name: "مؤسسة الدلتا التجارية", phone: "01545678901", city: "المنصورة", region: "وسط البلد" },
    { merchantCode: "MK-005", name: "متاجر المحروسة", phone: "01056789012", city: "طنطا", region: "شارع البحر" }
  ];
  const merchants: Merchant[] = [];
  for (const fixture of merchantFixtures) {
    const legacy = await prisma.merchant.findUnique({ where: { merchantCode: fixture.merchantCode } });
    const merchant = legacy && legacy.phone.startsWith("05")
      ? await prisma.merchant.update({
          where: { id: legacy.id },
          data: { ...fixture, updatedById: owner.id, status: "ACTIVE" }
        })
      : await prisma.merchant.upsert({
          where: { merchantCode: fixture.merchantCode },
          update: { ...fixture, status: "ACTIVE" },
          create: { ...fixture, createdById: owner.id }
        });
    merchants.push(merchant);
  }

  const invoiceFixtures = [
    { invoiceNumber: "INV-2026-001", merchantIndex: 0, amount: "18500.00", daysAgo: 42, status: "CONFIRMED" as const },
    { invoiceNumber: "INV-2026-002", merchantIndex: 0, amount: "12500.00", daysAgo: 19, status: "CONFIRMED" as const },
    { invoiceNumber: "INV-2026-003", merchantIndex: 1, amount: "27200.00", daysAgo: 36, status: "CONFIRMED" as const },
    { invoiceNumber: "INV-2026-004", merchantIndex: 2, amount: "9400.00", daysAgo: 12, status: "CONFIRMED" as const },
    { invoiceNumber: "INV-2026-005", merchantIndex: 3, amount: "16800.00", daysAgo: 67, status: "CONFIRMED" as const },
    { invoiceNumber: "INV-2026-006", merchantIndex: 4, amount: "22100.00", daysAgo: 6, status: "CONFIRMED" as const }
  ];
  const invoices: Invoice[] = [];
  for (const fixture of invoiceFixtures) {
    const transactionDate = new Date(Date.now() - fixture.daysAgo * 86_400_000);
    const dueDate = new Date(transactionDate.getTime() + 30 * 86_400_000);
    const invoiceAmount = new Prisma.Decimal(fixture.amount).mul(10);
    invoices.push(await prisma.invoice.upsert({
      where: { invoiceNumber: fixture.invoiceNumber },
      update: {
        merchantId: merchants[fixture.merchantIndex].id,
        transactionDate,
        dueDate,
        status: fixture.status,
        subtotal: invoiceAmount,
        totalAmount: invoiceAmount
      },
      create: {
        invoiceNumber: fixture.invoiceNumber,
        merchantId: merchants[fixture.merchantIndex].id,
        transactionDate,
        dueDate,
        status: fixture.status,
        subtotal: invoiceAmount,
        totalAmount: invoiceAmount,
        createdById: owner.id
      }
    }));
  }

  const paymentFixtures = [
    { reference: "RCPT-2026-001", merchantIndex: 0, amount: "7000.00", invoiceIndexes: [0] },
    { reference: "RCPT-2026-002", merchantIndex: 1, amount: "10000.00", invoiceIndexes: [2] },
    { reference: "RCPT-2026-003", merchantIndex: 2, amount: "3000.00", invoiceIndexes: [3] }
  ];
  for (const fixture of paymentFixtures) {
    const existing = await prisma.payment.findFirst({ where: { reference: fixture.reference } });
    const invoiceIndex = fixture.invoiceIndexes[0];
    const paymentAmount = new Prisma.Decimal(fixture.amount).mul(10);
    const created = existing
      ? await prisma.payment.update({
          where: { id: existing.id },
          data: {
            merchantId: merchants[fixture.merchantIndex].id,
            amount: paymentAmount,
            status: "COMPLETED",
            reversedAt: null,
            reversedById: null,
            reversalReason: null
          }
        })
      : await prisma.payment.create({
      data: {
        merchantId: merchants[fixture.merchantIndex].id,
        amount: paymentAmount,
        paymentMethod: "BANK_TRANSFER",
        paymentDate: new Date(Date.now() - (fixture.invoiceIndexes[0] + 1) * 86_400_000),
        reference: fixture.reference,
        createdById: owner.id,
        allocations: {
          create: fixture.invoiceIndexes.map((invoiceIndex) => ({
            invoiceId: invoices[invoiceIndex].id,
            amount: paymentAmount,
            createdById: owner.id
          }))
        }
      }
    });
    for (const index of fixture.invoiceIndexes) {
      await prisma.paymentAllocation.upsert({
        where: { paymentId_invoiceId: { paymentId: created.id, invoiceId: invoices[index].id } },
        update: { amount: paymentAmount },
        create: {
          paymentId: created.id,
          invoiceId: invoices[index].id,
          amount: paymentAmount,
          createdById: owner.id
        }
      });
    }
    if (!(await prisma.auditLog.findFirst({ where: { entityType: "Payment", entityId: created.id } }))) {
      await prisma.auditLog.create({
        data: {
          actorUserId: owner.id,
          action: "payment.created",
          entityType: "Payment",
          entityId: created.id,
          afterData: { amount: paymentAmount, reference: fixture.reference }
        }
      });
    }
  }

  const chequeFixtures = [
    { chequeNumber: "10023451", companyName: "مؤسسة النيل للتوريدات", bankName: "البنك الأهلي المصري", amount: "45000.00", daysAhead: 10, status: "PENDING" as const },
    { chequeNumber: "55820017", companyName: "أسواق الإسكندرية", bankName: "بنك مصر", amount: "28750.00", daysAhead: -5, status: "CLEARED" as const },
    { chequeNumber: "30091882", companyName: "شركة الجيزة للتجارة", bankName: "البنك التجاري الدولي (CIB)", amount: "12400.00", daysAhead: 25, status: "PENDING" as const }
  ];
  for (const fixture of chequeFixtures) {
    if (await prisma.cheque.findFirst({ where: { chequeNumber: fixture.chequeNumber, bankName: fixture.bankName } })) continue;
    await prisma.cheque.create({
      data: {
        chequeNumber: fixture.chequeNumber,
        companyName: fixture.companyName,
        bankName: fixture.bankName,
        amount: new Prisma.Decimal(fixture.amount),
        chequeDate: new Date(Date.now() + fixture.daysAhead * 86_400_000),
        status: fixture.status,
        createdById: owner.id
      }
    });
  }

  if ((await prisma.auditLog.count()) === 0) {
    await prisma.auditLog.create({
      data: {
        actorUserId: owner.id,
        action: "merchant.created",
        entityType: "Merchant",
        entityId: merchants[0].id,
        afterData: { merchantCode: merchants[0].merchantCode, name: merchants[0].name },
        metadata: { source: "seed" }
      }
    });
  }
}

main()
  .catch((error: unknown) => {
    console.error("Database seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
