import * as THREE from "three";
import { CATEGORY_COLOR, NodeCategory, UNKNOWN_CATEGORY_COLOR } from "../shared/graph/categories";
import { ParamFieldDef } from "../shared/graph/types";
import { DragNumberInput } from "./DragNumberInput";
import "./param-panel.css";

interface ParamPanelProps {
  label: string;
  category?: NodeCategory;
  fields: ParamFieldDef[];
  params: Record<string, unknown>;
  onChange: (paramId: string, value: unknown) => void;
}

function booleanField(value: unknown, onChange: (v: unknown) => void) {
  return <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked ? 1 : 0)} />;
}

function selectField(field: ParamFieldDef & { kind: "select" }, value: unknown, onChange: (v: unknown) => void) {
  return (
    <select value={String(value)} onChange={(e) => onChange(e.target.value)}>
      {field.options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

function colorField(value: unknown, onChange: (v: unknown) => void) {
  const color = value instanceof THREE.Color ? value : new THREE.Color(0xffffff);
  return (
    <input
      type="color"
      value={`#${color.getHexString()}`}
      onChange={(e) => onChange(new THREE.Color(e.target.value))}
    />
  );
}

function vectorField(field: ParamFieldDef & { kind: "vector" }, value: unknown, onChange: (v: unknown) => void) {
  const v = value instanceof THREE.Vector3 ? value : new THREE.Vector3();
  const axis = (key: "x" | "y" | "z") => (
    <DragNumberInput
      key={key}
      value={v[key]}
      step={field.step}
      onChange={(next) => {
        const updated = v.clone();
        updated[key] = next;
        onChange(updated);
      }}
    />
  );
  return (
    <div className="param-vector">
      {axis("x")}
      {axis("y")}
      {axis("z")}
    </div>
  );
}

/** One row per `paramFields` entry, driven entirely by ParamFieldDef['kind'] — a new node needs no new panel code, only a paramFields entry. */
export function ParamPanel({ label, category, fields, params, onChange }: ParamPanelProps) {
  const categoryColor = category ? CATEGORY_COLOR[category] : UNKNOWN_CATEGORY_COLOR;
  return (
    <div className="param-panel">
      <div className="param-panel-title" style={{ color: categoryColor }}>
        {label}
      </div>
      {fields.length === 0 && <div className="param-panel-empty">No editable parameters.</div>}
      {fields.map((field) => (
        <div className="param-row" key={field.id}>
          <label>{field.label}</label>
          {field.kind === "number" && (
            <DragNumberInput
              value={Number(params[field.id]) || 0}
              step={field.step}
              onChange={(v) => onChange(field.id, v)}
            />
          )}
          {field.kind === "vector" && vectorField(field, params[field.id], (v) => onChange(field.id, v))}
          {field.kind === "boolean" && booleanField(params[field.id], (v) => onChange(field.id, v))}
          {field.kind === "select" && selectField(field, params[field.id], (v) => onChange(field.id, v))}
          {field.kind === "color" && colorField(params[field.id], (v) => onChange(field.id, v))}
        </div>
      ))}
    </div>
  );
}
