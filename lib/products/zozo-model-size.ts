export type ZozoModelSize = {
  model_height_cm: number | null;
  model_weight_kg: number | null;
  model_wear_size: string;
};

const WEAR_SIZE_PATTERN = "(XXL|XL|XS|FREE|SMALL|MEDIUM|LARGE|MT|S|M|L)";

export function normalizeWearSize(size: string): string {
  const normalized = size.trim().toUpperCase();

  switch (normalized) {
    case "SMALL":
      return "S";
    case "MEDIUM":
      return "M";
    case "LARGE":
      return "L";
    case "X-LARGE":
    case "XLARGE":
      return "XL";
    default:
      return normalized;
  }
}

function toPositiveInt(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return null;
  }

  return Math.round(parsed);
}

export function parseZozoModelSizeFromText(text: string): ZozoModelSize {
  const normalized = text.replace(/\u00a0/g, " ").replace(/\s+/g, " ");
  let model_height_cm: number | null = null;
  let model_weight_kg: number | null = null;
  let model_wear_size = "";

  const patternModelLine = normalized.match(
    new RegExp(
      `Model\\s*:?\\s*H?\\s*(\\d{2,3})\\s*cm?[\\s\\S]{0,40}?体重\\s*:?\\s*(\\d{2,3})\\s*kg?[\\s\\S]{0,40}?着用サイズ\\s*:?\\s*${WEAR_SIZE_PATTERN}`,
      "i"
    )
  );

  if (patternModelLine) {
    model_height_cm = toPositiveInt(patternModelLine[1]);
    model_weight_kg = toPositiveInt(patternModelLine[2]);
    model_wear_size = normalizeWearSize(patternModelLine[3]);
  }

  if (!model_height_cm) {
    const heightMatch = normalized.match(/Model\s*:?\s*H?\s*(\d{2,3})\s*cm/i);
    model_height_cm = toPositiveInt(heightMatch?.[1]);
  }

  if (!model_weight_kg) {
    const weightMatch = normalized.match(/体重\s*:?\s*(\d{2,3})\s*kg/i);
    model_weight_kg = toPositiveInt(weightMatch?.[1]);
  }

  if (!model_wear_size) {
    const wearMatch = normalized.match(new RegExp(`着用サイズ\\s*:?\\s*${WEAR_SIZE_PATTERN}\\b`, "i"));
    model_wear_size = wearMatch ? normalizeWearSize(wearMatch[1]) : "";
  }

  const patternBracket = normalized.match(
    new RegExp(`【?\\s*model\\s*】?\\s*(\\d{2,3})\\s*cm\\s*${WEAR_SIZE_PATTERN}\\s*サイズ\\s*着用`, "i")
  );

  if (patternBracket) {
    model_height_cm = model_height_cm ?? toPositiveInt(patternBracket[1]);
    model_wear_size = model_wear_size || normalizeWearSize(patternBracket[2]);
  }

  const patternJapanese = normalized.match(
    new RegExp(
      `モデル\\s*(\\d{2,3})\\s*cm(?:[\\s\\S]{0,30}?(\\d{2,3})\\s*kg)?[\\s\\S]{0,30}?${WEAR_SIZE_PATTERN}\\s*サイズ\\s*着用`,
      "i"
    )
  );

  if (patternJapanese) {
    model_height_cm = model_height_cm ?? toPositiveInt(patternJapanese[1]);
    model_weight_kg = model_weight_kg ?? toPositiveInt(patternJapanese[2]);
    model_wear_size = model_wear_size || normalizeWearSize(patternJapanese[3]);
  }

  return {
    model_height_cm,
    model_weight_kg,
    model_wear_size,
  };
}

export function formatModelSizeDisplay(model: ZozoModelSize | null | undefined): string {
  if (!model) {
    return "";
  }

  const parts: string[] = [];

  if (model.model_height_cm) {
    parts.push(`${model.model_height_cm}cm`);
  }

  if (model.model_weight_kg) {
    parts.push(`${model.model_weight_kg}kg`);
  }

  if (parts.length === 0 && !model.model_wear_size) {
    return "";
  }

  if (model.model_wear_size) {
    if (parts.length > 0) {
      return `Model：${parts.join(" / ")} / 著用 ${model.model_wear_size}`;
    }

    return `Model：著用 ${model.model_wear_size}`;
  }

  return `Model：${parts.join(" / ")}`;
}

export function getProductModelSizeFields(product: {
  modelHeightCm?: number | string | null;
  modelWeightKg?: number | string | null;
  modelWearSize?: string | null;
  model_height_cm?: number | string | null;
  model_weight_kg?: number | string | null;
  model_wear_size?: string | null;
  modelHeight?: number | string | null;
  modelWeight?: number | string | null;
  modelSize?: string | null;
  model_height?: number | string | null;
  model_weight?: number | string | null;
  model_size?: string | null;
} | null | undefined): {
  height: number;
  weight: number;
  wearSize: string;
} {
  const height = Number(product?.modelHeightCm ?? product?.model_height_cm ?? product?.modelHeight ?? product?.model_height);
  const weight = Number(product?.modelWeightKg ?? product?.model_weight_kg ?? product?.modelWeight ?? product?.model_weight);
  const wearSize = String(
    product?.modelWearSize ?? product?.model_wear_size ?? product?.modelSize ?? product?.model_size ?? ""
  ).trim();

  return {
    height: Number.isNaN(height) ? 0 : height,
    weight: Number.isNaN(weight) ? 0 : weight,
    wearSize: wearSize ? normalizeWearSize(wearSize) : "",
  };
}
