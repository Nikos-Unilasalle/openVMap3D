import { useEffect, useRef, useState } from "react";
import { NodeProps } from "@xyflow/react";
import { NodeGroup } from "../shared/graph/types";

export const GROUP_NODE_TYPE = "groupFrame";
export const GROUP_ID_PREFIX = "group:";

/**
 * A collapsed group folds its members into small white squares parked just
 * OUTSIDE the frame — members with cables coming from the left fold onto the
 * left square, members with cables going right fold onto the right one — so
 * the cables stay short and visible instead of sweeping across the graph.
 */
export const COLLAPSED_PORT_CLASS = "collapsed-port";
export const COLLAPSED_PORT_SIZE = 14;
export const COLLAPSED_PORT_GAP = 10;
const HEADER_HEIGHT = 34;

export type CollapsedPortSide = "left" | "right";

export function collapsedPortPosition(rect: NodeGroup["rect"], side: CollapsedPortSide): { x: number; y: number } {
  // Vertically centered on the collapsed frame's visible 34px header bar.
  const y = rect.y + HEADER_HEIGHT / 2 - COLLAPSED_PORT_SIZE / 2;
  return side === "left"
    ? { x: rect.x - COLLAPSED_PORT_GAP - COLLAPSED_PORT_SIZE, y }
    : { x: rect.x + rect.width + COLLAPSED_PORT_GAP, y };
}

/**
 * Which collapsed port each member folds onto: members with a cable to a
 * node sitting LEFT of the group fold onto the left square, members with
 * cables only to the right fold onto the right one, and members with no
 * external cables default left. Decided against DOCUMENT positions
 * (graph.nodes + graph.connections), so it is stable no matter where the
 * flow pass currently has the folded nodes parked.
 */
export function collapsedPortSides(graph: {
  nodes: { id: string; position: { x: number; y: number } }[];
  connections: { fromNode: string; toNode: string }[];
}, group: NodeGroup): Map<string, CollapsedPortSide> {
  const inside = (p: { x: number; y: number }) =>
    p.x >= group.rect.x && p.y >= group.rect.y && p.x <= group.rect.x + group.rect.width && p.y <= group.rect.y + group.rect.height;
  const posById = new Map(graph.nodes.map((n) => [n.id, n.position]));
  const memberIds = new Set(graph.nodes.filter((n) => inside(n.position)).map((n) => n.id));

  const sides = new Map<string, CollapsedPortSide>();
  for (const conn of graph.connections) {
    for (const [memberId, otherId] of [
      [conn.toNode, conn.fromNode],
      [conn.fromNode, conn.toNode],
    ]) {
      if (!memberIds.has(memberId) || memberIds.has(otherId) || sides.has(memberId)) continue;
      const other = posById.get(otherId);
      if (!other) continue;
      sides.set(memberId, other.x < group.rect.x + group.rect.width / 2 ? "left" : "right");
    }
  }
  for (const id of memberIds) if (!sides.has(id)) sides.set(id, "left");
  return sides;
}

export interface GroupFrameData {
  group: NodeGroup;
  /** Persists a patch through GraphEditor → document graph (one undo step). */
  onUpdate: (groupId: string, patch: Partial<NodeGroup>) => void;
}

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

  // Optimistic color: the picker fires faster than the full updateGroup →
  // App → sync-effect round-trip, so the frame paints the picked color
  // immediately and resyncs from the document when it catches up. Without
  // this a stale props round-trip visibly snapped the swatch back while
  // dragging in the picker.
  const [localColor, setLocalColor] = useState(group.color);
  useEffect(() => setLocalColor(group.color), [group.color]);
  const frameColor = /^#[0-9a-f]{6}$/i.test(localColor) ? localColor : "#6366f1";

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
        borderColor: frameColor,
        background: hexWithAlpha(frameColor, 0.1),
      }}
    >
      <div className="group-frame-header">
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
            title="Double-click to rename"
          >
            {group.title}
          </span>
        )}
        <input
          type="color"
          className="group-frame-color nodrag nopan"
          value={frameColor}
          onChange={(e) => {
            setLocalColor(e.target.value);
            onUpdate(group.id, { color: e.target.value });
          }}
          title="Group color"
        />
        <button
          type="button"
          className="group-frame-collapse nodrag"
          onClick={() => onUpdate(group.id, { collapsed: !group.collapsed })}
          title={group.collapsed ? "Expand group" : "Collapse group"}
        >
          {group.collapsed ? "▸" : "▾"}
        </button>
      </div>
      {!group.collapsed && (
        <div className="group-frame-resize nodrag" onPointerDown={startResize} title="Resize" />
      )}
    </div>
  );
}
