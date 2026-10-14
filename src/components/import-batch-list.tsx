import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import { formatDate } from "@/lib/format";

type Batch = {
  id: string;
  fileName: string;
  totalRows: number;
  successfulRows: number;
  failedRows: number;
  status: string;
  createdAt: Date;
  importedBy: { name: string };
};

export function ImportBatchList({ locale, batches }: { locale: "ar" | "en"; batches: Batch[] }) {
  const isArabic = locale === "ar";
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-panel">
      <div className="border-b border-slate-100 px-5 py-4 text-xs text-slate-500">{isArabic ? "آخر 30 عملية استيراد" : "Latest 30 import batches"}</div>
      {batches.length ? <div className="divide-y divide-slate-100">
        {batches.map((batch) => (
          <Link key={batch.id} href={`/${locale}/imports/${batch.id}`} className="flex flex-wrap items-center gap-3 px-5 py-4 hover:bg-sand/70">
            <FileSpreadsheet size={18} className="text-brand-700" aria-hidden="true" />
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{batch.fileName}</span><span className="mt-1 block text-xs text-slate-400">{batch.importedBy.name} · {formatDate(batch.createdAt, locale)}</span></span>
            <span className="text-xs text-slate-500">{batch.successfulRows}/{batch.totalRows} {isArabic ? "صف صالح" : "valid rows"}</span>
            <span className={`rounded-full px-2.5 py-1 text-[11px] ${batch.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700" : batch.status === "FAILED" || batch.status === "COMPLETED_WITH_ERRORS" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{batch.status === "VALIDATING" ? (isArabic ? "بانتظار المراجعة" : "Review required") : batch.status === "COMPLETED" ? (isArabic ? "مكتملة" : "Completed") : batch.status === "COMPLETED_WITH_ERRORS" ? (isArabic ? "مكتملة مع أخطاء" : "Completed with errors") : (isArabic ? "فشلت" : "Failed")}</span>
            {batch.failedRows > 0 && <span className="text-xs text-rose-600">{batch.failedRows} {isArabic ? "خطأ" : "errors"}</span>}
          </Link>
        ))}
      </div> : <p className="px-5 py-12 text-center text-sm text-slate-400">{isArabic ? "لا توجد عمليات استيراد حتى الآن" : "No import batches yet"}</p>}
    </section>
  );
}
