import {
  AI_RECOMMEND_DIVERSITY_PROMPT,
} from "@/lib/server/ai-recommend-ranking";
import {
  AI_SUPPORT_GENERIC_ERROR_MESSAGE,
  throwOpenAiRequestError,
} from "@/lib/openai/ai-support-error";
import type {
  AiRecommendCatalog,
  AiRecommendCatalogLookbook,
  AiRecommendCatalogOptions,
  AiRecommendCatalogProduct,
  AiRecommendResponseLookbook,
  AiRecommendResponseProduct,
} from "@/lib/server/ai-recommend-catalog";
import {
  loadAiRecommendCatalog,
  pickVisionCandidates,
  resolveRecommendResponseItems,
} from "@/lib/server/ai-recommend-catalog";

const AI_RECOMMEND_MODEL = "gpt-4o-mini";

const AI_RECOMMEND_SYSTEM_PROMPT = `你是 LookPick 的日系穿搭導購 AI。
你會看到 LookPick 現有商品與 Lookbook 的文字資料和圖片。
請根據使用者需求，從列表中挑選最適合的商品與 Lookbook。
你只能推薦列表中存在的 id。
不可編造商品、價格、庫存、折扣。
不可承諾一定有貨。
如果找不到完全符合，請推薦最接近的選項並說明原因。
回答使用繁體中文。
輸出必須是 JSON：
{
  "reply": string,
  "product_ids": number[],
  "lookbook_ids": number[]
}`;

const AI_PRESCREEN_SYSTEM_PROMPT = `你是 LookPick 的穿搭導購預篩 AI。
根據使用者需求，從商品與 Lookbook 列表中挑出最可能符合的候選。
你只能選擇列表中存在的 id。
不可編造 id。
輸出必須是 JSON：
{
  "product_ids": number[],
  "lookbook_ids": number[]
}
最多輸出 6 個 product_ids、3 個 lookbook_ids。
${AI_RECOMMEND_DIVERSITY_PROMPT}`;

export type GenerateAiRecommendationOptions = AiRecommendCatalogOptions;

function buildRecommendSystemPrompt(catalog: AiRecommendCatalog): string {
  let prompt = `${AI_RECOMMEND_SYSTEM_PROMPT}\n${AI_RECOMMEND_DIVERSITY_PROMPT}`;

  if (catalog.rankingContext.refreshRequest) {
    prompt += `\n使用者希望「換一批 / 其他推薦」，請優先推薦列表中不同的商品與 Lookbook。`;
  }

  return prompt;
}

function buildPreScreenSystemPrompt(catalog: AiRecommendCatalog): string {
  let prompt = AI_PRESCREEN_SYSTEM_PROMPT;

  if (catalog.rankingContext.refreshRequest) {
    prompt += `\n使用者希望看到不同候選，請避免只選同一批熱門 id。`;
  }

  return prompt;
}

type OpenAIChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

type VisionContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type OpenAIMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "user"; content: VisionContentPart[] };

class OpenAiRecommendHttpError extends Error {
  readonly httpStatus: number;
  readonly errorText: string;

  constructor(httpStatus: number, errorText: string) {
    super(`OpenAI HTTP ${httpStatus}`);
    this.name = "OpenAiRecommendHttpError";
    this.httpStatus = httpStatus;
    this.errorText = errorText;
  }
}

export type AiRecommendModelResult = {
  reply: string;
  product_ids: number[];
  lookbook_ids: number[];
  parseFailed: boolean;
};

export type AiRecommendPreScreenResult = {
  product_ids: number[];
  lookbook_ids: number[];
};

type RecommendCandidateSet = {
  products: AiRecommendCatalogProduct[];
  lookbooks: AiRecommendCatalogLookbook[];
};

function buildCatalogNotes(catalog: AiRecommendCatalog): string[] {
  const catalogNotes: string[] = [];

  if (catalog.productsLoadFailed) {
    catalogNotes.push("商品資料目前讀取失敗，推薦可能不完整。");
  }
  if (catalog.lookbooksLoadFailed) {
    catalogNotes.push("Lookbook 資料目前讀取失敗，推薦可能不完整。");
  }
  if (!catalog.productsLoadFailed && catalog.products.length === 0) {
    catalogNotes.push("目前沒有可推薦的商品資料。");
  }
  if (!catalog.lookbooksLoadFailed && catalog.lookbooks.length === 0) {
    catalogNotes.push("目前沒有可推薦的 Lookbook 資料。");
  }

  return catalogNotes;
}

function buildRecommendUserPrompt(
  message: string,
  products: AiRecommendCatalogProduct[],
  lookbooks: AiRecommendCatalogLookbook[],
  catalogNotes: string[]
): string {
  const notes =
    catalogNotes.length > 0
      ? `\n\n資料備註：\n${catalogNotes.map((note) => `- ${note}`).join("\n")}`
      : "";

  return `使用者問題：${message}

可推薦商品（JSON）：
${JSON.stringify(products)}

可推薦 Lookbook（JSON）：
${JSON.stringify(lookbooks)}${notes}`;
}

function buildPreScreenUserPrompt(
  message: string,
  products: AiRecommendCatalogProduct[],
  lookbooks: AiRecommendCatalogLookbook[],
  catalogNotes: string[]
): string {
  const notes =
    catalogNotes.length > 0
      ? `\n\n資料備註：\n${catalogNotes.map((note) => `- ${note}`).join("\n")}`
      : "";

  return `使用者問題：${message}

請從以下列表中預篩最可能符合的候選（只看文字，不看圖片）。

可選商品（JSON）：
${JSON.stringify(products)}

可選 Lookbook（JSON）：
${JSON.stringify(lookbooks)}${notes}`;
}

function formatProductSummary(product: AiRecommendCatalogProduct): string {
  const colors = product.colors.length > 0 ? product.colors.join("、") : "未提供";
  const sizes = product.sizes.length > 0 ? product.sizes.join("/") : "未提供";
  const tags = String(product.tags || "").trim() || "無";

  return `商品 id=${product.id}，名稱=${product.name_zh}，品牌=${product.brand}，價格=${product.price}，顏色=${colors}，尺寸=${sizes}，性別=${product.gender}，tags=${tags}`;
}

function formatLookbookSummary(lookbook: AiRecommendCatalogLookbook): string {
  const productIds =
    lookbook.product_ids.length > 0 ? lookbook.product_ids.join(",") : "無";

  return `Lookbook id=${lookbook.id}，標題=${lookbook.title}，tag=${lookbook.tag}，性別=${lookbook.gender}，product_ids=${productIds}`;
}

function buildVisionRecommendUserContent(
  message: string,
  products: AiRecommendCatalogProduct[],
  lookbooks: AiRecommendCatalogLookbook[],
  catalogNotes: string[]
): VisionContentPart[] {
  const parts: VisionContentPart[] = [
    {
      type: "text",
      text: `使用者問題：${message}

以下是預篩後的候選商品與 Lookbook。請同時參考文字與圖片，挑選最適合的選項。`,
    },
  ];

  if (catalogNotes.length > 0) {
    parts.push({
      type: "text",
      text: `資料備註：\n${catalogNotes.map((note) => `- ${note}`).join("\n")}`,
    });
  }

  for (const product of products) {
    parts.push({ type: "text", text: formatProductSummary(product) });

    const imageUrl = String(product.image || "").trim();
    if (imageUrl) {
      parts.push({ type: "image_url", image_url: { url: imageUrl } });
    }
  }

  for (const lookbook of lookbooks) {
    parts.push({ type: "text", text: formatLookbookSummary(lookbook) });

    const imageUrl = String(lookbook.image || "").trim();
    if (imageUrl) {
      parts.push({ type: "image_url", image_url: { url: imageUrl } });
    }
  }

  return parts;
}

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

function normalizeIdList(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item) && item > 0)
    )
  );
}

function parseAiRecommendModelResult(content: string): AiRecommendModelResult {
  const jsonText = extractJsonObject(content);

  if (!jsonText) {
    return {
      reply: content.trim() || "目前暫時無法提供推薦，請稍後再試。",
      product_ids: [],
      lookbook_ids: [],
      parseFailed: true,
    };
  }

  try {
    const parsed = JSON.parse(jsonText) as {
      reply?: unknown;
      product_ids?: unknown;
      lookbook_ids?: unknown;
    };

    return {
      reply: String(parsed.reply ?? "").trim() || "已為你整理推薦結果。",
      product_ids: normalizeIdList(parsed.product_ids),
      lookbook_ids: normalizeIdList(parsed.lookbook_ids),
      parseFailed: false,
    };
  } catch {
    return {
      reply: content.trim() || "目前暫時無法提供推薦，請稍後再試。",
      product_ids: [],
      lookbook_ids: [],
      parseFailed: true,
    };
  }
}

function parseAiRecommendPreScreenResult(content: string): AiRecommendPreScreenResult {
  const jsonText = extractJsonObject(content);

  if (!jsonText) {
    return { product_ids: [], lookbook_ids: [] };
  }

  try {
    const parsed = JSON.parse(jsonText) as {
      product_ids?: unknown;
      lookbook_ids?: unknown;
    };

    return {
      product_ids: normalizeIdList(parsed.product_ids),
      lookbook_ids: normalizeIdList(parsed.lookbook_ids),
    };
  } catch {
    return { product_ids: [], lookbook_ids: [] };
  }
}

async function requestOpenAiRecommend(
  apiKey: string,
  messages: OpenAIMessage[]
): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: AI_RECOMMEND_MODEL,
      response_format: { type: "json_object" },
      messages,
      temperature: 0.6,
      max_tokens: 900,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new OpenAiRecommendHttpError(response.status, errorText);
  }

  const data = (await response.json()) as OpenAIChatResponse;
  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error(AI_SUPPORT_GENERIC_ERROR_MESSAGE);
  }

  return content;
}

export type AiRecommendationResult = {
  reply: string;
  products: AiRecommendResponseProduct[];
  lookbooks: AiRecommendResponseLookbook[];
};

function buildRecommendReply(
  baseReply: string,
  catalog: AiRecommendCatalog,
  products: AiRecommendResponseProduct[],
  lookbooks: AiRecommendResponseLookbook[]
): string {
  let reply = baseReply;

  if (
    catalog.productsLoadFailed &&
    catalog.lookbooksLoadFailed &&
    products.length === 0 &&
    lookbooks.length === 0
  ) {
    reply = `${reply}\n\n目前商品與 Lookbook 資料讀取失敗，暫時無法提供有效推薦。`.trim();
  } else if (
    (catalog.productsLoadFailed || catalog.products.length === 0) &&
    (catalog.lookbooksLoadFailed || catalog.lookbooks.length === 0) &&
    products.length === 0 &&
    lookbooks.length === 0
  ) {
    reply = `${reply}\n\n目前可推薦資料不足，請稍後再試。`.trim();
  }

  return reply;
}

export async function generateAiRecommendation(
  input: string | GenerateAiRecommendationOptions
): Promise<AiRecommendationResult> {
  const options: GenerateAiRecommendationOptions =
    typeof input === "string" ? { message: input } : input;
  const catalog = await loadAiRecommendCatalog(options);
  const modelResult = await generateAiRecommendResult(options.message, catalog);
  const { products, lookbooks } = resolveRecommendResponseItems(
    catalog,
    modelResult.product_ids,
    modelResult.lookbook_ids
  );

  return {
    reply: buildRecommendReply(modelResult.reply, catalog, products, lookbooks),
    products,
    lookbooks,
  };
}

async function generateAiRecommendPreScreenResult(
  apiKey: string,
  message: string,
  catalog: AiRecommendCatalog
): Promise<AiRecommendPreScreenResult> {
  const catalogNotes = buildCatalogNotes(catalog);

  try {
    const content = await requestOpenAiRecommend(apiKey, [
      { role: "system", content: buildPreScreenSystemPrompt(catalog) },
      {
        role: "user",
        content: buildPreScreenUserPrompt(
          message,
          catalog.products,
          catalog.lookbooks,
          catalogNotes
        ),
      },
    ]);

    return parseAiRecommendPreScreenResult(content);
  } catch (error) {
    if (error instanceof OpenAiRecommendHttpError) {
      console.warn(
        `[ai-recommend] pre-screen failed (${error.httpStatus}), using default candidates:`,
        error.errorText
      );
    } else {
      console.warn("[ai-recommend] pre-screen failed, using default candidates:", error);
    }

    return { product_ids: [], lookbook_ids: [] };
  }
}

async function generateAiRecommendVisionResult(
  apiKey: string,
  message: string,
  catalog: AiRecommendCatalog,
  candidates: RecommendCandidateSet
): Promise<AiRecommendModelResult> {
  const catalogNotes = buildCatalogNotes(catalog);
  const content = await requestOpenAiRecommend(apiKey, [
    { role: "system", content: buildRecommendSystemPrompt(catalog) },
    {
      role: "user",
      content: buildVisionRecommendUserContent(
        message,
        candidates.products,
        candidates.lookbooks,
        catalogNotes
      ),
    },
  ]);

  return parseAiRecommendModelResult(content);
}

async function generateAiRecommendTextResult(
  apiKey: string,
  message: string,
  catalog: AiRecommendCatalog,
  candidates: RecommendCandidateSet
): Promise<AiRecommendModelResult> {
  const catalogNotes = buildCatalogNotes(catalog);
  const content = await requestOpenAiRecommend(apiKey, [
    { role: "system", content: buildRecommendSystemPrompt(catalog) },
    {
      role: "user",
      content: buildRecommendUserPrompt(
        message,
        candidates.products,
        candidates.lookbooks,
        catalogNotes
      ),
    },
  ]);

  return parseAiRecommendModelResult(content);
}

export async function generateAiRecommendResult(
  message: string,
  catalog: AiRecommendCatalog
): Promise<AiRecommendModelResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY 未設定");
  }

  const preScreen = await generateAiRecommendPreScreenResult(apiKey, message, catalog);
  const candidates = pickVisionCandidates(
    catalog,
    preScreen.product_ids,
    preScreen.lookbook_ids
  );

  try {
    return await generateAiRecommendVisionResult(apiKey, message, catalog, candidates);
  } catch (visionError) {
    if (visionError instanceof OpenAiRecommendHttpError) {
      console.warn(
        `[ai-recommend] vision request failed (${visionError.httpStatus}), falling back to text:`,
        visionError.errorText
      );
    } else {
      console.warn("[ai-recommend] vision request failed, falling back to text:", visionError);
    }

    try {
      return await generateAiRecommendTextResult(apiKey, message, catalog, candidates);
    } catch (textError) {
      if (textError instanceof OpenAiRecommendHttpError) {
        console.error(
          `[ai-recommend] text fallback failed (${textError.httpStatus}):`,
          textError.errorText
        );
        throwOpenAiRequestError(textError.httpStatus, textError.errorText, "ai-recommend");
      }

      console.error("[ai-recommend] text fallback failed:", textError);
      throw textError;
    }
  }
}
