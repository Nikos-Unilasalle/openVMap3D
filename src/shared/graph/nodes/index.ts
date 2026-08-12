import { createRegistry } from "../types";
import { DECOMPOSE_MATRIX_NODE, TRANSFORM_NODE } from "./transform";
import { MAP_RANGE_NODE, VALUE_CONSTANT_NODE, VALUE_MATH_NODE } from "./valueMath";
import { OBJECT_BOX_NODE } from "./object";
import { RENDER_NODE } from "./render";
import { TIME_NODE } from "./time";
import { VECTOR_COMPOSE_NODE, VECTOR_DECOMPOSE_NODE } from "./vector";

/** The starter catalogue — grows node by node; BIBLE.md has the full target list. */
export const STARTER_NODES = [
  TIME_NODE,
  VALUE_CONSTANT_NODE,
  VALUE_MATH_NODE,
  MAP_RANGE_NODE,
  VECTOR_COMPOSE_NODE,
  VECTOR_DECOMPOSE_NODE,
  TRANSFORM_NODE,
  DECOMPOSE_MATRIX_NODE,
  OBJECT_BOX_NODE,
  RENDER_NODE,
];

export const DEFAULT_REGISTRY = createRegistry(STARTER_NODES);

export * from "./time";
export * from "./valueMath";
export * from "./vector";
export * from "./transform";
export * from "./object";
export * from "./render";
