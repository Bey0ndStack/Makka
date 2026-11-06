import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown, safeInternalHref } from "./chat-markdown";

describe("parseMarkdown", () => {
  it("parses an Arabic answer with a heading, bold summary, table and steps", () => {
    const blocks = parseMarkdown([
      "### ملخص الديون",
      "إجمالي المستحق **107,046.00 ج.م** على 2 تاجر.",
      "",
      "| التاجر | المستحق | المتأخر |",
      "| --- | ---: | ---: |",
      "| [شركة النيل](/ar/merchants/abc) | 93,900.00 | 0.00 |",
      "| أسواق الإسكندرية | 13,146.00 |",
      "",
      "1. افتح صفحة **التحصيلات**",
      "2. اضغط «تسجيل تحصيل جديد»",
      "   - اختار التاجر"
    ].join("\n"));
    expect(blocks.map((block) => block.type)).toEqual(["heading", "paragraph", "table", "list"]);
    const table = blocks[2];
    expect(table.type === "table" && table.rows).toEqual([["[شركة النيل](/ar/merchants/abc)", "93,900.00", "0.00"], ["أسواق الإسكندرية", "13,146.00", ""]]);
    expect(table.type === "table" && table.align).toEqual([null, "right", "right"]);
    const list = blocks[3];
    expect(list.type === "list" && list.ordered).toBe(true);
    expect(list.type === "list" && list.items[1].children?.items[0].content).toBe("اختار التاجر");
  });

  it("keeps an unfinished streamed table header as a paragraph until its divider arrives", () => {
    expect(parseMarkdown("| التاجر | المستحق |").map((block) => block.type)).toEqual(["paragraph"]);
  });

  it("parses code fences, quotes and rules", () => {
    expect(parseMarkdown("> ملاحظة\n\n---\n\n```\nINV-1\n```").map((block) => block.type)).toEqual(["quote", "hr", "code"]);
  });
});

describe("parseInline", () => {
  it("parses bold, italic, code and links without touching snake_case or arithmetic", () => {
    expect(parseInline("**مهم** و *مائل* و `INV-1` و [الفاتورة](/ar/invoices/1)")).toEqual([
      { type: "strong", children: [{ type: "text", value: "مهم" }] },
      { type: "text", value: " و " },
      { type: "em", children: [{ type: "text", value: "مائل" }] },
      { type: "text", value: " و " },
      { type: "code", value: "INV-1" },
      { type: "text", value: " و " },
      { type: "link", href: "/ar/invoices/1", children: [{ type: "text", value: "الفاتورة" }] }
    ]);
    expect(parseInline("payment_method 2 * 3 * 4")).toEqual([{ type: "text", value: "payment_method 2 * 3 * 4" }]);
  });
});

describe("safeInternalHref", () => {
  it("allows same-site paths only", () => {
    expect(safeInternalHref("/ar/invoices/abc?x=1")).toBe("/ar/invoices/abc?x=1");
    expect(safeInternalHref("https://evil.example")).toBeNull();
    expect(safeInternalHref("//evil.example")).toBeNull();
    expect(safeInternalHref("javascript:alert(1)")).toBeNull();
  });
});
