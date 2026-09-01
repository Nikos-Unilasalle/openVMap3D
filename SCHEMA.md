# Tsuji Architecture & Node Engine Schema (SCHEMA.md)

This document serves as the master specification, architectural contract, and instruction manual for the **Tsuji** node-based 3D video-mapping and dataviz engine.

---

## 1. System Invariants & Core Philosophy

1. **Single 3D Coordinate Space (three.js)**
   - All visual elements exist in a single full 3D three.js scene.
   - 2D shapes, polygons, and text are flat 3D geometry placed at \(z = 0\). Corner-pin warping and projective calibration operate directly in 3D projective space.
2. **Pure & Deterministic Evaluation Loop**
   - The graph evaluates eagerly every frame in topological order derived via Kahn's algorithm (`topoSort`).
   - `evaluate(inputs, params, ctx)` MUST be pure: identical `(inputs, params, ctx.time)` yields identical outputs.
   - **Never** read `Date.now()`, `Math.random()`, or ambient system state during evaluation. Time is derived exclusively from `ctx.time` (seconds) and `ctx.step` (frame index).
   - Cyclic nodes do not crash the engine; they are scheduled at the end of the topological queue and fed previous-frame cached outputs.
3. **Immutability of Sockets & Arguments**
   - Inputs and parameters passed into `evaluate()` may be shared across multiple downstream consumers.
   - Never mutate `inputs` or `params` in place (e.g., `vec.set()`). Always clone before modifying (`vec.clone()`), unless updating an internally owned GPU resource explicitly registered in a node-level cache.
4. **Resilient Failure Modes**
   - Missing or unconnected inputs must gracefully fall back to `params` or safe baseline values.
   - Guard against `NaN`, `Infinity`, and division by zero. A node must never poison downstream nodes.
5. **Separation of Graph Logic and UI**
   - Nodes are 100% UI-agnostic data structures (`NodeDefinition`).
   - Node styling, sockets, bounding boxes, wire paths, and property inspectors are generated dynamically by `GraphEditor.tsx` and `ParamPanel.tsx` based solely on the node's schema.

---

## 2. Core Entities: Node, Edge, Port/Socket

### 2.1 The Socket (Port)
Sockets represent typed channels of communication between nodes. Connections can only be made between matching socket types.

| Type | Underlying Data Class / Representation | Wire Color | Description |
| :--- | :--- | :--- | :--- |
| `value` | `number` | `#f2c14e` (Yellow) | Scalars, floats, integers, and booleans (0/1). |
| `vector` | `THREE.Vector3` | `#38bdf8` (Blue) | 3D vectors / coordinates / scales. |
| `matrix` | `THREE.Matrix4` | `#a855f7` (Purple) | Fused affine transformation (4×4). |
| `color` | `THREE.Color` | `#ec4899` (Pink) | RGBA color representation and blending. |
| `geometry`| `THREE.Object3D` | `#22c55e` (Green) | 3D meshes, groups, primitives, point clouds. |
| `texture` | `THREE.Texture` | `#2dd4bf` (Teal) | Procedural, image, video, or render-target textures. |
| `curve` | `THREE.Curve<THREE.Vector3>` | `#84cc16` (Lime) | 3D paths, splines, and trajectory curves. |
| `material`| `MaterialValue` (Plain object) | `#d97706` (Amber) | Pure PBR material descriptors. |
| `list` | `unknown[]` | `#94a3b8` (Slate) | Generic collections / arrays of data. |
| `text` | `string` | `#f97316` (Orange) | String data for HUD, labels, formatters. |
| `postprocess`| `unknown[]` | `#c084fc` (Violet) | Post-processing shader effect stack. |
| `any` | `unknown` | `#e2e8f0` (White) | Polymorphic/bridge pass-throughs. |

### 2.2 The Edge (Connection)
An Edge connects an output port of a source node to an input port of a destination node:
```typescript
interface Connection {
  id: string;        // e.g. "sourceNodeId.outputSocketId->targetNodeId.inputSocketId"
  fromNode: string;  // UUID of upstream node
  fromSocket: string;// Output socket identifier
  toNode: string;    // UUID of downstream node
  toSocket: string;  // Input socket identifier
}
```

### 2.3 The Node Instance (`NodeInstance`)
Represents an instance of a node placed on the canvas:
```typescript
interface NodeInstance {
  id: string;                         // Unique instance UUID
  type: string;                       // Type identifier matching NodeDefinition.type
  params: Record<string, unknown>;    // User overrides and fallback values
  position: { x: number; y: number }; // Visual canvas coordinates
}
```

### 2.4 The Node Definition (`NodeDefinition`)
The static definition defining behavior, sockets, and evaluation logic:
```typescript
interface NodeDefinition {
  type: string;                       // e.g. "math/map-range", "geometry/box"
  label: string;                      // Display name in UI palette and node header
  category: NodeCategory;             // Palette classification & visual color theme
  inputs: SocketDef[];                // Declared input ports
  outputs: SocketDef[];               // Declared output ports
  defaultParams: Record<string, any>; // Initial fallback parameter values
  paramFields?: ParamFieldDef[];      // UI Inspector field definitions
  dynamicInputs?: (conns: Connection[]) => SocketDef[];
  dynamicOutputs?: (conns: Connection[]) => SocketDef[];
  evaluate: (
    inputs: Record<string, unknown>,
    params: Record<string, unknown>,
    ctx: EvalContext
  ) => Record<string, unknown>;
}
```

---

## 3. Golden Rules for Contributing Code

1. **Strict Placement & File Structure**:
   - Node implementations reside in `src/shared/graph/nodes/<category>.ts`.
   - Node registration is centralized in `src/shared/graph/nodes/index.ts` (`STARTER_NODES` array and `export *`).
   - Unit tests are placed alongside nodes in `src/shared/graph/nodes/nodes.test.ts` or `<feature>.test.ts`.
2. **Deterministic State Handling & GPU Memory Disposal**:
   - If a node allocates GPU buffers, geometries, textures, or shaders (`THREE.Mesh`, `THREE.Texture`), cache them using `createNodeCache<T>(disposeObject3D)` from `src/shared/graph/nodeCaches.ts` keyed by `ctx.nodeId`. Raw unmanaged `new Map` at module level are strictly prohibited.
   - Clean up or mutate owned GPU objects in place; never reallocate meshes 60 times per second.
3. **Param & Input Priority Order**:
   - Connected wire inputs take precedence over static parameters:
     ```typescript
     const val = inputs.myVal !== undefined ? Number(inputs.myVal) : (Number(params.myVal) || 0);
     ```
   - If keyframes exist for an unconnected parameter, the evaluator automatically supplies interpolated keyframe values to `inputs[socketId]`.
4. **Defensive Math & Types**:
   - Always sanitize numeric operations: `Number.isFinite(n) ? n : 0`.
   - Never use `any` in application code; use `unknown` with runtime type narrowing (`instanceof THREE.Vector3`, `typeof x === "number"`).
5. **Verification Requirement**:
   - Every change must pass `npx tsc --noEmit` and `npx vitest run` with zero warnings or errors.

---

## 4. Reusable AI Prompt Templates

### Template 1: Node Generator Prompt
```text
TASK: Implement a new Tsuji node: [NODE_NAME] ([NODE_TYPE]).
CATEGORY: [CATEGORY] (e.g. math, transform, geometry, logic, time, postprocess)

REQUIREMENTS:
1. Sockets:
   - Inputs: [LIST_OF_INPUT_SOCKETS: id, label, type]
   - Outputs: [LIST_OF_OUTPUT_SOCKETS: id, label, type]
2. Fallback parameters (defaultParams): [KEY_VALUE_PAIRS]
3. ParamFields: [UI_FIELD_TYPES: number, vector, select, color, boolean, note, etc.]
4. Evaluation logic:
   - Deterministic, pure function: (inputs, params, ctx) => outputs
   - Handle undefined, null, NaN, and 0-division defensively.
   - If managing a persistent Three.js resource, implement module-level caching keyed by ctx.nodeId.
5. Registration & Verification:
   - Export definition in src/shared/graph/nodes/[FILE].ts
   - Register in src/shared/graph/nodes/index.ts (STARTER_NODES & exports)
   - Add unit tests verifying normal values, fallback defaults, and edge cases.
   - Run `npx tsc --noEmit` and `npx vitest run`.
```

### Template 2: Node Modification & Optimization Prompt
```text
TASK: Refactor or extend node [NODE_TYPE].
OBJECTIVE: [DESCRIBE_GOAL] (e.g. add dynamic inputs, add material descriptors, fix cycle latency).

RULES:
- Preserve backwards compatibility for defaultParams.
- Do not mutate inputs or shared THREE objects.
- Ensure all tests in `src/shared/graph/` pass without regressions.
```
