import React, { useEffect, useRef, useState } from "react";

/**
 * A step of 1 or more, with no sub-unit meaning (Count, Subdivisions,
 * Segments...), marks the field as integer — its wheel/display rounds to
 * whole numbers instead of the usual 3 decimals. A sub-1 step (Location,
 * Scale...) stays float. Free typing (click to edit) still accepts any
 * value either way.
 */
function isIntegerField(step: number): boolean {
  return Number.isInteger(step) && step >= 1;
}

function formatValue(v: number, integer: boolean): string {
  if (!Number.isFinite(v)) return "0";
  return integer ? String(Math.round(v)) : String(Math.round(v * 1000) / 1000);
}

export type KeyframeStatus = "none" | "exact" | "interpolated";

interface DragNumberInputProps {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  status?: KeyframeStatus;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  min?: number;
  max?: number;
}

export function DragNumberInput({
  value,
  onChange,
  step = 0.1,
  status = "none",
  onMouseEnter,
  onMouseLeave,
  min,
  max,
}: DragNumberInputProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const integer = isIntegerField(step);

  const clamp = (v: number) => {
    let r = v;
    if (min !== undefined) r = Math.max(min, r);
    if (max !== undefined) r = Math.min(max, r);
    return r;
  };

  // Mirrors `value` for the duration of a drag gesture, so the running total
  // is computed from wherever the pointer actually is now rather than from
  // the (possibly one-render-stale) `value` prop.
  const liveValueRef = useRef(value);
  useEffect(() => {
    liveValueRef.current = value;
  }, [value]);

  // Set only while an actual drag (movement past the threshold) has
  // happened, and read once by onClick right after mouseup — a plain click
  // (mousedown+mouseup with no real movement) should still open text-edit,
  // but the click that ends a drag gesture must not.
  const justDraggedRef = useRef(false);

  const commitEdit = (raw: string) => {
    const parsed = Number.parseFloat(raw);
    const next = Number.isFinite(parsed) ? parsed : value;
    onChange(clamp(integer ? Math.round(next) : next));
    setEditing(false);
  };

  const DRAG_THRESHOLD_PX = 3;
  const PIXELS_PER_STEP = 4;

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();

    const el = e.currentTarget;
    const startValue = liveValueRef.current;
    // Always driven by `movementY` (delta since the previous mousemove,
    // reported on every mousemove regardless of Pointer Lock) rather than
    // `clientY - startY`, so nothing has to change when Pointer Lock kicks
    // in mid-gesture: the accumulator has been counting the same deltas
    // since event #1, lock just stops the OS cursor from ever hitting a
    // screen edge and clamping further deltas to 0 (Blender-style infinite
    // scrub — the cursor vanishes and reappears at the field on release
    // rather than visibly teleporting, since a page can't move the system
    // cursor, only hide it and read relative movement while it's hidden).
    let accumulatedDy = 0;
    let dragged = false;
    let lockRequested = false;

    const handleMouseMove = (ev: MouseEvent) => {
      accumulatedDy += -ev.movementY;
      if (!dragged) {
        if (Math.abs(accumulatedDy) < DRAG_THRESHOLD_PX) return;
        dragged = true;
        // Deferred until a real drag is confirmed — requesting it on every
        // plain click would fire the browser's "press Esc to exit" toast
        // for what's supposed to be an ordinary click-to-edit.
        if (!lockRequested) {
          lockRequested = true;
          // Modern browsers return a Promise here that rejects
          // (NotAllowedError) wherever Pointer Lock isn't grantable — a
          // sandboxed embed, a webview that doesn't count a deferred
          // mousemove-time call as user activation, etc. Already handled
          // gracefully either way (see the comment above — movementY keeps
          // working without a lock, just edge-clamped instead of
          // infinite), so this only needs to not become an unhandled
          // rejection in the console.
          el.requestPointerLock?.()?.catch(() => {});
        }
      }

      const currentStep = ev.shiftKey ? (step || 0.1) * 0.1 : (step || 0.1);
      const raw = startValue + (accumulatedDy / PIXELS_PER_STEP) * currentStep;
      const newValue = clamp(integer ? Math.round(raw) : Math.round(raw * 1000) / 1000);
      liveValueRef.current = newValue;
      onChange(newValue);
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      if (document.pointerLockElement === el) document.exitPointerLock();
      justDraggedRef.current = dragged;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
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
        if (justDraggedRef.current) {
          justDraggedRef.current = false;
          return;
        }
        setText(formatValue(value, integer));
        setEditing(true);
      }}
      onMouseDown={handleMouseDown}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      title="Drag to scrub, click to type (Shift = finer)"
    >
      {formatValue(value, integer)}
    </div>
  );
}
