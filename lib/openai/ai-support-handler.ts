import { classifyAiSupportIntent, type AiSupportIntent } from "@/lib/openai/ai-intent";
import { generateAiRecommendation } from "@/lib/openai/ai-recommend";
import { AiSupportServiceError } from "@/lib/openai/ai-support-error";
import { generateAiSupportReply } from "@/lib/openai/ai-support";
import type {
  AiRecommendResponseLookbook,
  AiRecommendResponseProduct,
} from "@/lib/server/ai-recommend-catalog";

const RECOMMENDATION_FALLBACK_PREFIX =
  "我目前暫時無法讀取推薦商品，但可以先幫你說明尺寸、物流或付款問題。";

export type AiSupportHandlerResult = {
  success: true;
  intent: AiSupportIntent;
  reply: string;
  products: AiRecommendResponseProduct[];
  lookbooks: AiRecommendResponseLookbook[];
};

export type AiSupportHandlerOptions = {
  userId?: string;
  excludeProductIds?: number[];
  excludeLookbookIds?: number[];
};

export async function handleAiSupportMessage(
  message: string,
  options: AiSupportHandlerOptions = {}
): Promise<AiSupportHandlerResult> {
  const intent = await classifyAiSupportIntent(message);

  if (intent === "recommend") {
    try {
      const recommendation = await generateAiRecommendation({
        message,
        userId: options.userId,
        excludeProductIds: options.excludeProductIds,
        excludeLookbookIds: options.excludeLookbookIds,
      });
      return {
        success: true,
        intent: "recommend",
        reply: recommendation.reply,
        products: recommendation.products,
        lookbooks: recommendation.lookbooks,
      };
    } catch (error) {
      if (error instanceof AiSupportServiceError && error.status === 429) {
        throw error;
      }

      const reply = await generateAiSupportReply(message);
      return {
        success: true,
        intent: "support",
        reply: `${RECOMMENDATION_FALLBACK_PREFIX}\n\n${reply}`.trim(),
        products: [],
        lookbooks: [],
      };
    }
  }

  const reply = await generateAiSupportReply(message);
  return {
    success: true,
    intent,
    reply,
    products: [],
    lookbooks: [],
  };
}
