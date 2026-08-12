import { createRegistry } from "../types";
import { DECOMPOSE_MATRIX_NODE, LOOK_AT_NODE, PARENT_NODE, TRANSFORM_NODE } from "./transform";
import { MAP_RANGE_NODE, VALUE_CONSTANT_NODE, VALUE_MATH_NODE } from "./valueMath";
import { MERGE_NODE } from "./merge";
import { OBJECT_BOX_NODE, OBJECT_PLANE_NODE, OBJECT_SPHERE_NODE } from "./object";
import { RENDER_NODE } from "./render";
import { TIME_NODE } from "./time";
import { VECTOR_COMPOSE_NODE, VECTOR_DECOMPOSE_NODE, VECTOR_MATH_NODE } from "./vector";
import { BOOLEAN_LOGIC_NODE, COMPARE_NODE, GATE_NODE, TOGGLE_NODE, TRIGGER_NODE } from "./logic";
import { ENVELOPE_NODE, OSCILLATOR_NODE } from "./oscillator";
import { COLOR_COMPOSE_NODE, COLOR_CONSTANT_NODE, COLOR_DECOMPOSE_NODE, COLOR_MATH_NODE } from "./color";
import { COLOR_TO_VECTOR_NODE, VALUE_TO_COLOR_NODE, VALUE_TO_VECTOR_NODE, VECTOR_TO_COLOR_NODE } from "./converter";
import { CSV_READER_NODE } from "./csv";

/** The starter catalogue — grows node by node; BIBLE.md has the full target list. */
export const STARTER_NODES = [
  TIME_NODE,
  VALUE_CONSTANT_NODE,
  VALUE_MATH_NODE,
  MAP_RANGE_NODE,
  VECTOR_COMPOSE_NODE,
  VECTOR_DECOMPOSE_NODE,
  VECTOR_MATH_NODE,
  COLOR_CONSTANT_NODE,
  COLOR_COMPOSE_NODE,
  COLOR_DECOMPOSE_NODE,
  COLOR_MATH_NODE,
  VALUE_TO_VECTOR_NODE,
  COLOR_TO_VECTOR_NODE,
  VECTOR_TO_COLOR_NODE,
  VALUE_TO_COLOR_NODE,
  TRANSFORM_NODE,
  DECOMPOSE_MATRIX_NODE,
  PARENT_NODE,
  LOOK_AT_NODE,
  OBJECT_BOX_NODE,
  OBJECT_PLANE_NODE,
  OBJECT_SPHERE_NODE,
  MERGE_NODE,
  RENDER_NODE,
  COMPARE_NODE,
  BOOLEAN_LOGIC_NODE,
  TRIGGER_NODE,
  TOGGLE_NODE,
  GATE_NODE,
  OSCILLATOR_NODE,
  ENVELOPE_NODE,
  CSV_READER_NODE,
];

export const DEFAULT_REGISTRY = createRegistry(STARTER_NODES);

export * from "./time";
export * from "./valueMath";
export * from "./vector";
export * from "./transform";
export * from "./object";
export * from "./render";
export * from "./logic";
export * from "./oscillator";
export * from "./color";
export * from "./converter";
export * from "./merge";
export * from "./csv";
