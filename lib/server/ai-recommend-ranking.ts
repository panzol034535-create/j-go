import type {
  AiRecommendCatalogLookbook,
  AiRecommendCatalogProduct,
} from "@/lib/server/ai-recommend-catalog";

export type AiRecommendRankingContext = {
  message: string;
  seed: number;
  refreshRequest: boolean;
  excludeProductIds: Set<number>;
  excludeLookbookIds: Set<number>;
};

export type AiRecommendQuerySignals = {
  budgetMax: number | null;
  gender: "female" | "male" | "unisex" | null;
  keywords: string[];
};

const REFRESH_PATTERNS = [
  "換一批",
  "换一批",
  "還有別的",
  "还有别的",
  "不要剛剛那些",
  "不要刚刚那些",
  "再推薦其他",
  "再推荐其他",
  "其他推薦",
  "其他推荐",
  "別的推薦",
  "别的推荐",
  "換一些",
  "换一些",
  "再換",
  "再换",
  "還有其他的",
  "还有其他的",
];

const STOP_WORDS = new Set([
  "我想",
  "我要",
  "想要",
  "找",
  "有沒有",
  "有没有",
  "請",
  "请",
  "推薦",
  "推荐",
  "穿搭",
  "商品",
  "衣服",
  "lookbook",
  "j-go",
  "jgo",
  "的",
  "了",
  "嗎",
  "吗",
  "呢",
  "啊",
  "一下",
  "可以",
  "幫我",
  "帮我",
  "左右",
  "預算",
  "预算",
  "女生",
  "男生",
  "女性",
  "男性",
  "女裝",
  "男裝",
  "夏天",
  "冬季",
  "春季",
  "秋季",
]);

export function hashRecommendSeed(input: string): number {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function buildRecommendSeed(message: string, userId?: string): number {
  const minuteBucket = Math.floor(Date.now() / 60_000);
  return hashRecommendSeed(`${message.trim()}|${userId?.trim() || ""}|${minuteBucket}`);
}

export function isRefreshRecommendationRequest(message: string): boolean {
  const normalized = message.trim();
  if (!normalized) {
    return false;
  }

  return REFRESH_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function parseRecommendQuerySignals(message: string): AiRecommendQuerySignals {
  const normalized = message.trim();
  const budgetMatch =
    normalized.match(/預算\s*(\d{3,6})/i) ||
    normalized.match(/(\d{3,6})\s*(?:元|左右|以內|以内|以下|底下)/);

  let gender: AiRecommendQuerySignals["gender"] = null;
  if (/女生|女性|女裝|女款|lady|female/i.test(normalized)) {
    gender = "female";
  } else if (/男生|男性|男裝|男款|male/i.test(normalized)) {
    gender = "male";
  } else if (/中性|unisex/i.test(normalized)) {
    gender = "unisex";
  }

  const keywords = normalized
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token))
    .slice(0, 12);

  return {
    budgetMax: budgetMatch ? Number(budgetMatch[1]) : null,
    gender,
    keywords,
  };
}

function seededUnitRandom(seed: number, salt: number): number {
  return hashRecommendSeed(`${seed}:${salt}`) / 0xffffffff;
}

function normalizeGender(value: string): string {
  return String(value || "unisex").trim().toLowerCase();
}

function scoreGenderMatch(itemGender: string, targetGender: AiRecommendQuerySignals["gender"]): number {
  if (!targetGender) {
    return 0;
  }

  const normalized = normalizeGender(itemGender);
  if (normalized === targetGender) {
    return 8;
  }

  if (normalized === "unisex" || targetGender === "unisex") {
    return 3;
  }

  return -4;
}

function scoreBudgetMatch(price: number, budgetMax: number | null): number {
  if (!budgetMax || !Number.isFinite(price) || price <= 0) {
    return 0;
  }

  if (price <= budgetMax) {
    const ratio = price / budgetMax;
    return 6 + (1 - ratio) * 4;
  }

  const overRatio = (price - budgetMax) / budgetMax;
  if (overRatio <= 0.15) {
    return 2;
  }

  return -6;
}

function scoreKeywordMatch(textParts: string[], keywords: string[]): number {
  if (keywords.length === 0) {
    return 0;
  }

  const haystack = textParts.join(" ").toLowerCase();
  let score = 0;

  for (const keyword of keywords) {
    const normalized = keyword.toLowerCase();
    if (normalized && haystack.includes(normalized)) {
      score += 5;
    }
  }

  return score;
}

function scoreNewness(id: number, maxId: number): number {
  if (!Number.isFinite(id) || id <= 0 || maxId <= 0) {
    return 0;
  }

  return (id / maxId) * 6;
}

function scoreFavoriteCount(favoriteCount: number): number {
  return Math.log1p(Math.max(0, favoriteCount)) * 2.5;
}

export function buildAiRecommendRankingContext(options: {
  message: string;
  userId?: string;
  excludeProductIds?: number[];
  excludeLookbookIds?: number[];
}): AiRecommendRankingContext {
  const message = String(options.message ?? "").trim();
  const refreshRequest = isRefreshRecommendationRequest(message);

  return {
    message,
    seed: buildRecommendSeed(message, options.userId),
    refreshRequest,
    excludeProductIds: new Set(
      (options.excludeProductIds ?? [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0)
    ),
    excludeLookbookIds: new Set(
      (options.excludeLookbookIds ?? [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0)
    ),
  };
}

export function rankProductsForRecommend<
  T extends AiRecommendCatalogProduct & { favorite_count?: number },
>(products: T[], context: AiRecommendRankingContext): T[] {
  if (products.length === 0) {
    return products;
  }

  const signals = parseRecommendQuerySignals(context.message);
  const maxId = products.reduce((max, product) => Math.max(max, product.id), 0);
  const noiseScale = context.refreshRequest ? 10 : 4;
  const shouldExclude =
    context.refreshRequest ||
    /不要剛剛|不要刚刚|不要那些|不要這些|不要这些/i.test(context.message);

  const scored = products.map((product) => {
    let score = 0;

    score += scoreKeywordMatch(
      [product.name_zh, product.brand, product.tags, ...product.colors],
      signals.keywords
    );
    score += scoreGenderMatch(product.gender, signals.gender);
    score += scoreBudgetMatch(product.price, signals.budgetMax);
    score += scoreFavoriteCount(Number(product.favorite_count) || 0);
    score += scoreNewness(product.id, maxId);
    score += seededUnitRandom(context.seed, product.id) * noiseScale;

    if (shouldExclude && context.excludeProductIds.has(product.id)) {
      score -= 1000;
    }

    return { product, score };
  });

  scored.sort((left, right) => right.score - left.score || right.product.id - left.product.id);
  return scored.map((entry) => entry.product);
}

export function rankLookbooksForRecommend<
  T extends AiRecommendCatalogLookbook & { favorite_count?: number },
>(lookbooks: T[], context: AiRecommendRankingContext): T[] {
  if (lookbooks.length === 0) {
    return lookbooks;
  }

  const signals = parseRecommendQuerySignals(context.message);
  const maxId = lookbooks.reduce((max, lookbook) => Math.max(max, lookbook.id), 0);
  const noiseScale = context.refreshRequest ? 10 : 4;
  const shouldExclude =
    context.refreshRequest ||
    /不要剛剛|不要刚刚|不要那些|不要這些|不要这些/i.test(context.message);

  const scored = lookbooks.map((lookbook) => {
    let score = 0;

    score += scoreKeywordMatch([lookbook.title, lookbook.tag], signals.keywords);
    score += scoreGenderMatch(lookbook.gender, signals.gender);
    score += scoreFavoriteCount(Number(lookbook.favorite_count) || 0);
    score += scoreNewness(lookbook.id, maxId);
    score += seededUnitRandom(context.seed, lookbook.id + 10_000) * noiseScale;

    if (shouldExclude && context.excludeLookbookIds.has(lookbook.id)) {
      score -= 1000;
    }

    return { lookbook, score };
  });

  scored.sort((left, right) => right.score - left.score || right.lookbook.id - left.lookbook.id);
  return scored.map((entry) => entry.lookbook);
}

export const AI_RECOMMEND_DIVERSITY_PROMPT = `請不要總是推薦同一批熱門商品。
在符合需求的前提下，盡量提供多樣選項。
若使用者要求「換一批 / 其他推薦 / 還有別的嗎」，請推薦不同商品與 Lookbook。`;
