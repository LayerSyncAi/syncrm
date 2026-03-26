import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { openai } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  streamText,
  stepCountIs,
  safeValidateUIMessages,
} from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { COPILOT_SYSTEM_PROMPT } from "@/lib/ai/copilot-system";
import { createCopilotTools } from "@/lib/ai/copilot-tools";

export const maxDuration = 60;

const requestSchema = z.object({
  messages: z.array(z.unknown()),
  id: z.string().optional(),
  trigger: z.string().optional(),
  messageId: z.string().optional(),
});

export async function POST(req: Request) {
  const token = await convexAuthNextjsToken();
  if (!token) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Server is not configured with OPENAI_API_KEY." },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const validation = await safeValidateUIMessages({ messages: parsed.data.messages });
  if (!validation.success) {
    return NextResponse.json({ error: "Invalid message format" }, { status: 400 });
  }
  const uiMessages = validation.data;
  const tools = createCopilotTools(token);

  const modelMessages = await convertToModelMessages(
    uiMessages.map((m) => {
      const { id: _omit, ...rest } = m;
      return rest;
    }),
    { tools }
  );

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: COPILOT_SYSTEM_PROMPT,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(14),
  });

  return result.toUIMessageStreamResponse();
}
