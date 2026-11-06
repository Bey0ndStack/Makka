import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { PrintToolbar } from "@/components/print-toolbar";
import { getInvoiceDocument, isoDate, printedDate, printedDateTime } from "@/features/finance/invoice-document";
import { company } from "@/lib/company";
import { formatAmount } from "@/lib/format";
import { isLocale } from "@/lib/i18n";
import { requirePermission } from "@/lib/permissions";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ print?: string }>;
};

const statusLabels = { DRAFT: "مسودة", CONFIRMED: "مؤكدة", CANCELLED: "ملغاة" } as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  if (!isLocale(locale)) return {};
  await requirePermission("invoice.read", locale);
  const invoice = await getInvoiceDocument(id);
  // The browser suggests the document title as the PDF file name, e.g. "مكة 1730.pdf".
  return { title: { absolute: invoice ? `مكة ${invoice.internalNumber}` : "مكة" }, robots: { index: false } };
}

export default async function InvoicePrintPage({ params, searchParams }: Props) {
  const [{ locale, id }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  await requirePermission("invoice.read", locale);
  const invoice = await getInvoiceDocument(id);
  if (!invoice) notFound();

  // The reference invoice prints Arabic-Indic digits with plain commas as separators.
  const commas = (text: string) => text.replace(/[٬٫]/g, ",");
  const amount = (value: { toString(): string }) => commas(formatAmount(value.toString(), "ar"));
  const quantity = (value: { toString(): string; decimalPlaces(): number }) => commas(formatAmount(value.toString(), "ar", Math.max(2, value.decimalPlaces())));
  const lines = invoice.items.length
    ? invoice.items.map((item) => ({
        key: item.id,
        codeName: item.codeName || company.defaultItemCodeName,
        itemCode: item.itemCode || company.defaultItemCode,
        description: item.description,
        quantity: quantity(item.quantity),
        unit: item.unit || company.defaultUnit,
        unitPrice: amount(item.unitPrice),
        total: amount(item.subtotal)
      }))
    : [{
        key: "summary",
        codeName: company.defaultItemCodeName,
        itemCode: company.defaultItemCode,
        description: invoice.notes || "إجمالي الفاتورة",
        quantity: quantity({ toString: () => "1", decimalPlaces: () => 0 }),
        unit: company.defaultUnit,
        unitPrice: amount(invoice.subtotal),
        total: amount(invoice.subtotal)
      }];
  const zero = amount("0");
  const totals = [
    { label: "اجمالي المبيعات (ج.م)", value: amount(invoice.subtotal) },
    { label: "اجمالي الخصم (ج.م)", value: zero },
    { label: "اجمالي خصم الصنف (ج.م)", value: zero },
    { label: "ضريبه القيمه المضافه (ج.م)", value: amount(invoice.taxAmount) },
    { label: "خصم الفاتورة الاضافي (ج.م)", value: zero },
    { label: "اجمالي المبلغ (ج.م)", value: amount(invoice.totalAmount), strong: true }
  ];
  const qrSvg = await QRCode.toString([
    company.tradeName,
    `رقم التسجيل الضريبي: ${company.taxRegistrationNumber}`,
    `رقم الفاتورة: ${invoice.invoiceNumber}`,
    `الرقم الداخلي: ${invoice.internalNumber}`,
    `التاريخ: ${isoDate(invoice.transactionDate)}`,
    `المشتري: ${invoice.merchant.name}`,
    `الضريبة: ${invoice.taxAmount.toFixed(2)} EGP`,
    `الإجمالي: ${invoice.totalAmount.toFixed(2)} EGP`
  ].join("\n"), { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  const buyerLocation = [invoice.merchant.region, invoice.merchant.city, "EG"].filter(Boolean).join(", ");

  return (
    <div className="invoice-print-root min-h-screen overflow-x-auto bg-slate-100 py-6">
      <style>{printStyles}</style>
      <PrintToolbar backHref={`/${locale}/invoices/${invoice.id}`} autoPrint={query.print === "1"} />
      <article className="inv-sheet" dir="rtl" lang="ar">
        <header className="inv-head">
          <div className="inv-head-main">
            <h1 className="inv-title">فاتورة</h1>
            <p>الحالة : <b>{statusLabels[invoice.status]}</b></p>
            <p className="muted">تاريخ الإصدار : {printedDate(invoice.transactionDate)}</p>
            {invoice.dueDate && <p className="muted">تاريخ الاستحقاق : {printedDate(invoice.dueDate)}</p>}
          </div>
          <p className="inv-scan-note muted">للمزيد من المعلومات, فضلا<br />قم بمسح هذا الباركود</p>
        </header>

        <section className="inv-seller-row">
          <div className="inv-seller">
            <div className="inv-bar dark">البائع</div>
            <div className="inv-seller-body">
              <div>
                <p><b>الاسم : {company.legalName}</b></p>
                <p><b>رقم التسجيل : #{company.taxRegistrationNumber}</b></p>
                <p>{company.buildingNumber}</p>
                <p>{company.street}</p>
                <p className="gap-before">{company.district}, {company.governorate}, {company.country}, {company.postalCode}</p>
                {company.phone && <p>هاتف : <span dir="ltr">{company.phone}</span></p>}
              </div>
              <div className="inv-seller-side">
                <p>كود النشاط الضريبي:</p>
                <p>{company.taxActivityCode}</p>
              </div>
            </div>
          </div>
          <div className="inv-qr" dangerouslySetInnerHTML={{ __html: qrSvg }} />
        </section>

        <section className="inv-box">
          <div className="inv-refs">
            <div>
              <p><b>رقم الفاتورة :</b> <span dir="ltr">{invoice.invoiceNumber}</span></p>
              <p><b>مرجع طلب الشراء :</b></p>
            </div>
            <div>
              <p><b>رقم الفاتورة المبدئية للتصدير :</b></p>
              <p><b>مرجع طلب المبيعات :</b></p>
            </div>
          </div>
          <div className="inv-bar grey">المشتري</div>
          <div className="inv-buyer">
            <p><b>الاسم :</b>&nbsp; {invoice.merchant.name}</p>
            {invoice.merchant.taxNumber && <p><b>رقم التسجيل : #{invoice.merchant.taxNumber}</b></p>}
            {invoice.merchant.address && <p>{invoice.merchant.address}</p>}
            <p className="gap-before">{buyerLocation}</p>
          </div>
        </section>

        <table className="inv-table">
          <colgroup>
            <col style={{ width: "11.1%" }} /><col style={{ width: "19.7%" }} /><col style={{ width: "15.1%" }} /><col style={{ width: "11.2%" }} /><col style={{ width: "23.6%" }} /><col style={{ width: "19.3%" }} />
          </colgroup>
          <thead>
            <tr><th>اسم الكود</th><th>كود الصنف</th><th>الوصف</th><th>الكمية/<br />نوع الوحدة</th><th>سعر الوحدة (ج.م)</th><th>قيمة المبيعات (ج.م)</th></tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.key} className="item">
                <td>{line.codeName}</td>
                <td><span dir="ltr">{line.itemCode}</span></td>
                <td>{line.description}</td>
                <td>{line.quantity} /<br /><span dir="ltr">{line.unit}</span></td>
                <td>{line.unitPrice}</td>
                <td>{line.total}</td>
              </tr>
            ))}
            {totals.map((row, index) => (
              <tr key={row.label} className={`total${row.strong ? " strong" : ""}`}>
                {index === 0 && <td colSpan={4} rowSpan={totals.length} className="blank" />}
                <td>{row.label}</td>
                <td>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="inv-watermark" aria-hidden="true">{statusLabels[invoice.status]}</div>

        <p className="inv-internal">الرقم الداخلي: {invoice.internalNumber}.</p>
        <footer className="inv-foot">
          <p>توقيع :&nbsp; {company.tradeName}</p>
          <p className="muted light">تاريخ انشاء الملف : {printedDateTime(new Date())} بتوقيت القاهرة</p>
        </footer>
        <p className="inv-note">فاتورة صادرة من منصة مكة لإدارة العمليات المالية · {company.tradeName} · رقم التسجيل الضريبي {company.taxRegistrationNumber}</p>
      </article>
    </div>
  );
}

// Geometry is measured in points from the reference invoice (A4, 595 x 842 pt):
// 75.3 pt side margins, 18 pt section bars, 38.4 pt table header, 29 pt item rows,
// 18 pt total rows, 4.8 pt body text and 10.8 pt title, all set in DejaVu Sans.
const printStyles = `
@font-face { font-family: "Makkah Invoice Sans"; src: url("/fonts/DejaVuSans-subset.woff2") format("woff2"); font-weight: 400; font-display: block; }
@font-face { font-family: "Makkah Invoice Sans"; src: url("/fonts/DejaVuSans-Bold-subset.woff2") format("woff2"); font-weight: 700; font-display: block; }
@page { size: A4; margin: 0; }
.inv-sheet { position: relative; box-sizing: border-box; width: 210mm; min-height: 297mm; margin: 0 auto; padding: 18pt 76.6pt 20pt 75.3pt; background: #fff; color: #000; font-family: "Makkah Invoice Sans", "DejaVu Sans", Tahoma, Arial, sans-serif; font-size: 4.8pt; line-height: 11pt; text-align: right; box-shadow: 0 4px 24px rgba(15, 23, 42, .12); }
.inv-sheet p { margin: 0; }
.inv-sheet b { font-weight: 700; }
.inv-sheet .muted { color: #666; }
.inv-sheet .light { color: #aaa; }
.inv-head { display: flex; justify-content: space-between; align-items: flex-start; height: 81.5pt; padding-inline-end: 3.6pt; }
.inv-head-main { font-size: 5.4pt; line-height: 13pt; padding-inline-start: 3.4pt; }
.inv-title { font-size: 10.8pt; line-height: 13pt; font-weight: 700; margin: 0; }
.inv-scan-note { font-size: 5.4pt; line-height: 9pt; margin-top: -0.5pt !important; }
.inv-seller-row { display: flex; justify-content: space-between; align-items: flex-start; height: 116.1pt; }
.inv-seller { width: 304.3pt; margin-inline-start: 3.6pt; }
.inv-bar { height: 18pt; display: flex; align-items: center; padding: 0 2pt; font-weight: 700; }
.inv-bar.dark { background: #3f5161; color: #fff; }
.inv-bar.grey { background: #c4c4c4; }
.inv-seller-body { display: flex; justify-content: space-between; height: 73.2pt; padding: 3.8pt 4.3pt 0 4.5pt; background: #f9f9f9; }
.inv-seller-side { padding-top: 17pt; text-align: left; direction: rtl; }
.inv-qr { width: 90pt; height: 90pt; margin-top: -1.2pt; }
.inv-qr svg { display: block; width: 100%; height: 100%; }
.gap-before { margin-top: 10pt !important; }
.inv-box { border: .75pt solid #f1f1f1; border-bottom: 0; }
.inv-refs { display: grid; grid-template-columns: 253.8pt 1fr; height: 28.5pt; padding-top: 4.2pt; line-height: 10pt; }
.inv-refs > div { padding-inline-start: 3.4pt; }
.inv-buyer { height: 72.1pt; padding: 3.2pt 3.4pt 0; }
.inv-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 4.8pt; }
.inv-table th, .inv-table td { padding: 0 3.5pt; text-align: right; vertical-align: middle; }
.inv-table th { height: 38.4pt; background: #c4c4c4; font-weight: 700; line-height: 11pt; border-inline-start: .75pt solid #cfcfcf; }
.inv-table th:first-child { border-inline-start: 0; }
.inv-table td { border: .75pt solid #efefef; }
.inv-table tr.item td { height: 29pt; line-height: 10.5pt; }
.inv-table tr.total td { height: 18pt; line-height: 10pt; }
.inv-table tr.strong td { font-weight: 700; }
.inv-table tr { break-inside: avoid; }
.inv-watermark { position: absolute; left: 297.5pt; top: 416pt; transform: translate(-50%, -50%) rotate(50deg); font-size: 28.4pt; font-weight: 700; line-height: 1; color: rgba(0, 0, 0, .1); white-space: nowrap; pointer-events: none; }
.inv-internal { margin-top: 23.6pt !important; padding-inline-start: 3.4pt; }
.inv-foot { display: flex; justify-content: space-between; margin-top: 15.3pt; padding-inline: 3.4pt 4.7pt; }
.inv-note { margin-top: 9.5pt !important; font-size: 3.6pt; line-height: 6pt; text-align: center; color: #979593; }
@media screen { .inv-sheet { zoom: 1.45; } }
@media screen and (max-width: 1000px) { .inv-sheet { zoom: 1; } }
@media print {
  html, body, .invoice-print-root { background: #fff !important; }
  .invoice-print-root { padding: 0 !important; }
  .print-toolbar { display: none !important; }
  .inv-sheet { zoom: 1; box-shadow: none; margin: 0; }
  .inv-bar, .inv-table th, .inv-seller-body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;
