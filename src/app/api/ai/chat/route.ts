import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ProviderError, runAssistant, runPlainCompletion, type AssistantEvent, type ProviderMessage } from "@/features/assistant/assistant-engine";
import { buildAssistantSystemPrompt } from "@/features/assistant/assistant-knowledge";
import { toolDeclarationsFor } from "@/features/assistant/assistant-tools";
import { getAuthorizedMakkaAIContext, getMakkaAIProviderConfig } from "@/lib/makka-ai";
import { getUserPermissionKeys, getWorkspaceSession, getWorkspaceUser } from "@/lib/permissions";
import { isLocale } from "@/lib/i18n";
import { isSameRequestOrigin } from "@/lib/request-origin";

const bodySchema = z.object({
  locale: z.string(),
  messages: z.array(z.discriminatedUnion("role", [
    z.object({ role: z.literal("user"), content: z.string().trim().min(1).max(2000) }),
    z.object({ role: z.literal("assistant"), content: z.string().trim().min(1).max(8000) })
  ])).min(1).max(12)
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
  if (contentLength > 60_000) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }
  let input: unknown;
  try {
    const rawBody = await request.text();
    if (rawBody.length > 60_000) return NextResponse.json({ error: "Request is too large." }, { status: 413 });
    input = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(input);
  if (!parsed.success || !isLocale(parsed.data.locale)) {
    return NextResponse.json({ error: "Invalid chat request." }, { status: 400 });
  }

  const locale = parsed.data.locale;
  const arabic = locale === "ar";
  const history = parsed.data.messages;
  const latest = history.at(-1);
  if (latest?.role !== "user") {
    return NextResponse.json({ error: arabic ? "أرسل سؤالًا جديدًا أولًا." : "Send a new question first." }, { status: 400 });
  }

  const config = getMakkaAIProviderConfig();
  if (!config) {
    return NextResponse.json({
      error: arabic ? "مساعد Makka AI غير مُعد بعد. أضف إعدادات مزود الذكاء الاصطناعي إلى متغيرات البيئة." : "Makka AI is not configured yet. Add the AI provider settings to the environment."
    }, { status: 503 });
  }

  const roleName = user.roles[0]?.role.name ?? null;
  const systemPrompt = buildAssistantSystemPrompt({ locale, permissions, userName: user.name, roleName });
  // Earlier assistant turns come from the browser; they add conversational context only.
  // Every record the model can see is fetched again through permission-checked tools.
  const conversation: ProviderMessage[] = [{ role: "system", content: systemPrompt }, ...history];
  const toolContext = { locale, permissions, user: { id: user.id, name: user.name, email: user.email, roleName } };
  const tools = toolDeclarationsFor(permissions);
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(90_000)]);

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AssistantEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      let emitted = false;
      const forward = async (events: AsyncGenerator<AssistantEvent>) => {
        for await (const event of events) {
          emitted = true;
          send(event);
        }
      };
      try {
        try {
          await forward(runAssistant({ config, messages: conversation, tools, toolContext, signal }));
        } catch (error) {
          // Some models reject tool definitions; answer with pre-retrieved, permission-filtered data instead.
          if (!(error instanceof ProviderError) || emitted || ![400, 404, 422].includes(error.status)) throw error;
          console.warn("Makka AI tools unavailable for this model; using retrieval fallback.", { status: error.status });
          const context = await getAuthorizedMakkaAIContext(latest.content, permissions, user.name);
          const fallback: ProviderMessage[] = [
            { role: "system", content: `${systemPrompt}\n\n## Authorized data retrieved for this question\n${context}` },
            ...history
          ];
          await forward(runPlainCompletion({ config, messages: fallback, signal }));
        }
      } catch (error) {
        const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
        if (!request.signal.aborted) {
          console.error("Makka AI request failed.", { provider: config.provider, status: error instanceof ProviderError ? error.status : undefined, timedOut });
          send({
            type: "error",
            message: timedOut
              ? (arabic ? "استغرق الرد وقتًا أطول من اللازم. حاول مرة أخرى." : "The response took too long. Please try again.")
              : error instanceof ProviderError && error.status === 429
                ? (arabic ? "مزود الذكاء الاصطناعي مشغول حاليًا. حاول بعد دقيقة." : "The AI provider is busy. Try again in a minute.")
                : (arabic ? "تعذر الحصول على رد الآن. حاول مرة أخرى لاحقًا." : "Could not get a response right now. Please try again later.")
          });
        }
      } finally {
        controller.close();
      }
    }
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Accel-Buffering": "no"
    }
  });
}
