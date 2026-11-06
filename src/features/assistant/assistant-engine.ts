import { runAssistantTool, toolStatus, type toolDeclarationsFor, type ToolContext } from "@/features/assistant/assistant-tools";

export type AssistantEvent =
  | { type: "status"; text: string }
  | { type: "delta"; text: string }
  | { type: "clear" }
  | { type: "done" }
  | { type: "error"; message: string };

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ProviderMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ProviderConfig = { url: string; apiKey: string; model: string };

export class ProviderError extends Error {
  constructor(readonly status: number, readonly detail: string) {
    super(`Provider responded with ${status}`);
  }
}

const MAX_ROUNDS = 5;

/** Parses an OpenAI-compatible server-sent event stream into JSON chunks. */
export async function* parseServerSentEvents(stream: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let boundary = buffer.search(/\r?\n\r?\n/);
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary).replace(/^\r?\n\r?\n/, "");
        const data = block.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
        if (data === "[DONE]") return;
        if (data) {
          try {
            yield JSON.parse(data);
          } catch {
            // Ignore keep-alive or malformed fragments.
          }
        }
        boundary = buffer.search(/\r?\n\r?\n/);
      }
      if (done) return;
    }
  } finally {
    reader.releaseLock();
  }
}

type StreamDelta = { content?: string | null; tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> };

/** Merges streamed tool-call fragments (split across chunks by index) into complete calls. */
export function mergeToolCallDeltas(calls: ToolCall[], deltas: NonNullable<StreamDelta["tool_calls"]>) {
  for (const delta of deltas) {
    const index = delta.index ?? calls.length;
    const call = calls[index] ?? (calls[index] = { id: "", type: "function", function: { name: "", arguments: "" } });
    if (delta.id) call.id = delta.id;
    if (delta.function?.name) call.function.name += delta.function.name;
    if (delta.function?.arguments) call.function.arguments += delta.function.arguments;
  }
  return calls;
}

async function requestCompletion(config: ProviderConfig, body: Record<string, unknown>, signal: AbortSignal) {
  const response = await fetch(config.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ model: config.model, stream: true, temperature: 0.2, max_tokens: 2500, ...body }),
    signal,
    cache: "no-store"
  });
  if (!response.ok || !response.body) throw new ProviderError(response.status, (await response.text().catch(() => "")).slice(0, 500));
  return response.body;
}

/**
 * Runs the tool-calling loop and streams events. Tools execute server-side with the
 * caller's permissions; the model only ever sees results the user is allowed to see.
 */
export async function* runAssistant({
  config,
  messages,
  tools,
  toolContext,
  signal
}: {
  config: ProviderConfig;
  messages: ProviderMessage[];
  tools: ReturnType<typeof toolDeclarationsFor>;
  toolContext: ToolContext;
  signal: AbortSignal;
}): AsyncGenerator<AssistantEvent> {
  const conversation = [...messages];
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const allowTools = tools.length > 0 && round < MAX_ROUNDS - 1;
    const stream = await requestCompletion(config, {
      messages: conversation,
      ...(allowTools ? { tools, tool_choice: "auto" } : {})
    }, signal);

    let content = "";
    const calls: ToolCall[] = [];
    for await (const chunk of parseServerSentEvents(stream)) {
      const delta = (chunk as { choices?: Array<{ delta?: StreamDelta }> }).choices?.[0]?.delta;
      if (!delta) continue;
      if (delta.content) {
        content += delta.content;
        yield { type: "delta", text: delta.content };
      }
      if (delta.tool_calls?.length) mergeToolCallDeltas(calls, delta.tool_calls);
    }

    const completeCalls = calls.filter((call) => call.function.name);
    if (!completeCalls.length) {
      if (!content.trim()) throw new ProviderError(502, "Empty completion");
      yield { type: "done" };
      return;
    }

    // Text streamed before a tool call is a preamble; the final answer replaces it.
    if (content) yield { type: "clear" };
    completeCalls.forEach((call, index) => { if (!call.id) call.id = `call_${round}_${index}`; });
    conversation.push({ role: "assistant", content: content || null, tool_calls: completeCalls });
    for (const name of new Set(completeCalls.map((call) => call.function.name))) {
      yield { type: "status", text: toolStatus(name, toolContext.locale) };
    }
    const results = await Promise.all(completeCalls.map((call) => runAssistantTool(call.function.name, call.function.arguments, toolContext)));
    completeCalls.forEach((call, index) => conversation.push({ role: "tool", tool_call_id: call.id, content: results[index] }));
    yield { type: "status", text: toolContext.locale === "ar" ? "بيكتب الرد" : "Writing the answer" };
  }
  yield { type: "done" };
}

/** Streams a plain completion without tools (fallback for providers or models without tool support). */
export async function* runPlainCompletion({ config, messages, signal }: { config: ProviderConfig; messages: ProviderMessage[]; signal: AbortSignal }): AsyncGenerator<AssistantEvent> {
  const stream = await requestCompletion(config, { messages }, signal);
  let received = false;
  for await (const chunk of parseServerSentEvents(stream)) {
    const text = (chunk as { choices?: Array<{ delta?: StreamDelta }> }).choices?.[0]?.delta?.content;
    if (text) {
      received = true;
      yield { type: "delta", text };
    }
  }
  if (!received) throw new ProviderError(502, "Empty completion");
  yield { type: "done" };
}
