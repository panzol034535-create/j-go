export function formatShippedAt(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const date =
    typeof value === "number"
      ? new Date(value)
      : typeof value === "string" && /^\d+$/.test(value.trim())
        ? new Date(Number(value))
        : new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("zh-TW");
}

export function toDatetimeLocalValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const date =
    typeof value === "number"
      ? new Date(value)
      : typeof value === "string" && /^\d+$/.test(value.trim())
        ? new Date(Number(value))
        : new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (part: number) => String(part).padStart(2, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function toIsoDateTime(value: string | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}
