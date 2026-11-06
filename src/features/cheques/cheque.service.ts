import type { ChequeStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const chequeStatuses = ["PENDING", "CLEARED", "BOUNCED"] as const;

export async function getChequeRegister(search: string, status: ChequeStatus | undefined, page: number, pageSize: number) {
  const query = search.trim();
  const where: Prisma.ChequeWhereInput = {
    ...(status ? { status } : {}),
    ...(query ? {
      OR: [
        { companyName: { contains: query, mode: "insensitive" } },
        { chequeNumber: { contains: query, mode: "insensitive" } },
        { bankName: { contains: query, mode: "insensitive" } }
      ]
    } : {})
  };
  const [rows, count, summary] = await Promise.all([
    prisma.cheque.findMany({
      where,
      orderBy: [{ chequeDate: "desc" }, { createdAt: "desc" }],
      take: pageSize,
      skip: (page - 1) * pageSize,
      select: { id: true, companyName: true, amount: true, chequeDate: true, chequeNumber: true, bankName: true, status: true, notes: true }
    }),
    prisma.cheque.count({ where }),
    prisma.cheque.groupBy({ by: ["status"], _sum: { amount: true }, _count: { _all: true } })
  ]);
  const totals = Object.fromEntries(chequeStatuses.map((key) => {
    const group = summary.find((item) => item.status === key);
    return [key, { count: group?._count._all ?? 0, amount: group?._sum.amount?.toString() ?? "0" }];
  })) as Record<ChequeStatus, { count: number; amount: string }>;
  return { rows, count, totals, pageCount: Math.max(1, Math.ceil(count / pageSize)) };
}
