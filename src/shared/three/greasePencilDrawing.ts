import * as THREE from "three";
import { GreaseStroke, KeyframeDrawing, StrokePoint, resolveActiveDrawing } from "../graph/nodes/greasePencil";

export interface DrawingContext {
  camera: THREE.Camera;
  domElement: HTMLElement;
  elevationY?: number;
  mode2D?: boolean;
  objectPosition?: THREE.Vector3;
}

/**
 * Simulates calligraphic pressure based on movement velocity and time delta.
 */
export function calculateSimulatedPressure(
  prevPoint: { x: number; y: number; time: number } | null,
  currentPoint: { x: number; y: number; time: number },
  hardwarePressure = 0,
): number {
  if (hardwarePressure > 0.01 && hardwarePressure < 0.99) {
    return hardwarePressure;
  }

  if (!prevPoint) return 0.65;

  const dx = currentPoint.x - prevPoint.x;
  const dy = currentPoint.y - prevPoint.y;
  const dist = Math.hypot(dx, dy);
  const dt = Math.max(1, currentPoint.time - prevPoint.time); // ms

  const speed = dist / dt; // px / ms. Typical range: 0.05 (slow) to 3.0+ (fast)

  // Dynamic ink speed curve:
  // Slower movement -> thicker stroke (up to 1.0)
  // Faster movement -> thinner, sleek tapering (down to 0.2)
  const factor = Math.exp(-speed * 0.85);
  const pressure = THREE.MathUtils.clamp(0.2 + 0.85 * factor, 0.18, 1.0);
  return pressure;
}

/**
 * Applies natural entry and/or exit tapering to a completed stroke.
 * Supports separate progressive tapering for stroke start and stroke end.
 * Uses a smooth C² transition curve over an adaptive arc window to avoid any bottleneck steps.
 */
export function applyStrokeTaper(
  points: StrokePoint[],
  taperStart = true,
  taperEnd = true,
): StrokePoint[] {
  if (points.length < 2 || (!taperStart && !taperEnd)) return points;

  const result = points.map((p) => ({ ...p }));
  // Adaptive window proportional to stroke length (up to 35% of total points, capped between 4 and 24 points)
  const taperCount = Math.max(3, Math.min(24, Math.floor(result.length * 0.35)));

  // Attack taper (entry)
  if (taperStart) {
    for (let i = 0; i < taperCount; i++) {
      const t = i / taperCount;
      // Hermite smoothstep (f'(0)=0, f'(1)=0) ensures tangential blending with zero kink/step
      const ease = t * t * (3.0 - 2.0 * t);
      const factor = 0.04 + 0.96 * ease;
      result[i].pressure = Math.max(0.04, result[i].pressure * factor);
    }
  }

  // Decay taper (exit)
  if (taperEnd) {
    for (let i = 0; i < taperCount; i++) {
      const idx = result.length - 1 - i;
      const t = i / taperCount;
      const ease = t * t * (3.0 - 2.0 * t);
      const factor = 0.04 + 0.96 * ease;
      result[idx].pressure = Math.max(0.04, result[idx].pressure * factor);
    }
  }

  return result;
}

/**
 * Projects a screen pointer position (clientX, clientY) into 3D world coordinates on the drawing plane.
 */
export function projectScreenToDrawingPlane(
  clientX: number,
  clientY: number,
  ctx: DrawingContext,
): THREE.Vector3 | null {
  const rect = ctx.domElement.getBoundingClientRect();
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), ctx.camera);

  // In 2D mode, project onto horizontal ground plane at object's elevation Y
  if (ctx.mode2D) {
    const planeY = ctx.elevationY ?? (ctx.objectPosition ? ctx.objectPosition.y : 0);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
    const target = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, target)) {
      return target;
    }
    plane.negate();
    if (raycaster.ray.intersectPlane(plane, target)) {
      return target;
    }
  }

  // In 3D mode, project onto plane facing camera passing through the object's origin
  const planeNormal = new THREE.Vector3();
  ctx.camera.getWorldDirection(planeNormal);
  planeNormal.negate(); // Plane normal points towards camera

  const planePoint = ctx.objectPosition ? ctx.objectPosition.clone() : new THREE.Vector3(0, 0, 0);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, planePoint);

  const target = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(plane, target)) {
    return target;
  }
  plane.negate();
  if (raycaster.ray.intersectPlane(plane, target)) {
    return target;
  }

  return null;
}

/**
 * Adds a new stroke to the specified frame drawing.
 */
export function addStrokeToFrames(
  frames: KeyframeDrawing[],
  frameIndex: number,
  stroke: GreaseStroke,
): KeyframeDrawing[] {
  const nextFrames = frames.map((f) => ({ ...f, strokes: [...f.strokes] }));
  const existing = nextFrames.find((f) => f.frame === frameIndex);

  if (existing) {
    existing.strokes.push(stroke);
  } else {
    // If drawing on a frame where a previous keyframe was held, inherit its strokes into the new keyframe
    const sorted = [...frames].sort((a, b) => a.frame - b.frame);
    let held: KeyframeDrawing | null = null;
    for (const f of sorted) {
      if (f.frame <= frameIndex) held = f;
      else break;
    }
    const baseStrokes = held && held.frame < frameIndex ? held.strokes.map((s) => ({ ...s, points: [...s.points] })) : [];
    nextFrames.push({
      frame: frameIndex,
      strokes: [...baseStrokes, stroke],
    });
    nextFrames.sort((a, b) => a.frame - b.frame);
  }

  return nextFrames;
}

/**
 * Duplicates the drawing from one frame to a target frame (classic in-betweening / breakdown workflow).
 */
export function duplicateDrawing(
  frames: KeyframeDrawing[],
  fromFrame: number,
  toFrame: number,
): KeyframeDrawing[] {
  const nextFrames = frames.map((f) => ({ ...f, strokes: [...f.strokes] }));
  const sorted = [...nextFrames].sort((a, b) => a.frame - b.frame);
  let source: KeyframeDrawing | null = null;
  for (const f of sorted) {
    if (f.frame <= fromFrame) {
      source = f;
    } else {
      break;
    }
  }

  if (!source || source.strokes.length === 0) {
    return createBlankDrawing(nextFrames, toFrame);
  }

  const clonedStrokes: GreaseStroke[] = source.strokes.map((s) => ({
    ...s,
    id: `stroke_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    points: s.points.map((p) => ({ ...p })),
  }));

  const existing = nextFrames.find((f) => f.frame === toFrame);
  if (existing) {
    existing.strokes = clonedStrokes;
  } else {
    nextFrames.push({
      frame: toFrame,
      strokes: clonedStrokes,
    });
    nextFrames.sort((a, b) => a.frame - b.frame);
  }

  return nextFrames;
}

/**
 * Creates or resets a blank drawing at the specified frame.
 */
export function createBlankDrawing(
  frames: KeyframeDrawing[],
  toFrame: number,
): KeyframeDrawing[] {
  const nextFrames = frames.map((f) => ({ ...f, strokes: [...f.strokes] }));
  const existing = nextFrames.find((f) => f.frame === toFrame);
  if (existing) {
    existing.strokes = [];
  } else {
    nextFrames.push({
      frame: toFrame,
      strokes: [],
    });
    nextFrames.sort((a, b) => a.frame - b.frame);
  }
  return nextFrames;
}

/**
 * Clears the drawing at the specified frame.
 */
export function clearDrawingAtFrame(
  frames: KeyframeDrawing[],
  frameIndex: number,
): KeyframeDrawing[] {
  return frames.filter((f) => f.frame !== frameIndex);
}

/**
 * Erases strokes near the given 3D position within a threshold radius.
 */
function distToSegmentSq(
  px: number,
  py: number,
  pz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;
  const abLenSq = abx * abx + aby * aby + abz * abz;
  if (abLenSq < 1e-8) {
    return apx * apx + apy * apy + apz * apz;
  }
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / abLenSq));
  const cx = ax + t * abx;
  const cy = ay + t * aby;
  const cz = az + t * abz;
  const dx = px - cx;
  const dy = py - cy;
  const dz = pz - cz;
  return dx * dx + dy * dy + dz * dz;
}

export function eraseStrokesAtPosition(
  frames: KeyframeDrawing[],
  frameIndex: number,
  worldPos: THREE.Vector3,
  radius = 0.75,
): KeyframeDrawing[] {
  const targetDrawing = resolveActiveDrawing(frames, frameIndex);
  if (!targetDrawing) return frames;
  const activeFrame = targetDrawing.frame;
  const radSq = radius * radius;

  const nextStrokes = targetDrawing.strokes.filter((stroke) => {
    const pts = stroke.points;
    if (!pts || pts.length === 0) return false;
    // Check points
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const dx = p.x - worldPos.x;
      const dy = p.y - worldPos.y;
      const dz = p.z - worldPos.z;
      if (dx * dx + dy * dy + dz * dz <= radSq) {
        return false;
      }
      // Check segment
      if (i < pts.length - 1) {
        const nextP = pts[i + 1];
        if (distToSegmentSq(worldPos.x, worldPos.y, worldPos.z, p.x, p.y, p.z, nextP.x, nextP.y, nextP.z) <= radSq) {
          return false;
        }
      }
    }
    return true;
  });

  return frames.map((f) => (f.frame === activeFrame ? { ...f, strokes: nextStrokes } : f));
}

/**
 * Gently erases/thins strokes near the given position (Soft Eraser).
 * Reduces point pressure/thickness smoothly with radial falloff.
 */
export function eraseStrokesSoft(
  frames: KeyframeDrawing[],
  frameIndex: number,
  worldPos: THREE.Vector3,
  radius = 0.85,
  strength = 0.3,
): KeyframeDrawing[] {
  const targetDrawing = resolveActiveDrawing(frames, frameIndex);
  if (!targetDrawing) return frames;
  const activeFrame = targetDrawing.frame;

  const radSq = radius * radius;
  const nextStrokes: GreaseStroke[] = [];

  for (const stroke of targetDrawing.strokes) {
    let anyHit = false;
    const newPoints = stroke.points.map((p) => {
      const dx = p.x - worldPos.x;
      const dy = p.y - worldPos.y;
      const dz = p.z - worldPos.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq <= radSq) {
        anyHit = true;
        const falloff = 1.0 - Math.sqrt(distSq) / radius;
        const nextPr = Math.max(0.01, (p.pressure ?? 0.6) - strength * falloff);
        return { ...p, pressure: nextPr };
      }
      return p;
    });

    if (anyHit) {
      // If all points have diminished to near zero, remove the stroke
      const visiblePoints = newPoints.filter((p) => p.pressure > 0.03);
      if (visiblePoints.length >= 2) {
        nextStrokes.push({ ...stroke, points: newPoints });
      }
    } else {
      nextStrokes.push(stroke);
    }
  }

  return frames.map((f) => (f.frame === activeFrame ? { ...f, strokes: nextStrokes } : f));
}

/**
 * Tints strokes near the given position towards the target color (Tint brush).
 */
export function tintStrokesAtPosition(
  frames: KeyframeDrawing[],
  frameIndex: number,
  worldPos: THREE.Vector3,
  targetColorHex: string,
  radius = 0.85,
  strength = 0.4,
): KeyframeDrawing[] {
  const targetDrawing = resolveActiveDrawing(frames, frameIndex);
  if (!targetDrawing) return frames;
  const activeFrame = targetDrawing.frame;

  const radSq = radius * radius;
  const targetCol = new THREE.Color(targetColorHex);
  const curCol = new THREE.Color();

  const nextStrokes = targetDrawing.strokes.map((stroke) => {
    let hit = false;
    const pts = stroke.points;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const dx = p.x - worldPos.x;
      const dy = p.y - worldPos.y;
      const dz = p.z - worldPos.z;
      if (dx * dx + dy * dy + dz * dz <= radSq) {
        hit = true;
        break;
      }
      if (i < pts.length - 1) {
        const nextP = pts[i + 1];
        if (distToSegmentSq(worldPos.x, worldPos.y, worldPos.z, p.x, p.y, p.z, nextP.x, nextP.y, nextP.z) <= radSq) {
          hit = true;
          break;
        }
      }
    }
    if (hit) {
      curCol.set(stroke.color || "#38bdf8");
      curCol.lerp(targetCol, strength);
      return { ...stroke, color: `#${curCol.getHexString()}` };
    }
    return stroke;
  });

  return frames.map((f) => (f.frame === activeFrame ? { ...f, strokes: nextStrokes } : f));
}
