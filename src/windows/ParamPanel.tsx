import * as THREE from "three";
import { ParamFieldDef } from "../shared/graph/types";

interface ParamPanelProps {
  label: string;
  fields: ParamFieldDef[];
  params: Record<string, unknown>;
  onChange: (paramId: string, value: unknown) => void;
}

function numberField(field: ParamFieldDef & { kind: "number" }, value: unknown, onChange: (v: unknown) => void) {
  return (
    <input
      type="number"
      step={field.step ?? "any"}
      value={Number(value) || 0}
      onChange={(e) => onChange(e.target.valueAsNumber || 0)}
    />
  );
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

function vectorField(value: unknown, onChange: (v: unknown) => void) {
  const v = value instanceof THREE.Vector3 ? value : new THREE.Vector3();
  const axis = (key: "x" | "y" | "z") => (
    <input
      key={key}
      type="number"
      step="any"
      value={v[key]}
      onChange={(e) => {
        const next = v.clone();
        next[key] = e.target.valueAsNumber || 0;
        onChange(next);
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
export function ParamPanel({ label, fields, params, onChange }: ParamPanelProps) {
  return (
    <div className="param-panel">
      <div className="param-panel-title">{label}</div>
      {fields.length === 0 && <div className="param-panel-empty">No editable parameters.</div>}
      {fields.map((field) => (
        <div className="param-row" key={field.id}>
          <label>{field.label}</label>
          {field.kind === "number" && numberField(field, params[field.id], (v) => onChange(field.id, v))}
          {field.kind === "boolean" && booleanField(params[field.id], (v) => onChange(field.id, v))}
          {field.kind === "select" && selectField(field, params[field.id], (v) => onChange(field.id, v))}
          {field.kind === "color" && colorField(params[field.id], (v) => onChange(field.id, v))}
          {field.kind === "vector" && vectorField(params[field.id], (v) => onChange(field.id, v))}
        </div>
      ))}
    </div>
  );
}
