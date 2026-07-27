import { resolveLookbookId } from "@/lib/lookbook-favorites";

export function formatLookbookList(list: Record<string, unknown>[]) {
  return list.map((lookbook, index) => {
    const id = resolveLookbookId(lookbook, index);

    return {
      id,
      lookbook_id: Number(lookbook.lookbook_id || lookbook.id || id),
      title: String(lookbook.title || "LookPick Lookbook"),
      image: String(lookbook.image || ""),
      tag: String(lookbook.tag || lookbook.style_tag || "AI LOOKBOOK"),
      gender: String(lookbook.gender || "unisex"),
      product_ids: String(lookbook.product_ids || "")
        .split(",")
        .map((value) => Number(value.trim()))
        .filter(Boolean),
      raw_product_ids: String(lookbook.product_ids || ""),
      favoriteCount: Number(lookbook.favorite_count) || 0,
    };
  });
}

export type FormattedLookbook = ReturnType<typeof formatLookbookList>[number];
