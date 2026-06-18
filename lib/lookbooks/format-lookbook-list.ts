import { resolveLookbookId } from "@/lib/lookbook-favorites";

export function formatLookbookList(list: Record<string, unknown>[]) {
  return list.map((lookbook, index) => {
    const id = resolveLookbookId(lookbook, index);

    return {
      id,
      lookbook_id: lookbook.lookbook_id || lookbook.id || id,
      title: lookbook.title || "J-GO Lookbook",
      image: lookbook.image,
      tag: lookbook.tag || lookbook.style_tag || "AI LOOKBOOK",
      gender: lookbook.gender || "unisex",
      product_ids: String(lookbook.product_ids || "")
        .split(",")
        .map((value) => Number(value.trim()))
        .filter(Boolean),
      raw_product_ids: lookbook.product_ids || "",
      favoriteCount: Number(lookbook.favorite_count) || 0,
    };
  });
}
