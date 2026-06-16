export type ZozoSizeTableRow = {
  size: string;
  body_width?: string;
  shoulder_width?: string;
  length?: string;
  sleeve_length?: string;
  waist?: string;
  hip?: string;
  rise?: string;
  inseam?: string;
  thigh?: string;
  hem_width?: string;
};

export const SIZE_TABLE_FIELD_ORDER: Array<keyof ZozoSizeTableRow> = [
  "size",
  "body_width",
  "shoulder_width",
  "length",
  "sleeve_length",
  "waist",
  "hip",
  "rise",
  "inseam",
  "thigh",
  "hem_width",
];

export const SIZE_TABLE_FIELD_LABELS: Record<keyof ZozoSizeTableRow, string> = {
  size: "尺寸",
  body_width: "身幅",
  shoulder_width: "肩幅",
  length: "總長",
  sleeve_length: "袖長",
  waist: "腰圍",
  hip: "臀圍",
  rise: "股上",
  inseam: "股下",
  thigh: "大腿圍",
  hem_width: "褲口圍",
};

export const SIZE_TABLE_HEADER_KEYWORDS = [
  "サイズ",
  "身幅",
  "肩幅",
  "総丈",
  "そで丈",
  "着丈",
  "ウエスト",
  "ヒップ",
  "股上",
  "股下",
  "もも周り",
  "すそ周り",
  "袖丈",
] as const;

export const SIZE_TABLE_SIZE_TOKENS = [
  "X-LARGE",
  "XXL",
  "XL",
  "SMALL",
  "MEDIUM",
  "LARGE",
  "MT",
  "XS",
  "FREE",
  "S",
  "M",
  "L",
] as const;

export function isSizeTableSizeToken(token: string): boolean {
  const normalized = token.trim().toUpperCase();

  if (!normalized) {
    return false;
  }

  return SIZE_TABLE_SIZE_TOKENS.some(
    (sizeToken) => normalized === sizeToken || normalized === sizeToken.replace(/-/g, "")
  );
}

export function countSizeTableHeaderKeywords(text: string): number {
  const normalizedText = normalizeSizeTableHeader(text);

  return SIZE_TABLE_HEADER_KEYWORDS.filter((keyword) =>
    normalizedText.includes(normalizeSizeTableHeader(keyword))
  ).length;
}

export function countSizeTableDataRows(text: string): number {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      const firstToken = line.split(/\s+/)[0] || "";
      return isSizeTableSizeToken(firstToken);
    }).length;
}

export function isValidSizeTableBlock(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  return countSizeTableHeaderKeywords(trimmed) >= 2 && countSizeTableDataRows(trimmed) >= 1;
}

function splitSizeTableLine(line: string): string[] {
  return line
    .trim()
    .split(/\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function parseSizeTableFromText(text: string): ZozoSizeTableRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\u00a0/g, " ").trim())
    .filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    const headerLine = lines[index];
    if (countSizeTableHeaderKeywords(headerLine) < 2) {
      continue;
    }

    const headerTokens = splitSizeTableLine(headerLine);
    const headerFields = headerTokens.map((token) => mapSizeTableHeaderToField(token));

    if (!headerFields.includes("size")) {
      continue;
    }

    const mappedHeaderCount = headerFields.filter(Boolean).length;
    if (mappedHeaderCount < 2) {
      continue;
    }

    const rows: ZozoSizeTableRow[] = [];

    for (let rowIndex = index + 1; rowIndex < lines.length; rowIndex += 1) {
      const line = lines[rowIndex];
      const cells = splitSizeTableLine(line);
      const firstToken = cells[0] || "";

      if (!isSizeTableSizeToken(firstToken)) {
        break;
      }

      const row: Partial<ZozoSizeTableRow> = { size: firstToken.toUpperCase() };

      for (let cellIndex = 1; cellIndex < headerFields.length; cellIndex += 1) {
        const field = headerFields[cellIndex];
        const value = cells[cellIndex];

        if (!field || field === "size" || !value) {
          continue;
        }

        row[field] = value;
      }

      rows.push(row as ZozoSizeTableRow);
    }

    if (rows.length > 0) {
      return normalizeSizeTableRows(rows);
    }
  }

  return [];
}

export function normalizeSizeTableHeader(header: string): string {
  return header.replace(/\s+/g, "").trim();
}

export function mapSizeTableHeaderToField(header: string): keyof ZozoSizeTableRow | null {
  const normalized = normalizeSizeTableHeader(header);

  if (!normalized) {
    return null;
  }

  if (normalized.includes("サイズ") || normalized.toLowerCase() === "size") {
    return "size";
  }
  if (normalized.includes("身幅")) {
    return "body_width";
  }
  if (normalized.includes("肩幅")) {
    return "shoulder_width";
  }
  if (normalized.includes("総丈") || normalized.includes("着丈")) {
    return "length";
  }
  if (normalized.includes("そで丈") || normalized.includes("袖丈")) {
    return "sleeve_length";
  }
  if (normalized.includes("ウエスト")) {
    return "waist";
  }
  if (normalized.includes("ヒップ")) {
    return "hip";
  }
  if (normalized.includes("股上")) {
    return "rise";
  }
  if (normalized.includes("股下")) {
    return "inseam";
  }
  if (normalized.includes("もも周り")) {
    return "thigh";
  }
  if (normalized.includes("すそ周り")) {
    return "hem_width";
  }

  return null;
}

export function normalizeSizeTableRows(rows: unknown): ZozoSizeTableRow[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((row) => {
      if (!row || typeof row !== "object") {
        return null;
      }

      const record = row as Record<string, unknown>;
      const size = String(record.size ?? "").trim();
      if (!size) {
        return null;
      }

      const normalized: ZozoSizeTableRow = { size };

      for (const field of SIZE_TABLE_FIELD_ORDER) {
        if (field === "size") {
          continue;
        }

        const value = record[field];
        if (value === undefined || value === null) {
          continue;
        }

        const text = String(value).trim();
        if (text) {
          normalized[field] = text;
        }
      }

      return normalized;
    })
    .filter((row): row is ZozoSizeTableRow => row !== null);
}

export function parseSizeTableJson(value: unknown): ZozoSizeTableRow[] {
  if (Array.isArray(value)) {
    return normalizeSizeTableRows(value);
  }

  if (typeof value === "string" && value.trim()) {
    try {
      return normalizeSizeTableRows(JSON.parse(value));
    } catch {
      return [];
    }
  }

  return [];
}

export function getSizeTableColumns(rows: ZozoSizeTableRow[]): Array<keyof ZozoSizeTableRow> {
  const columns = new Set<keyof ZozoSizeTableRow>(["size"]);

  for (const row of rows) {
    for (const field of SIZE_TABLE_FIELD_ORDER) {
      if (row[field]) {
        columns.add(field);
      }
    }
  }

  return SIZE_TABLE_FIELD_ORDER.filter((field) => columns.has(field));
}
