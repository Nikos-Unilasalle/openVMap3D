import React, { useState } from "react";

function formatValue(v: number): string {
  if (!Number.isFinite(v)) return "0";
  return String(Math.round(v * 1000) / 1000);
}

export type KeyframeStatus = "none" | "exact" | "interpolated";

interface DragNumberInputProps {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  status?: KeyframeStatus;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function DragNumberInput({
  value,
  onChange,
  step = 0.1,
  status = "none",
  onMouseEnter,
  onMouseLeave,
}: DragNumberInputProps) {
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

    const delta = e.deltaY < 0 ? 1 : -1;
    const currentStep = e.shiftKey ? 1 : (step || 0.1);

    const newValue = Math.round((value + delta * currentStep) * 1000) / 1000;
    onChange(newValue);
  };

  let boxStyle: React.CSSProperties = {};
  if (status === "exact") {
    boxStyle = {
      backgroundColor: "#76C560",
      color: "#0f172a",
      fontWeight: "700",
      borderColor: "#5aa746",
    };
  } else if (status === "interpolated") {
    boxStyle = {
      backgroundColor: "#EDA446",
      color: "#0f172a",
      fontWeight: "700",
      borderColor: "#d48b32",
    };
  }

  if (editing) {
    return (
      <input
        className="drag-number drag-number-editing"
        type="text"
        inputMode="decimal"
        autoFocus
        style={boxStyle}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => commitEdit(text)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitEdit(text);
          if (e.key === "Escape") setEditing(false);
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      />
    );
  }

  return (
    <div
      className="drag-number"
      style={boxStyle}
      onClick={() => {
        setText(formatValue(value));
        setEditing(true);
      }}
      onWheel={handleWheel}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      title="Scroll wheel to adjust (Shift + Scroll for ±1)"
    >
      {formatValue(value)}
    </div>
  );
}
