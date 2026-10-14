"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isLocale } from "@/lib/i18n";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const createMerchantSchema = z.object({
  name: z.string().trim().min(2).max(150),
  phone: z.string().trim().regex(/^\+?[0-9()\s-]{7,20}$/),
  alternatePhone: z.string().trim().max(20).optional(),
  address: z.string().trim().max(240).optional(),
  city: z.string().trim().max(100).optional(),
  region: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(1000).optional()
});

export type MerchantFormState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof z.input<typeof createMerchantSchema>, string[]>>;
};

export async function createMerchantAction(_previousState: MerchantFormState, formData: FormData): Promise<MerchantFormState> {
  const localeValue = formData.get("locale");
  const locale = typeof localeValue === "string" && isLocale(localeValue) ? localeValue : "ar";
  const actor = await requirePermission("merchant.create", locale);
  const parsed = createMerchantSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    alternatePhone: formData.get("alternatePhone") || undefined,
    address: formData.get("address") || undefined,
    city: formData.get("city") || undefined,
    region: formData.get("region") || undefined,
    notes: formData.get("notes") || undefined
  });

  if (!parsed.success) {
    return {
      error: locale === "ar" ? "تحقق من البيانات المدخلة ثم حاول مرة أخرى." : "Check the entered details and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors
    };
  }

  const requestHeaders = await headers();
  const merchantCode = `MK-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
  const details = parsed.data;

  const merchant = await prisma.$transaction(async (tx) => {
    const created = await tx.merchant.create({
      data: {
        merchantCode,
        name: details.name,
        phone: details.phone,
        alternatePhone: details.alternatePhone,
        address: details.address,
        city: details.city,
        region: details.region,
        notes: details.notes,
        createdById: actor.id
      }
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "merchant.created",
        entityType: "Merchant",
        entityId: created.id,
        afterData: {
          merchantCode: created.merchantCode,
          name: created.name,
          phone: created.phone,
          city: created.city
        },
        ipAddress: requestHeaders.get("x-real-ip"),
        userAgent: requestHeaders.get("user-agent"),
        requestId: requestHeaders.get("x-request-id") ?? randomUUID()
      }
    });
    return created;
  });

  revalidatePath("/ar/merchants");
  revalidatePath("/en/merchants");
  redirect(`/${locale}/merchants/${merchant.id}`);
}
