import { describe, expect, it } from "vitest";
import { mergeToolCallDeltas, parseServerSentEvents } from "./assistant-engine";
import { buildAssistantSystemPrompt } from "./assistant-knowledge";
import { runAssistantTool, toolDeclarationsFor, type ToolContext } from "./assistant-tools";

const context = (permissions: string[]): ToolContext => ({
  locale: "ar",
  permissions: new Set(permissions),
  user: { id: "u1", name: "أحمد", email: "a@makkah.test", roleName: "محصل" }
});

describe("assistant tools respect permissions", () => {
  it("only declares tools the user is allowed to use", () => {
    const names = (permissions: string[]) => toolDeclarationsFor(new Set(permissions)).map((tool) => tool.function.name);
    expect(names([])).toEqual(["get_my_account"]);
    expect(names(["invoice.read", "cheque.read"])).toEqual(["get_my_account", "search_invoices", "get_invoice", "search_cheques"]);
    expect(names(["user.manage"])).toContain("list_users");
    expect(names(["merchant.read"])).not.toContain("list_users");
    expect(names(["settings.manage"])).toContain("list_roles");
  });

  it("declares JSON-schema parameters without the $schema key", () => {
    const invoiceTool = toolDeclarationsFor(new Set(["invoice.read"])).find((tool) => tool.function.name === "search_invoices");
    expect(invoiceTool?.function.parameters).toMatchObject({ type: "object", properties: { status: { enum: ["DRAFT", "CONFIRMED", "CANCELLED"] } } });
    expect(invoiceTool?.function.parameters).not.toHaveProperty("$schema");
  });

  it("refuses to run a tool the user lacks permission for, even if the model calls it", async () => {
    const result = JSON.parse(await runAssistantTool("list_users", "{}", context(["invoice.read"])));
    expect(result.error).toMatch(/PERMISSION_DENIED/);
    const debts = JSON.parse(await runAssistantTool("get_debts", "{}", context([])));
    expect(debts.error).toMatch(/PERMISSION_DENIED/);
  });

  it("rejects unknown tools and invalid arguments without touching the database", async () => {
    expect(JSON.parse(await runAssistantTool("drop_tables", "{}", context(["invoice.read"]))).error).toMatch(/Unknown tool/);
    expect(JSON.parse(await runAssistantTool("search_invoices", "{not json", context(["invoice.read"]))).error).toMatch(/valid JSON/);
    expect(JSON.parse(await runAssistantTool("search_invoices", JSON.stringify({ from: "yesterday" }), context(["invoice.read"]))).error).toBe("Invalid arguments.");
    expect(JSON.parse(await runAssistantTool("search_invoices", JSON.stringify({ limit: 500 }), context(["invoice.read"]))).error).toBe("Invalid arguments.");
  });

  it("returns the user's own account without any data permission", async () => {
    const result = JSON.parse(await runAssistantTool("get_my_account", "", context(["cheque.read"])));
    expect(result).toMatchObject({ name: "أحمد", role: "محصل", permissions: ["cheque.read"], pages: [{ url: "/ar/cheques" }] });
  });
});

describe("assistant system prompt", () => {
  it("lists only accessible pages and states the permission boundary", () => {
    const prompt = buildAssistantSystemPrompt({ locale: "ar", permissions: new Set(["invoice.read", "invoice.create"]), userName: "سارة", roleName: "مشاهد", now: new Date("2026-10-19T10:00:00Z") });
    expect(prompt).toContain("(/ar/invoices)");
    expect(prompt).not.toContain("(/ar/users)");
    expect(prompt).toContain("Pages this user cannot open");
    expect(prompt).toContain("2026-10-19");
    expect(prompt).toContain("tables");
    expect(prompt).toContain("read-only");
  });
});

describe("streaming helpers", () => {
  it("parses server-sent events split across arbitrary chunk boundaries", async () => {
    const payload = 'data: {"choices":[{"delta":{"content":"مر"}}]}\n\ndata: {"choices":[{"delta":{"content":"حبا"}}]}\r\n\r\n: keep-alive\n\ndata: [DONE]\n\n';
    const bytes = new TextEncoder().encode(payload);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let index = 0; index < bytes.length; index += 7) controller.enqueue(bytes.slice(index, index + 7));
        controller.close();
      }
    });
    const chunks: unknown[] = [];
    for await (const chunk of parseServerSentEvents(stream)) chunks.push(chunk);
    expect(chunks.map((chunk) => (chunk as { choices: Array<{ delta: { content: string } }> }).choices[0].delta.content).join("")).toBe("مرحبا");
  });

  it("merges tool-call fragments by index", () => {
    const calls = mergeToolCallDeltas([], [{ index: 0, id: "call_1", function: { name: "search_", arguments: "{\"sta" } }]);
    mergeToolCallDeltas(calls, [{ index: 0, function: { name: "invoices", arguments: "tus\":\"DRAFT\"}" } }, { index: 1, id: "call_2", function: { name: "get_debts", arguments: "{}" } }]);
    expect(calls).toEqual([
      { id: "call_1", type: "function", function: { name: "search_invoices", arguments: "{\"status\":\"DRAFT\"}" } },
      { id: "call_2", type: "function", function: { name: "get_debts", arguments: "{}" } }
    ]);
  });
});
