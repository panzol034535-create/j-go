const AI_INTENT_SYSTEM_PROMPT = `你是 LookPick 客服訊息分類器。
請判斷使用者訊息屬於哪一類：
- recommend：想找商品、衣服、穿搭、Lookbook、風格、預算、場合、性別、尺寸推薦
- order：查詢訂單、付款、出貨、物流、門市、訂單狀態
- support：一般客服、退換貨、尺寸政策、付款方式、物流說明、網站操作
- other：其他閒聊或無法分類

只輸出 JSON：
{
  "intent": "recommend" | "order" | "support" | "other"
}`;

export type AiSupportIntent = "recommend" | "order" | "support" | "other";

const VALID_INTENTS = new Set<AiSupportIntent>([
  "recommend",
  "order",
  "support",
  "other",
]);

type OpenAIChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return null;
}

function parseIntentValue(value: unknown): AiSupportIntent | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase() as AiSupportIntent;
  return VALID_INTENTS.has(normalized) ? normalized : null;
}

export async function classifyAiSupportIntent(message: string): Promise<AiSupportIntent> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return "support";
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: AI_INTENT_SYSTEM_PROMPT },
          { role: "user", content: message },
        ],
        temperature: 0,
        max_tokens: 64,
      }),
    });

    if (!response.ok) {
      return "support";
    }

    const data = (await response.json()) as OpenAIChatResponse;
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return "support";
    }

    const jsonText = extractJsonObject(content);
    if (!jsonText) {
      return "support";
    }

    const parsed = JSON.parse(jsonText) as { intent?: unknown };
    return parseIntentValue(parsed.intent) || "support";
  } catch {
    return "support";
  }
}
