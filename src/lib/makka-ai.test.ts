import { describe, expect, it } from "vitest";
import { buildMakkaAISystemPrompt, getAuthorizedMakkaAIContext, getMakkaAIProviderConfig, getMakkaAIQuestionScope, getMakkaAISearchTerms } from "./makka-ai";

describe("Makka AI access boundaries", () => {
  it("does not retrieve private records when the user has no read permissions", async () => {
    const context = await getAuthorizedMakkaAIContext("show invoice INV-2026-001", new Set());
    expect(JSON.parse(context)).toEqual({ availableSections: [] });
  });

  it("limits the assistant instructions to permissions granted to the user", () => {
    const prompt = buildMakkaAISystemPrompt("en", new Set(["merchant.read"]), "{}");
    expect(prompt).toContain("merchant records");
    expect(prompt).not.toContain("invoices, payments, balances and debts");
    expect(prompt).toContain("read-only");
    expect(prompt).toContain("Never guess figures");
  });

  it("recognizes Egyptian Arabic questions about today's profits and merchant names", () => {
    expect(getMakkaAIQuestionScope("اهلا ممكن تقلي اي الارباح انهارده").dashboard).toBe(true);
    expect(getMakkaAIQuestionScope("ممكن تقلي اسامي التجار الي عندي").merchant).toBe(true);
    expect(getMakkaAIQuestionScope("انت شايف بيانات اي").overview).toBe(true);
    expect(getMakkaAIQuestionScope("بص مين المستخدمين الي شغالين الان علي المنصه").users).toBe(true);
    expect(getMakkaAIQuestionScope("انا اسمي اي اصلا").currentUser).toBe(true);
    expect(getMakkaAIQuestionScope("تحصيلات الشهر").monthlyCollections).toBe(true);
    expect(getMakkaAIQuestionScope("التجار النشطون").activeMerchants).toBe(true);
    expect(getMakkaAIQuestionScope("عندنا كام فاتوره").invoice).toBe(true);
    expect(getMakkaAIQuestionScope("عندنا كام فاتوره").count).toBe(true);
    expect(getMakkaAISearchTerms("ممكن تقلي اسامي التجار الي عندي")).toEqual([]);
    expect(getMakkaAISearchTerms("التجار النشطون")).toEqual([]);
    expect(getMakkaAISearchTerms("عندنا كام فاتوره")).toEqual([]);
    expect(getMakkaAISearchTerms("مين رصيد أحمد محمد")).toEqual(["أحمد", "محمد"]);
  });

  it("provides the signed-in user's own name without exposing it in unrelated answers", async () => {
    const context = await getAuthorizedMakkaAIContext("انا اسمي اي اصلا", new Set(), "أحمد محمد");
    expect(JSON.parse(context)).toEqual({
      currentUser: { name: "أحمد محمد" },
      availableSections: []
    });
    const unrelatedContext = await getAuthorizedMakkaAIContext("كيف أضيف فاتورة؟", new Set(), "أحمد محمد");
    expect(JSON.parse(unrelatedContext)).toEqual({ availableSections: [] });
  });

  it("does not include or retrieve user records without user-management permission", async () => {
    const context = await getAuthorizedMakkaAIContext("مين المستخدمين النشطين؟", new Set());
    expect(JSON.parse(context)).toEqual({ availableSections: [] });
  });

  it("does not allow the assistant to list users without user-management permission", () => {
    const prompt = buildMakkaAISystemPrompt("ar", new Set(["merchant.read"]), "{}");
    expect(prompt).toContain("لا تقدم تفاصيل تشغيلية أو بيانات عنها إلا إذا كانت لديه الصلاحية");
    expect(prompt).toContain("activeUsers تمثل حسابات حالتها نشطة");
    expect(prompt).toContain("لا تعتبر قائمة rows المحدودة هي العدد الكلي");
    expect(prompt).toContain("حقل monthlyCollections هو إجمالي التحصيلات المكتملة للشهر الحالي");
  });

  it("configures the Groq OpenAI-compatible endpoint and model", () => {
    const previous = {
      provider: process.env.MAKKA_AI_PROVIDER,
      apiKey: process.env.MAKKA_AI_API_KEY,
      model: process.env.MAKKA_AI_MODEL
    };
    process.env.MAKKA_AI_PROVIDER = " groq ";
    process.env.MAKKA_AI_API_KEY = "test-key-not-real";
    process.env.MAKKA_AI_MODEL = "openai/gpt-oss-120b";

    try {
      expect(getMakkaAIProviderConfig()).toEqual({
        provider: "groq",
        apiKey: "test-key-not-real",
        model: "openai/gpt-oss-120b",
        url: "https://api.groq.com/openai/v1/chat/completions"
      });
    } finally {
      if (previous.provider === undefined) delete process.env.MAKKA_AI_PROVIDER;
      else process.env.MAKKA_AI_PROVIDER = previous.provider;
      if (previous.apiKey === undefined) delete process.env.MAKKA_AI_API_KEY;
      else process.env.MAKKA_AI_API_KEY = previous.apiKey;
      if (previous.model === undefined) delete process.env.MAKKA_AI_MODEL;
      else process.env.MAKKA_AI_MODEL = previous.model;
    }
  });
});
