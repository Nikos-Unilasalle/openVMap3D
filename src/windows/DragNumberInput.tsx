import React, { useState } from "react";

function formatValue(v: number): string {
  if (!Number.isFinite(v)) return "0";
  return String(Math.round(v * 1000) / 1000);
}

interface DragNumberInputProps {
  value: number;
  onChange: (value: number) => void;
  /** Value change per tick of scroll wheel. Defaults to 0.1. */
  step?: number;
}

/**
 * Numeric parameter input:
 * - Simple mouse wheel scroll up/down to adjust value by `step` (default 0.1).
 * - Hold Shift while scrolling to increment/decrement by 1.
 * - Single click drops into direct text-edit mode.
 */
export function DragNumberInput({ value, onChange, step = 0.1 }: DragNumberInputProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");

  const commitEdit = (raw: string) => {
    const parsed = Number.parseFloat(raw);
    onChange(Number.isFinite(parsed) ? parsed : value);
    setEditing(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    // Scroll up (deltaY < 0) increases value; scroll down (deltaY > 0) decreases
    const delta = e.deltaY < 0 ? 1 : -1;

    // Holding Shift forces integer step of 1, normal scroll uses step (default 0.1)
    const currentStep = e.shiftKey ? 1 : (step || 0.1);

    const newValue = Math.round((value + delta * currentStep) * 1000) / 1000;
    onChange(newValue);
  };

  if (editing) {
    return (
      <input
        className="drag-number drag-number-editing"
        type="text"
        inputMode="decimal"
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => commitEdit(text)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitEdit(text);
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <div
      className="drag-number"
      onClick={() => {
        setText(formatValue(value));
        setEditing(true);
      }}
      onWheel={handleWheel}
      title="Scroll wheel to adjust (Shift + Scroll for ±1)"
    >
      {formatValue(value)}
    </div>
  );
}
