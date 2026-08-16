import { EasingType, KeyframeStore } from "../shared/graph/types";

export interface SelectedKeyframeKey {
  nodeId: string;
  paramKey: string;
  frame: number;
}

export function makeKeyframeId(nodeId: string, paramKey: string, frame: number): string {
  return `${nodeId}::${paramKey}::${frame}`;
}

export function parseKeyframeId(id: string): SelectedKeyframeKey | null {
  const parts = id.split("::");
  if (parts.length !== 3) return null;
  const frame = parseInt(parts[2], 10);
  if (Number.isNaN(frame)) return null;
  return { nodeId: parts[0], paramKey: parts[1], frame };
}

export interface KeyframeClipboardItem {
  nodeId: string;
  paramKey: string;
  relativeFrame: number; // offset from baseFrame
  value: any;
  easeIn?: EasingType;
  easeOut?: EasingType;
}

export interface KeyframeClipboard {
  baseFrame: number;
  items: KeyframeClipboardItem[];
}

/** Global in-memory clipboard for keyframes */
let clipboardBuffer: KeyframeClipboard | null = null;

export function copyKeyframesToClipboard(
  selectedKeys: SelectedKeyframeKey[],
  keyframes: KeyframeStore | undefined,
): boolean {
  if (!keyframes || selectedKeys.length === 0) return false;

  let minFrame = Infinity;
  for (const k of selectedKeys) {
    if (k.frame < minFrame) minFrame = k.frame;
  }
  if (!Number.isFinite(minFrame)) return false;

  const items: KeyframeClipboardItem[] = [];

  for (const { nodeId, paramKey, frame } of selectedKeys) {
    const list = keyframes[nodeId]?.[paramKey];
    if (!list) continue;
    const kf = list.find((item) => item.frame === frame);
    if (!kf) continue;

    items.push({
      nodeId,
      paramKey,
      relativeFrame: kf.frame - minFrame,
      value: JSON.parse(JSON.stringify(kf.value)),
      easeIn: kf.easeIn,
      easeOut: kf.easeOut,
    });
  }

  if (items.length === 0) return false;

  clipboardBuffer = {
    baseFrame: minFrame,
    items,
  };
  return true;
}

export function getClipboardKeyframes(): KeyframeClipboard | null {
  return clipboardBuffer;
}

export function formatTimecode(frame: number, fps: number = 30): string {
  const totalSeconds = Math.max(0, frame / fps);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const frames = Math.floor(frame % fps);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(minutes)}:${pad(seconds)}:${pad(frames)}`;
}

export function formatParamValue(val: unknown): string {
  if (val === undefined || val === null) return "-";
  if (typeof val === "number") {
    return Number.isInteger(val) ? val.toString() : val.toFixed(2);
  }
  if (typeof val === "boolean") {
    return val ? "true" : "false";
  }
  if (typeof val === "string") {
    if (val.length > 12) return val.slice(0, 9) + "...";
    return val;
  }
  if (typeof val === "object") {
    if ("x" in (val as any) && "y" in (val as any) && "z" in (val as any)) {
      const v = val as { x: number; y: number; z: number };
      const fmt = (n: number) => (Number.isFinite(n) ? (Number.isInteger(n) ? `${n}` : n.toFixed(1)) : "0");
      return `(${fmt(v.x)}, ${fmt(v.y)}, ${fmt(v.z)})`;
    }
    if ("r" in (val as any) && "g" in (val as any) && "b" in (val as any)) {
      return "Color";
    }
    return "{...}";
  }
  return String(val);
}
