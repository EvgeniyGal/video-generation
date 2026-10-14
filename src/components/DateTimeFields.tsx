"use client";

import type { ChangeEvent } from "react";

type Props = {
  value: string;
  onChange: (next: string) => void;
  dateLabel: string;
  timeLabel: string;
  required?: boolean;
  /** Focus target id for the date input (validation jump). */
  id?: string;
};

function split(value: string): { date: string; time: string } {
  const m = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!m) return { date: "", time: "" };
  return { date: m[1], time: m[2] };
}

function openPicker(el: HTMLInputElement) {
  try {
    el.showPicker?.();
  } catch {
    /* unsupported or not allowed outside user gesture */
  }
}

export function DateTimeFields({
  value,
  onChange,
  dateLabel,
  timeLabel,
  required,
  id,
}: Props) {
  const { date, time } = split(value);

  function setPart(part: "date" | "time", next: string) {
    const cur = split(value);
    const d = part === "date" ? next : cur.date;
    const t = part === "time" ? next : cur.time || "00:00";
    if (!d) {
      onChange("");
      return;
    }
    onChange(`${d}T${t}`);
  }

  return (
    <div className="row" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 160 }}>
        <label className="label" htmlFor={id}>
          {dateLabel}
        </label>
        <input
          id={id}
          className="input input-datetime"
          type="date"
          required={required}
          value={date}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setPart("date", e.target.value)
          }
          onClick={(e) => openPicker(e.currentTarget)}
        />
      </div>
      <div style={{ flex: 1, minWidth: 140 }}>
        <label className="label" htmlFor={id ? `${id}-time` : undefined}>
          {timeLabel}
        </label>
        <input
          id={id ? `${id}-time` : undefined}
          className="input input-datetime"
          type="time"
          required={required}
          value={time}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setPart("time", e.target.value)
          }
          onClick={(e) => openPicker(e.currentTarget)}
        />
      </div>
    </div>
  );
}

export function TimeField(props: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  required?: boolean;
}) {
  return (
    <div style={{ flex: 1, minWidth: 120 }}>
      <label className="label">{props.label}</label>
      <input
        className="input input-datetime"
        type="time"
        required={props.required}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        onClick={(e) => openPicker(e.currentTarget)}
      />
    </div>
  );
}
