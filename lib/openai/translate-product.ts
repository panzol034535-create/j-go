import type { OpenAIProductEnhancement, ZozoProductData } from "@/lib/types/product-import";

type OpenAIChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export async function enhanceProductWithOpenAI(
  product: ZozoProductData
): Promise<OpenAIProductEnhancement> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY 未設定");
  }

  const prompt = `你是一位日本時尚電商 J-GO 的商品編輯。請根據以下日文商品資料，產生繁體中文內容。

商品名稱（日文）：${product.name_jp}
品牌：${product.brand}
價格：¥${product.jpy_price}
商品描述（日文）：${product.description_jp || "（無描述）"}

請以 JSON 格式回覆，不要包含 markdown code block，格式如下：
{
  "name_zh": "繁體中文商品名稱，簡潔有質感",
  "description_zh": "繁體中文商品描述，2-4 句，突出材質、版型、穿搭場景",
  "tags": ["city-boy", "minimal", "clean-fit"]
}

tags 請從以下風格中選 2-4 個最適合的：city-boy、minimal、clean-fit、casual、tokyo-style、streetwear、preppy、workwear、vintage、smart-casual`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "你是專業的日本時尚商品編輯，只回傳有效 JSON。",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API 錯誤：${errorText}`);
  }

  const data = (await response.json()) as OpenAIChatResponse;
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("OpenAI 未回傳有效內容");
  }

  let parsed: OpenAIProductEnhancement;
  try {
    parsed = JSON.parse(content) as OpenAIProductEnhancement;
  } catch {
    throw new Error("OpenAI 回傳格式錯誤");
  }

  if (!parsed.name_zh || !parsed.description_zh || !Array.isArray(parsed.tags)) {
    throw new Error("OpenAI 回傳資料不完整");
  }

  return {
    name_zh: parsed.name_zh,
    description_zh: parsed.description_zh,
    tags: parsed.tags.filter((tag) => typeof tag === "string"),
  };
}
