import ExcelJS from "exceljs";
import { Readable } from "node:stream";

export type ParsedInvoiceImportRow = {
  rowNumber: number;
  invoiceNumber: string;
  merchantCode: string;
  transactionDate: string;
  dueDate: string | null;
  totalAmount: string;
  description: string;
  errors: string[];
};

const requiredHeaders = ["invoiceNumber", "merchantCode", "transactionDate", "totalAmount"] as const;
const optionalHeaders = ["dueDate", "description"] as const;

function normalizedHeader(value: string) {
  return value.replace(/[\s_-]/g, "").toLowerCase();
}

function cellValue(cell: ExcelJS.Cell) {
  const value = cell.value;
  if (value && typeof value === "object" && ("formula" in value || "sharedFormula" in value)) {
    return { text: "", formula: true as const };
  }
  if (value instanceof Date) return { text: value.toISOString().slice(0, 10), formula: false as const };
  if (value === null || value === undefined) return { text: "", formula: false as const };
  if (typeof value === "number") return { text: String(value), formula: false as const };
  return { text: cell.text.trim(), formula: false as const };
}

function parseDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
  }
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (!dmy) return null;
  const normalized = `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return parseDate(normalized);
}

function xlsxFormatError(content: ArrayBuffer) {
  const bytes = new Uint8Array(content, 0, Math.min(content.byteLength, 8));
  const isZipContainer = bytes[0] === 0x50 && bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) ||
      (bytes[2] === 0x05 && bytes[3] === 0x06) ||
      (bytes[2] === 0x07 && bytes[3] === 0x08));
  if (isZipContainer) return null;

  const isLegacyExcel = bytes.length >= 8 &&
    bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0 &&
    bytes[4] === 0xa1 && bytes[5] === 0xb1 && bytes[6] === 0x1a && bytes[7] === 0xe1;
  if (isLegacyExcel) {
    return "This is a legacy .xls file. Open it in Excel and save it as .xlsx, or export it as CSV.";
  }
  return "This file is not a valid .xlsx workbook. Download it again or open it in Excel and use Save As > Excel Workbook (*.xlsx).";
}

export async function parseInvoiceWorkbook(filename: string, content: ArrayBuffer): Promise<ParsedInvoiceImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  const extension = filename.toLowerCase().split(".").pop();
  if (extension === "xlsx") {
    const formatError = xlsxFormatError(content);
    if (formatError) throw new TypeError(formatError);
    try {
      await workbook.xlsx.read(Readable.from([Buffer.from(content)]));
    } catch {
      throw new TypeError("Excel could not read this .xlsx workbook. It may be encrypted, damaged, or contain unsupported workbook features. Open it in Excel and save a fresh copy as Excel Workbook (*.xlsx), then upload it again.");
    }
  } else if (extension === "csv") {
    try {
      await workbook.csv.read(Readable.from([Buffer.from(content)]));
    } catch {
      throw new TypeError("The CSV file is invalid or unreadable. Save it as UTF-8 CSV and try again.");
    }
  } else {
    throw new TypeError("Only .xlsx and .csv invoice files are supported.");
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount < 1) throw new TypeError("The workbook does not contain a header row.");
  if (worksheet.rowCount > 2001) throw new RangeError("A workbook can contain at most 2,000 data rows.");

  const headerRow = worksheet.getRow(1);
  const headerColumns = new Map<string, number>();
  for (let index = 1; index <= headerRow.cellCount; index += 1) {
    const header = normalizedHeader(cellValue(headerRow.getCell(index)).text);
    if (header) headerColumns.set(header, index);
  }
  const expectedHeaders = [...requiredHeaders, ...optionalHeaders];
  const columns = new Map<string, number>();
  for (const header of expectedHeaders) {
    const column = headerColumns.get(normalizedHeader(header));
    if (column) columns.set(header, column);
  }
  const missing = requiredHeaders.filter((header) => !columns.has(header));
  if (missing.length) throw new TypeError(`Missing required columns: ${missing.join(", ")}.`);

  const rows: ParsedInvoiceImportRow[] = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values = row.values;
    if (Array.isArray(values) && values.slice(1).every((value) => value === null || value === undefined || value === "")) continue;
    const read = (header: string) => {
      const column = columns.get(header);
      return column ? cellValue(row.getCell(column)) : { text: "", formula: false as const };
    };
    const invoiceNumberCell = read("invoiceNumber");
    const merchantCodeCell = read("merchantCode");
    const transactionDateCell = read("transactionDate");
    const dueDateCell = read("dueDate");
    const amountCell = read("totalAmount");
    const descriptionCell = read("description");
    const invoiceNumber = invoiceNumberCell.text.slice(0, 100);
    const merchantCode = merchantCodeCell.text.slice(0, 32).toUpperCase();
    const transactionDate = parseDate(transactionDateCell.text);
    const dueDate = dueDateCell.text ? parseDate(dueDateCell.text) : null;
    const totalAmount = amountCell.text;
    const description = (descriptionCell.text || "Imported invoice").slice(0, 200);
    const errors: string[] = [];
    if ([invoiceNumberCell, merchantCodeCell, transactionDateCell, dueDateCell, amountCell, descriptionCell].some((item) => item.formula)) errors.push("Formula cells are not accepted.");
    if (!invoiceNumber) errors.push("Invoice number is required.");
    if (!merchantCode) errors.push("Merchant code is required.");
    if (!transactionDate) errors.push("Transaction date must be YYYY-MM-DD or DD/MM/YYYY.");
    if (dueDateCell.text && !dueDate) errors.push("Due date must be YYYY-MM-DD or DD/MM/YYYY.");
    if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(totalAmount) || Number(totalAmount) <= 0) errors.push("Total amount must be greater than zero and have at most two decimal places.");
    rows.push({ rowNumber, invoiceNumber, merchantCode, transactionDate: transactionDate ?? "", dueDate, totalAmount, description, errors });
  }
  return rows;
}
