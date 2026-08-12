import { useRef, useState } from "react";

const DRAG_THRESHOLD_PX = 3;
const DEFAULT_SENSITIVITY = 0.01;

function formatValue(v: number): string {
  if (!Number.isFinite(v)) return "0";
  return String(Math.round(v * 1000) / 1000);
}

interface DragNumberInputProps {
  value: number;
  onChange: (value: number) => void;
  /** Value change per pixel of horizontal drag. */
  step?: number;
}

/**
 * Blender-style number field: left-press and drag horizontally to scrub the
 * value; a plain click (no movement past the threshold) drops into text-edit
 * mode for typing instead. Deliberately not `<input type="number">` — this
 * replaces it precisely to get rid of the spinner arrows, which is the point.
 */
export function DragNumberInput({ value, onChange, step = DEFAULT_SENSITIVITY }: DragNumberInputProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const drag = useRef<{ startX: number; startValue: number; moved: boolean } | null>(null);

  const commitEdit = (raw: string) => {
    const parsed = Number.parseFloat(raw);
    onChange(Number.isFinite(parsed) ? parsed : value);
    setEditing(false);
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
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { startX: e.clientX, startValue: value, moved: false };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const dx = e.clientX - drag.current.startX;
        if (Math.abs(dx) > DRAG_THRESHOLD_PX) drag.current.moved = true;
        if (drag.current.moved) onChange(drag.current.startValue + dx * step);
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        if (drag.current && !drag.current.moved) {
          setText(formatValue(value));
          setEditing(true);
        }
        drag.current = null;
      }}
      // Backstop: if the browser ever loses/cancels the pointer without a
      // matching pointerup reaching us (alt-tab mid-drag, capture lost to
      // another element), capture stays "held" per the spec but our own
      // drag ref would otherwise never clear — every future stray
      // pointermove elsewhere on the page would then keep scrubbing this
      // field forever. Both events reset it unconditionally.
      onLostPointerCapture={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      {formatValue(value)}
    </div>
  );
}
