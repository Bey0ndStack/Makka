import { NextRequest, NextResponse } from "next/server";
import { getUserPermissionKeys, getWorkspaceSession, getWorkspaceUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (query.length < 2) return NextResponse.json({ results: [] });

  const session = await getWorkspaceSession();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const [user, permissions] = await Promise.all([
    getWorkspaceUser(userId),
    getUserPermissionKeys(userId)
  ]);
  if (!user || user.status !== "ACTIVE") {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const [merchants, invoices, payments] = await Promise.all([
    permissions.has("merchant.read")
      ? prisma.merchant.findMany({
          where: {
            status: { not: "ARCHIVED" },
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { merchantCode: { contains: query, mode: "insensitive" } },
              { phone: { contains: query, mode: "insensitive" } }
            ]
          },
          orderBy: { name: "asc" },
          take: 5,
          select: { id: true, name: true, merchantCode: true, phone: true }
        })
      : [],
    permissions.has("invoice.read")
      ? prisma.invoice.findMany({
          where: {
            OR: [
              { invoiceNumber: { contains: query, mode: "insensitive" } },
              { merchant: { name: { contains: query, mode: "insensitive" } } },
              { merchant: { merchantCode: { contains: query, mode: "insensitive" } } }
            ]
          },
          orderBy: { transactionDate: "desc" },
          take: 5,
          select: { id: true, invoiceNumber: true, status: true, merchant: { select: { name: true } } }
        })
      : [],
    permissions.has("payment.read")
      ? prisma.payment.findMany({
          where: {
            OR: [
              { reference: { contains: query, mode: "insensitive" } },
              { merchant: { name: { contains: query, mode: "insensitive" } } },
              { merchant: { merchantCode: { contains: query, mode: "insensitive" } } }
            ]
          },
          orderBy: { paymentDate: "desc" },
          take: 5,
          select: { id: true, reference: true, merchant: { select: { name: true } } }
        })
      : []
  ]);

  return NextResponse.json({
    results: [
      ...merchants.map((merchant) => ({
        id: `merchant-${merchant.id}`,
        type: "merchant" as const,
        title: merchant.name,
        subtitle: `${merchant.merchantCode} · ${merchant.phone}`,
        href: `/merchants/${merchant.id}`
      })),
      ...invoices.map((invoice) => ({
        id: `invoice-${invoice.id}`,
        type: "invoice" as const,
        title: invoice.invoiceNumber,
        subtitle: invoice.merchant.name,
        href: `/invoices/${invoice.id}`
      })),
      ...payments.map((payment) => ({
        id: `payment-${payment.id}`,
        type: "payment" as const,
        title: payment.reference ?? payment.id.slice(0, 10),
        subtitle: payment.merchant.name,
        href: `/payments?q=${encodeURIComponent(payment.reference ?? payment.id.slice(0, 10))}`
      }))
    ]
  }, {
    headers: { "Cache-Control": "private, no-store" }
  });
}
