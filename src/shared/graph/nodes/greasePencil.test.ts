import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  GREASE_PENCIL_NODE,
  KeyframeDrawing,
  resolveActiveDrawing,
  resolveOnionSkinDrawings,
  strokesToCurves,
} from "./greasePencil";
import {
  calculateSimulatedPressure,
  applyStrokeTaper,
  duplicateDrawing,
  createBlankDrawing,
} from "../../three/greasePencilDrawing";

describe("greasePencil node", () => {
  const sampleFrames: KeyframeDrawing[] = [
    {
      frame: 0,
      strokes: [
        {
          id: "s1",
          points: [
            { x: 0, y: 0, z: 0, pressure: 1.0 },
            { x: 1, y: 1, z: 0, pressure: 0.8 },
            { x: 2, y: 0, z: 0, pressure: 0.5 },
          ],
          color: "#38bdf8",
          width: 4,
        },
      ],
    },
    {
      frame: 10,
      strokes: [
        {
          id: "s2",
          points: [
            { x: 0, y: 2, z: 0, pressure: 1.0 },
            { x: 2, y: 2, z: 0, pressure: 1.0 },
          ],
          color: "#f43f5e",
          width: 4,
        },
      ],
    },
    {
      frame: 20,
      strokes: [
        {
          id: "s3",
          points: [
            { x: 0, y: 4, z: 0, pressure: 1.0 },
            { x: 2, y: 4, z: 0, pressure: 1.0 },
          ],
          color: "#22c55e",
          width: 4,
        },
      ],
    },
  ];

  it("resolves the correct active drawing based on current frame (hold keyframe)", () => {
    expect(resolveActiveDrawing(sampleFrames, 0)?.frame).toBe(0);
    expect(resolveActiveDrawing(sampleFrames, 5)?.frame).toBe(0); // holds frame 0 until next keyframe
    expect(resolveActiveDrawing(sampleFrames, 10)?.frame).toBe(10);
    expect(resolveActiveDrawing(sampleFrames, 15)?.frame).toBe(10);
    expect(resolveActiveDrawing(sampleFrames, 20)?.frame).toBe(20);
    expect(resolveActiveDrawing(sampleFrames, 50)?.frame).toBe(20);
  });

  it("resolves adjacent drawings for onion skinning", () => {
    const skinAt10 = resolveOnionSkinDrawings(sampleFrames, 10, 1, 1);
    expect(skinAt10.prev.length).toBe(1);
    expect(skinAt10.prev[0].frame).toBe(0);
    expect(skinAt10.next.length).toBe(1);
    expect(skinAt10.next[0].frame).toBe(20);

    const skinAt0 = resolveOnionSkinDrawings(sampleFrames, 0, 1, 1);
    expect(skinAt0.prev.length).toBe(0);
    expect(skinAt0.next.length).toBe(1);
    expect(skinAt0.next[0].frame).toBe(10);
  });

  it("converts strokes to THREE.CatmullRomCurve3 curves", () => {
    const curves = strokesToCurves(sampleFrames[0].strokes);
    expect(curves.length).toBe(1);
    expect(curves[0].points.length).toBe(3);
    const midPoint = curves[0].getPoint(0.5);
    expect(midPoint).toBeInstanceOf(THREE.Vector3);
  });

  it("evaluates to a Three.js group geometry and curves output", () => {
    const ctx = { nodeId: "gp_1", currentFrame: 10 } as any;
    const res = GREASE_PENCIL_NODE.evaluate(
      {},
      {
        ...GREASE_PENCIL_NODE.defaultParams,
        frames: sampleFrames,
        location: new THREE.Vector3(1, 2, 3),
      },
      ctx,
    );

    expect(res.geometry).toBeInstanceOf(THREE.Group);
    expect((res.curves as any[]).length).toBe(1);
    expect(res.matrix).toBeInstanceOf(THREE.Matrix4);
  });

  it("simulates pressure based on pointer velocity", () => {
    // Slower move -> higher pressure
    const slowPressure = calculateSimulatedPressure(
      { x: 10, y: 10, time: 0 },
      { x: 12, y: 10, time: 100 },
      0,
    );
    // Faster move -> lower pressure (tapering)
    const fastPressure = calculateSimulatedPressure(
      { x: 10, y: 10, time: 0 },
      { x: 200, y: 100, time: 10 },
      0,
    );
    expect(slowPressure).toBeGreaterThan(fastPressure);
    expect(fastPressure).toBeLessThanOrEqual(0.35);
  });

  it("tapers stroke endpoints naturally", () => {
    const points = [
      { x: 0, y: 0, z: 0, pressure: 1.0 },
      { x: 1, y: 0, z: 0, pressure: 1.0 },
      { x: 2, y: 0, z: 0, pressure: 1.0 },
      { x: 3, y: 0, z: 0, pressure: 1.0 },
      { x: 4, y: 0, z: 0, pressure: 1.0 },
      { x: 5, y: 0, z: 0, pressure: 1.0 },
      { x: 6, y: 0, z: 0, pressure: 1.0 },
      { x: 7, y: 0, z: 0, pressure: 1.0 },
    ];
    const tapered = applyStrokeTaper(points);
    expect(tapered[0].pressure).toBeLessThan(tapered[3].pressure);
    expect(tapered[tapered.length - 1].pressure).toBeLessThan(tapered[3].pressure);

    // Only start tapered
    const startOnly = applyStrokeTaper(points, true, false);
    expect(startOnly[0].pressure).toBeLessThan(startOnly[3].pressure);
    expect(startOnly[startOnly.length - 1].pressure).toBe(1.0);

    // Only end tapered
    const endOnly = applyStrokeTaper(points, false, true);
    expect(endOnly[0].pressure).toBe(1.0);
    expect(endOnly[endOnly.length - 1].pressure).toBeLessThan(endOnly[3].pressure);

    // Neither tapered
    const neither = applyStrokeTaper(points, false, false);
    expect(neither[0].pressure).toBe(1.0);
    expect(neither[neither.length - 1].pressure).toBe(1.0);
  });

  it("duplicates drawing to next frame and creates blank drawing", () => {
    const nextFrames = duplicateDrawing(sampleFrames, 0, 1);
    const frame1 = nextFrames.find((f) => f.frame === 1);
    expect(frame1).toBeDefined();
    expect(frame1?.strokes.length).toBe(1);
    expect(frame1?.strokes[0].id).not.toBe(sampleFrames[0].strokes[0].id);

    const blankFrames = createBlankDrawing(nextFrames, 2);
    const frame2 = blankFrames.find((f) => f.frame === 2);
    expect(frame2).toBeDefined();
    expect(frame2?.strokes.length).toBe(0);
  });

  it("builds solid fill geometry for filled strokes", async () => {
    const { buildStrokesFillGeometry } = await import("./greasePencil");
    const filledStrokes = [
      {
        id: "fill1",
        fill: true,
        fillColor: "#e11d48",
        points: [
          { x: 0, y: 0, z: 0, pressure: 1 },
          { x: 2, y: 0, z: 0, pressure: 1 },
          { x: 2, y: 2, z: 0, pressure: 1 },
          { x: 0, y: 2, z: 0, pressure: 1 },
        ],
      },
    ];
    const geo = buildStrokesFillGeometry(filledStrokes, "#38bdf8");
    expect(geo.getAttribute("position")).toBeDefined();
    expect(geo.getAttribute("position").count).toBe(4);
    expect(geo.getIndex()?.count).toBeGreaterThanOrEqual(6); // at least 2 triangles
  });

  it("builds ribbon geometry with multiple brush presets", async () => {
    const { buildStrokesRibbonGeometry } = await import("./greasePencil");
    const points = [
      { x: 0, y: 0, z: 0, pressure: 1 },
      { x: 1, y: 0, z: 0, pressure: 1 },
      { x: 2, y: 0, z: 0, pressure: 1 },
    ];

    const inkPenGeo = buildStrokesRibbonGeometry(
      [{ id: "1", points, brushType: "ink_pen" }],
      "#38bdf8",
    );
    expect(inkPenGeo.getAttribute("position").count).toBeGreaterThan(0);

    const roughGeo = buildStrokesRibbonGeometry(
      [{ id: "2", points, brushType: "ink_pen_rough" }],
      "#38bdf8",
    );
    expect(roughGeo.getAttribute("position").count).toBeGreaterThan(0);

    const markerGeo = buildStrokesRibbonGeometry(
      [{ id: "3", points, brushType: "marker_bold" }],
      "#38bdf8",
    );
    expect(markerGeo.getAttribute("position").count).toBeGreaterThan(0);

    const airbrushGeo = buildStrokesRibbonGeometry(
      [{ id: "4", points, brushType: "airbrush" }],
      "#38bdf8",
    );
    expect(airbrushGeo.getAttribute("position").count).toBeGreaterThan(0);
  });

  it("soft erases strokes by gradually reducing pressure", async () => {
    const { eraseStrokesSoft } = await import("../../three/greasePencilDrawing");
    const frames = [
      {
        frame: 0,
        strokes: [
          {
            id: "s1",
            points: [
              { x: 0, y: 0, z: 0, pressure: 1.0 },
              { x: 0.1, y: 0, z: 0, pressure: 1.0 },
            ],
          },
        ],
      },
    ];

    const soft = eraseStrokesSoft(frames, 0, new THREE.Vector3(0, 0, 0), 0.5, 0.3);
    expect(soft[0].strokes[0].points[0].pressure).toBeLessThan(1.0);
    expect(soft[0].strokes[0].points[0].pressure).toBeGreaterThan(0.5);
  });

  it("tints strokes towards active color", async () => {
    const { tintStrokesAtPosition } = await import("../../three/greasePencilDrawing");
    const frames = [
      {
        frame: 0,
        strokes: [
          {
            id: "s1",
            color: "#000000",
            points: [{ x: 0, y: 0, z: 0, pressure: 1.0 }],
          },
        ],
      },
    ];

    const tinted = tintStrokesAtPosition(frames, 0, new THREE.Vector3(0, 0, 0), "#ffffff", 0.5, 0.5);
    expect(tinted[0].strokes[0].color).not.toBe("#000000");
  });
});
