import { useEffect, useRef, useState } from "react";
import { NodeProps } from "@xyflow/react";
import { NodeGroup } from "../shared/graph/types";

export const GROUP_NODE_TYPE = "group";
export const GROUP_ID_PREFIX = "group:";

export interface GroupFrameData {
  group: NodeGroup;
  /** Persists a patch through GraphEditor → document graph (one undo step). */
  onUpdate: (groupId: string, patch: Partial<NodeGroup>) => void;
}

const HEADER_HEIGHT = 34;
const MIN_WIDTH = 140;
const MIN_HEIGHT = 56;

function hexWithAlpha(hex: string, alpha: number): string {
  const match = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!match) return hex;
  const value = parseInt(match[1], 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * A group frame — pure editor furniture rendered *behind* the nodes it
 * covers (zIndex -1). Dragging the header carries the member nodes with it
 * (GraphEditor's onNodeDrag moves them), the title doubles as a comment,
 * the swatch recolors, the ▸ button folds the members away, and the corner
 * grip resizes. `nodrag`/`nopan` keep the interactive bits from starting a
 * node drag or a canvas pan.
 */
export function GroupFrame(props: NodeProps) {
  const { group, onUpdate } = props.data as unknown as GroupFrameData;

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(group.title);
  const [resizeSize, setResizeSize] = useState<{ width: number; height: number } | null>(null);
  const resizeStart = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  useEffect(() => setTitleDraft(group.title), [group.title]);

  const startResize = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    resizeStart.current = { x: e.clientX, y: e.clientY, width: group.rect.width, height: group.rect.height };
    setResizeSize({ width: group.rect.width, height: group.rect.height });

    const onMove = (ev: PointerEvent) => {
      const start = resizeStart.current;
      if (!start) return;
      setResizeSize({
        width: Math.max(MIN_WIDTH, start.width + (ev.clientX - start.x)),
        height: Math.max(MIN_HEIGHT, start.height + (ev.clientY - start.y)),
      });
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const start = resizeStart.current;
      resizeStart.current = null;
      setResizeSize(null);
      if (!start) return;
      const width = Math.max(MIN_WIDTH, start.width + (ev.clientX - start.x));
      const height = Math.max(MIN_HEIGHT, start.height + (ev.clientY - start.y));
      if (width !== group.rect.width || height !== group.rect.height) {
        onUpdate(group.id, { rect: { ...group.rect, width, height } });
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const width = resizeSize?.width ?? group.rect.width;
  const height = group.collapsed ? HEADER_HEIGHT : (resizeSize?.height ?? group.rect.height);

  const commitTitle = () => {
    setEditingTitle(false);
    const next = titleDraft.trim();
    if (next && next !== group.title) onUpdate(group.id, { title: next });
    else setTitleDraft(group.title);
  };

  return (
    <div
      className={
        "group-frame" +
        (props.selected ? " group-frame-selected" : "") +
        (group.collapsed ? " group-frame-collapsed" : "")
      }
      style={{
        width,
        height,
        borderColor: group.color,
        background: hexWithAlpha(group.color, 0.06),
      }}
    >
      <div className="group-frame-header" style={{ background: hexWithAlpha(group.color, 0.16) }}>
        {editingTitle ? (
          <input
            className="group-frame-title-input nodrag nopan"
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setTitleDraft(group.title);
                setEditingTitle(false);
              }
            }}
          />
        ) : (
          <span
            className="group-frame-title nodrag"
            onDoubleClick={() => setEditingTitle(true)}
            title="Double-cliquez pour renommer"
          >
            {group.title}
          </span>
        )}
        <input
          type="color"
          className="group-frame-color nodrag nopan"
          value={/^#[0-9a-f]{6}$/i.test(group.color) ? group.color : "#6366f1"}
          onChange={(e) => onUpdate(group.id, { color: e.target.value })}
          title="Couleur du groupe"
        />
        <button
          type="button"
          className="group-frame-collapse nodrag"
          onClick={() => onUpdate(group.id, { collapsed: !group.collapsed })}
          title={group.collapsed ? "Déplier le groupe" : "Replier le groupe"}
        >
          {group.collapsed ? "▸" : "▾"}
        </button>
      </div>
      {!group.collapsed && (
        <div className="group-frame-resize nodrag" onPointerDown={startResize} title="Redimensionner" />
      )}
    </div>
  );
}
