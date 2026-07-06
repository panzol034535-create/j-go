import {
  AI_SUPPORT_GENERIC_ERROR_MESSAGE,
  throwOpenAiRequestError,
} from "@/lib/openai/ai-support-error";

const AI_SUPPORT_SYSTEM_PROMPT = `你是 J-GO 的客服助理。
J-GO 是日本服飾代購平台，提供日本商品代購、AI Lookbook、整套穿搭購買。
回答請使用繁體中文，語氣親切、簡短、清楚。
規則：
- 不要承諾確切到貨日期，只能說一般約 7–14 天。
- 不要承諾可退換貨。代購商品非瑕疵通常不提供退換。
- 不要自行承諾退款，請引導聯絡人工客服。
- 不要要求使用者提供信用卡、密碼、身分證等敏感資料。
- 涉及個人訂單、退款、取消、物流異常，請引導使用者聯絡人工客服。
- 不確定時請說明並建議聯絡人工客服。`;

type OpenAIChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export async function generateAiSupportReply(message: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY 未設定");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: AI_SUPPORT_SYSTEM_PROMPT },
        { role: "user", content: message },
      ],
      temperature: 0.6,
      max_tokens: 512,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throwOpenAiRequestError(response.status, errorText, "ai-support");
  }

  const data = (await response.json()) as OpenAIChatResponse;
  const reply = data.choices?.[0]?.message?.content?.trim();

  if (!reply) {
    throw new Error(AI_SUPPORT_GENERIC_ERROR_MESSAGE);
  }

  return reply;
}
