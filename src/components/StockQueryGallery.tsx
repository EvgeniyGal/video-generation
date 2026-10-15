"use client";

import { useEffect, useState } from "react";
import type { StockImageRef } from "@/server/db/schema";

export type StockSlot = {
  index: number;
  label: string;
  selectedImage: StockImageRef | null;
};

export type StockPoolEntry = {
  query: string;
  images: StockImageRef[];
};

function identity(img: StockImageRef) {
  return `${img.provider}:${img.id}`;
}

type Props = {
  pool: StockPoolEntry[];
  slots: StockSlot[];
  activeSlotIndex: number;
  onActiveSlotChange: (index: number) => void;
  onSelectImage: (slotIndex: number, image: StockImageRef) => void;
  onClearSlot?: (slotIndex: number) => void;
  onRefreshQuery?: (query: string, editedQuery: string) => void;
  refreshingQuery?: string | null;
  labels: {
    assignTo: string;
    selected: string;
    clear: string;
    refresh: string;
    refreshing: string;
    noImages: string;
    usedElsewhere: string;
  };
};

export function StockQueryGallery({
  pool,
  slots,
  activeSlotIndex,
  onActiveSlotChange,
  onSelectImage,
  onClearSlot,
  onRefreshQuery,
  refreshingQuery,
  labels,
}: Props) {
  const usedIds = new Set(
    slots
      .filter((s) => s.selectedImage)
      .map((s) => identity(s.selectedImage!)),
  );
  const activeSlot = slots.find((s) => s.index === activeSlotIndex) ?? slots[0];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "stretch",
        }}
      >
        {slots.map((slot) => {
          const active = slot.index === activeSlotIndex;
          return (
            <button
              key={slot.index}
              type="button"
              className={active ? "btn" : "btn btn-secondary"}
              onClick={() => onActiveSlotChange(slot.index)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 6,
                minWidth: 120,
                maxWidth: 160,
                textAlign: "left",
                padding: 8,
              }}
            >
              <span style={{ fontSize: 12, opacity: 0.8 }}>
                {labels.assignTo} {slot.index + 1}
              </span>
              <strong
                style={{
                  fontSize: 13,
                  lineHeight: 1.2,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  width: "100%",
                }}
              >
                {slot.label}
              </strong>
              {slot.selectedImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={slot.selectedImage.previewUrl}
                  alt=""
                  style={{
                    width: "100%",
                    height: 72,
                    objectFit: "cover",
                    borderRadius: 6,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: 72,
                    borderRadius: 6,
                    background: "rgba(127,127,127,0.2)",
                  }}
                />
              )}
              {slot.selectedImage && onClearSlot ? (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onClearSlot(slot.index);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      onClearSlot(slot.index);
                    }
                  }}
                  style={{ fontSize: 12, textDecoration: "underline" }}
                >
                  {labels.clear}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {pool.map((entry) => (
        <QueryRow
          key={entry.query}
          entry={entry}
          activeSlot={activeSlot}
          usedIds={usedIds}
          labels={labels}
          refreshing={refreshingQuery === entry.query}
          onRefreshQuery={onRefreshQuery}
          onSelectImage={onSelectImage}
        />
      ))}
    </div>
  );
}

function QueryRow({
  entry,
  activeSlot,
  usedIds,
  labels,
  refreshing,
  onRefreshQuery,
  onSelectImage,
}: {
  entry: StockPoolEntry;
  activeSlot: StockSlot | undefined;
  usedIds: Set<string>;
  labels: Props["labels"];
  refreshing: boolean;
  onRefreshQuery?: Props["onRefreshQuery"];
  onSelectImage: Props["onSelectImage"];
}) {
  const [editQuery, setEditQuery] = useState(entry.query);
  useEffect(() => {
    setEditQuery(entry.query);
  }, [entry.query]);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
        }}
      >
        <input
          className="input"
          value={editQuery}
          onChange={(e) => setEditQuery(e.target.value)}
          style={{ flex: 1, minWidth: 180 }}
        />
        {onRefreshQuery ? (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={refreshing || !editQuery.trim()}
            onClick={() => onRefreshQuery(entry.query, editQuery.trim())}
          >
            {refreshing ? labels.refreshing : labels.refresh}
          </button>
        ) : null}
      </div>
      {entry.images.length === 0 ? (
        <div className="muted">{labels.noImages}</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
            gap: 8,
          }}
        >
          {entry.images.map((img) => {
            const id = identity(img);
            const selectedHere =
              activeSlot?.selectedImage &&
              identity(activeSlot.selectedImage) === id;
            const used = usedIds.has(id) && !selectedHere;
            return (
              <button
                key={id}
                type="button"
                disabled={!activeSlot || used}
                title={used ? labels.usedElsewhere : labels.selected}
                onClick={() => {
                  if (!activeSlot) return;
                  onSelectImage(activeSlot.index, {
                    ...img,
                    sourceQuery: entry.query,
                  });
                }}
                style={{
                  padding: 0,
                  border: selectedHere
                    ? "2px solid var(--accent, #3b82f6)"
                    : "2px solid transparent",
                  borderRadius: 8,
                  overflow: "hidden",
                  opacity: used ? 0.4 : 1,
                  cursor: used ? "not-allowed" : "pointer",
                  background: "transparent",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.previewUrl}
                  alt=""
                  style={{
                    width: "100%",
                    aspectRatio: "3 / 4",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
