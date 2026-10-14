import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parseInvoiceWorkbook } from "./import.service";

describe("parseInvoiceWorkbook", () => {
  it("parses an XLSX invoice and normalizes Egyptian date values", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Invoices");
    sheet.addRow(["Invoice Number", "Merchant Code", "Transaction Date", "Due Date", "Total Amount", "Description"]);
    sheet.addRow(["inv-eg-01", "mk-001", "10/10/2026", "11/10/2026", 1234.5, "توريدات"]);
    const written = Buffer.from(await workbook.xlsx.writeBuffer());
    const content = written.buffer.slice(written.byteOffset, written.byteOffset + written.byteLength) as ArrayBuffer;

    const rows = await parseInvoiceWorkbook("invoices.xlsx", content);
    expect(rows).toEqual([{
      rowNumber: 2,
      invoiceNumber: "inv-eg-01",
      merchantCode: "MK-001",
      transactionDate: "2026-10-10",
      dueDate: "2026-10-11",
      totalAmount: "1234.5",
      description: "توريدات",
      errors: []
    }]);
  });

  it("rejects unsupported file types and workbooks missing required columns", async () => {
    await expect(parseInvoiceWorkbook("invoices.xls", new ArrayBuffer(0))).rejects.toThrow("Only .xlsx and .csv");
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Invoices").addRow(["invoiceNumber", "merchantCode"]);
    await expect(parseInvoiceWorkbook("invoices.xlsx", await workbook.xlsx.writeBuffer())).rejects.toThrow("Missing required columns");
  });

  it("returns a clear validation error for an unreadable XLSX file", async () => {
    await expect(parseInvoiceWorkbook("invoices.xlsx", new ArrayBuffer(16))).rejects.toThrow(
      "This file is not a valid .xlsx workbook"
    );
  });

  it("identifies legacy Excel files uploaded with an .xlsx extension", async () => {
    const legacyExcelSignature = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    await expect(parseInvoiceWorkbook("invoices.xlsx", legacyExcelSignature.buffer)).rejects.toThrow(
      "legacy .xls file"
    );
  });

  it("marks formulas invalid and catches duplicate row content as data for the preview stage", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Invoices");
    sheet.addRow(["invoiceNumber", "merchantCode", "transactionDate", "totalAmount"]);
    sheet.addRow(["INV-1", "MK-001", "2026-10-10", { formula: "100+1" }]);
    const rows = await parseInvoiceWorkbook("invoices.xlsx", await workbook.xlsx.writeBuffer());
    expect(rows[0].errors).toContain("Formula cells are not accepted.");
    expect(rows[0].errors).toContain("Total amount must be greater than zero and have at most two decimal places.");
  });
});
