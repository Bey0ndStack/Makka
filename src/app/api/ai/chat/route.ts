import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildMakkaAISystemPrompt, getAuthorizedMakkaAIContext, getMakkaAIProviderConfig } from "@/lib/makka-ai";
import { getUserPermissionKeys, getWorkspaceSession, getWorkspaceUser } from "@/lib/permissions";
import { isLocale } from "@/lib/i18n";
import { isSameRequestOrigin } from "@/lib/request-origin";

const bodySchema = z.object({
  locale: z.string(),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(1200)
  })).min(1).max(8)
});

const requestCounts = new Map<string, { count: number; resetAt: number }>();
const requestsPerMinute = 20;

function rateLimited(userId: string) {
  const now = Date.now();
  const current = requestCounts.get(userId);
  if (!current || current.resetAt <= now) {
    if (requestCounts.size > 5_000) {
      for (const [id, entry] of requestCounts) {
        if (entry.resetAt <= now) requestCounts.delete(id);
      }
    }
    requestCounts.set(userId, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  current.count += 1;
  return current.count > requestsPerMinute;
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isSameRequestOrigin(origin, request.nextUrl, request.headers)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

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
  if (rateLimited(userId)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 20_000) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }
  let input: unknown;
  try {
    const rawBody = await request.text();
    if (rawBody.length > 20_000) return NextResponse.json({ error: "Request is too large." }, { status: 413 });
    input = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(input);
  if (!parsed.success || !isLocale(parsed.data.locale)) {
    return NextResponse.json({ error: "Invalid chat request." }, { status: 400 });
  }

  const locale = parsed.data.locale;
  const latestMessage = parsed.data.messages.at(-1);
  if (latestMessage?.role !== "user") {
    return NextResponse.json({ error: locale === "ar" ? "أرسل سؤالًا جديدًا أولًا." : "Send a new question first." }, { status: 400 });
  }
  const latestQuestion = latestMessage.content;

  const config = getMakkaAIProviderConfig();
  if (!config) {
    return NextResponse.json({
      error: locale === "ar" ? "مساعد Makka AI غير مُعد بعد. أضف إعدادات مزود الذكاء الاصطناعي إلى متغيرات البيئة." : "Makka AI is not configured yet. Add the AI provider settings to the environment."
    }, { status: 503 });
  }

  const context = await getAuthorizedMakkaAIContext(latestQuestion, permissions, user.name);
  const messages = [
    { role: "system", content: buildMakkaAISystemPrompt(locale, permissions, context) },
    { role: "user", content: latestQuestion }
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ model: config.model, messages, max_tokens: 700, temperature: 0.2 }),
      signal: controller.signal,
      cache: "no-store"
    });
    if (!response.ok) {
      console.error("Makka AI provider request failed.", { provider: config.provider, status: response.status });
      return NextResponse.json({
        error: locale === "ar" ? "تعذر الحصول على رد الآن. حاول مرة أخرى لاحقًا." : "Could not get a response right now. Please try again later."
      }, { status: 502 });
    }

    const result: unknown = await response.json();
    const reply = z.object({
      choices: z.array(z.object({ message: z.object({ content: z.string() }) }))
    }).safeParse(result);
    const content = reply.success ? reply.data.choices[0]?.message.content.trim() : "";
    if (!content) {
      console.error("Makka AI provider returned an empty or invalid completion.", { provider: config.provider });
      return NextResponse.json({
        error: locale === "ar" ? "وصل رد غير صالح من مزود الذكاء الاصطناعي. حاول مرة أخرى." : "The AI provider returned an invalid response. Please try again."
      }, { status: 502 });
    }
    return NextResponse.json({ reply: content }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({
        error: locale === "ar" ? "استغرق الرد وقتًا أطول من اللازم. حاول مرة أخرى." : "The response took too long. Please try again."
      }, { status: 504 });
    }
    console.error("Makka AI provider request could not be completed.", { provider: config.provider });
    return NextResponse.json({
      error: locale === "ar" ? "تعذر الاتصال بمزود الذكاء الاصطناعي. تحقق من الإعدادات وحاول مرة أخرى." : "Could not connect to the AI provider. Check the configuration and try again."
    }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
