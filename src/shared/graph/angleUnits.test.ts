import { describe, expect, it } from "vitest";
import { STARTER_NODES } from "./nodes";
import { NodeDefinition, ParamFieldDef } from "./types";

/**
 * The unit convention for angle sockets, pinned so it can't drift.
 *
 * A param marked `degrees: true` is stored in radians and only converted for
 * the panel (ParamPanel's toDisplayUnit/toStoredUnit). That split is invisible
 * until the same param is *also* a socket: a Value node carries a plain
 * unitless number, so a raw read makes "36" typed by hand and "36" arriving on
 * a wire two different angles.
 *
 * The rule:
 *
 *  - `value`-typed angle sockets read the wire as DEGREES, matching the label
 *    beside them (see degreesInput in nodes/object.ts). They are driven by
 *    Value/Math/Oscillator nodes, which have no unit of their own.
 *
 *  - `vector` rotation sockets stay RADIANS. Those are fed by other nodes'
 *    rotation *outputs* (Rolling, Decompose Matrix, Wiggle), so the unit has
 *    to survive a round trip through a wire rather than match a text field.
 *    Reading them as degrees would break every rotation chain in the graph.
 *
 * This test fails when a new degrees-marked socket appears, so whoever adds it
 * has to place it in one bucket or the other rather than inheriting whichever
 * behaviour the raw read happens to give.
 */

/** value-typed angle sockets — must go through degreesInput. */
const DEGREE_SCALAR_SOCKETS = [
  "hub/image.rotation",
  "hub/text.rotation",
  "lighting/environment.backgroundRotation",
  "object/disc.arcAngle",
  "object/disc.startAngle",
  "transform/orbit.phase",
].sort();

/** vector rotation sockets — stay radians, they carry rotations between nodes. */
const RADIAN_VECTOR_SOCKETS = [
  "animation/wiggle.rotationAmplitude",
  "calibration/camera.rotation",
  "modifier/clip-box.rotation",
  "modifier/extrude.rotation",
  "structure/geometry-transform.rotation",
  "transform.rotation",
  "transform/matrix-transform.rotation",
  "transform/pivot.rotation",
].sort();

function degreeFieldIds(def: NodeDefinition): Set<string> {
  const fields: ParamFieldDef[] = [...(def.paramFields ?? [])];
  try {
    const dynamic = def.dynamicParamFields?.({
      id: "probe",
      type: def.type,
      position: { x: 0, y: 0 },
      params: def.defaultParams ?? {},
    } as never);
    if (dynamic) fields.push(...dynamic);
  } catch {
    // A dynamic field builder that needs a real instance contributes nothing
    // here; its static counterpart is already covered.
  }
  return new Set(fields.filter((f) => (f as { degrees?: boolean }).degrees).map((f) => f.id));
}

describe("angle socket units", () => {
  it("every degrees-marked socket is classified as scalar-degrees or vector-radians", () => {
    const scalars: string[] = [];
    const vectors: string[] = [];
    for (const def of STARTER_NODES) {
      const degreeIds = degreeFieldIds(def);
      if (degreeIds.size === 0) continue;
      for (const input of def.inputs ?? []) {
        if (!degreeIds.has(input.id)) continue;
        const key = `${def.type}.${input.id}`;
        if (input.type === "value") scalars.push(key);
        else vectors.push(key);
      }
    }
    expect([...new Set(scalars)].sort()).toEqual(DEGREE_SCALAR_SOCKETS);
    expect([...new Set(vectors)].sort()).toEqual(RADIAN_VECTOR_SOCKETS);
  });
});
