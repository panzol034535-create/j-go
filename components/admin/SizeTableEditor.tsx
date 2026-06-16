"use client";

import { useEffect, useState } from "react";
import {
  SIZE_TABLE_FIELD_ORDER,
  type ZozoSizeTableRow,
} from "@/lib/products/size-table-json";

const ADMIN_SIZE_TABLE_FIELD_LABELS: Record<keyof ZozoSizeTableRow, string> = {
  size: "size",
  body_width: "身幅",
  shoulder_width: "肩幅",
  length: "衣長/總丈",
  sleeve_length: "袖長",
  waist: "腰圍",
  hip: "臀圍",
  rise: "股上",
  inseam: "股下",
  thigh: "大腿圍",
  hem_width: "褲腳寬",
};

function createEmptyRow(): ZozoSizeTableRow {
  return { size: "" };
}

type SizeTableEditorProps = {
  productId: number;
  initialRows?: ZozoSizeTableRow[];
  onSaved?: (rows: ZozoSizeTableRow[]) => void;
};

export function SizeTableEditor({ productId, initialRows = [], onSaved }: SizeTableEditorProps) {
  const [rows, setRows] = useState<ZozoSizeTableRow[]>(
    initialRows.length > 0 ? initialRows : [createEmptyRow()]
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setRows(initialRows.length > 0 ? initialRows : [createEmptyRow()]);
    setMessage("");
  }, [productId]);

  const updateCell = (rowIndex: number, field: keyof ZozoSizeTableRow, value: string) => {
    setRows((prev) =>
      prev.map((row, index) => (index === rowIndex ? { ...row, [field]: value } : row))
    );
  };

  const addRow = () => {
    setRows((prev) => [...prev, createEmptyRow()]);
  };

  const removeRow = (rowIndex: number) => {
    setRows((prev) => {
      const next = prev.filter((_, index) => index !== rowIndex);
      return next.length > 0 ? next : [createEmptyRow()];
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage("");

    const payloadRows = rows
      .map((row) => {
        const normalized: ZozoSizeTableRow = { size: row.size.trim() };

        for (const field of SIZE_TABLE_FIELD_ORDER) {
          if (field === "size") {
            continue;
          }

          const value = row[field]?.trim();
          if (value) {
            normalized[field] = value;
          }
        }

        return normalized;
      })
      .filter((row) => row.size);

    try {
      const response = await fetch("/api/products/size-table", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: productId,
          size_table_json: payloadRows,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || "儲存失敗");
        return;
      }

      const savedRows = Array.isArray(data.size_table_json) ? data.size_table_json : payloadRows;
      setRows(savedRows.length > 0 ? savedRows : [createEmptyRow()]);
      setMessage("已儲存尺寸表");
      onSaved?.(savedRows);
    } catch {
      setMessage("網路錯誤，請稍後再試");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-black tracking-widest text-neutral-400">SIZE TABLE</p>
          <h3 className="text-sm font-black">尺寸表</h3>
        </div>
        <button
          type="button"
          onClick={addRow}
          className="rounded-xl border border-neutral-200 px-3 py-1.5 text-xs font-bold text-neutral-700"
        >
          新增一列
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-neutral-200">
        <table className="min-w-[960px] w-full border-collapse text-xs">
          <thead className="bg-neutral-100 text-neutral-600">
            <tr>
              {SIZE_TABLE_FIELD_ORDER.map((field) => (
                <th key={field} className="border-b border-neutral-200 px-2 py-2 text-left font-bold">
                  {ADMIN_SIZE_TABLE_FIELD_LABELS[field]}
                </th>
              ))}
              <th className="border-b border-neutral-200 px-2 py-2 text-left font-bold">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`size-row-${rowIndex}`} className="odd:bg-white even:bg-neutral-50">
                {SIZE_TABLE_FIELD_ORDER.map((field) => (
                  <td key={`${rowIndex}-${field}`} className="border-b border-neutral-100 px-2 py-2">
                    <input
                      type="text"
                      value={row[field] || ""}
                      onChange={(event) => updateCell(rowIndex, field, event.target.value)}
                      className="h-9 w-full min-w-[72px] rounded-lg border border-neutral-200 bg-white px-2 outline-none"
                      placeholder={field === "size" ? "S" : ""}
                    />
                  </td>
                ))}
                <td className="border-b border-neutral-100 px-2 py-2">
                  <button
                    type="button"
                    onClick={() => removeRow(rowIndex)}
                    className="rounded-lg border border-red-200 px-2 py-1 text-[11px] font-bold text-red-600"
                  >
                    刪除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-2xl bg-neutral-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : "儲存尺寸表"}
        </button>
        {message ? <p className="text-xs font-bold text-neutral-500">{message}</p> : null}
      </div>
    </div>
  );
}
