import { open } from "@tauri-apps/plugin-dialog";
import { readFile, readTextFile } from "@tauri-apps/plugin-fs";
import * as THREE from "three";
import { CATEGORY_COLOR, NodeCategory, UNKNOWN_CATEGORY_COLOR } from "../shared/graph/categories";
import { ParamFieldDef } from "../shared/graph/types";
import { ColorPickerInput } from "./ColorPickerInput";
import { DragNumberInput } from "./DragNumberInput";
import "./param-panel.css";

interface ParamPanelProps {
  nodeId: string;
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

function fileField(nodeId: string, field: ParamFieldDef & { kind: "file" }, value: unknown, onChange: (v: unknown) => void) {
  const fileName = typeof value === "string" && value ? (value.split(/[\\/]/).pop() ?? value) : "Choose file…";
  return (
    <button
      type="button"
      className="param-file-button"
      onClick={async () => {
        const extensions = field.accept?.map((ext) => ext.replace(/^\./, "")) ?? [];
        const path = await open({
          multiple: false,
          filters: extensions.length ? [{ name: "File", extensions }] : undefined,
        });
        if (!path || Array.isArray(path)) return;
        const ext = path.split(".").pop()?.toLowerCase() ?? "";
        const isBinaryImage = ["png", "jpg", "jpeg", "webp", "bmp", "hdr", "exr", "tif", "tiff"].includes(ext);

        if (isBinaryImage) {
          const bytes = await readFile(path);
          field.onLoaded?.(nodeId, path, bytes);
        } else {
          const content = await readTextFile(path);
          field.onLoaded?.(nodeId, path, content);
        }
        onChange(path);
      }}
    >
      {fileName}
    </button>
  );
}

const RAD_TO_DEG = 180 / Math.PI;

/** Stored (radians) -> shown. Identity unless the field asked for degrees. */
function toDisplayUnit(value: number, degrees?: boolean): number {
  return degrees ? value * RAD_TO_DEG : value;
}

/** Shown -> stored (radians). Inverse of toDisplayUnit. */
function toStoredUnit(value: number, degrees?: boolean): number {
  return degrees ? value / RAD_TO_DEG : value;
}

function vectorField(field: ParamFieldDef & { kind: "vector" }, value: unknown, onChange: (v: unknown) => void) {
  const v = value instanceof THREE.Vector3 ? value : new THREE.Vector3();
  const axis = (key: "x" | "y" | "z") => (
    <DragNumberInput
      key={key}
      value={toDisplayUnit(v[key], field.degrees)}
      step={field.step}
      onChange={(next) => {
        const updated = v.clone();
        updated[key] = toStoredUnit(next, field.degrees);
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
export function ParamPanel({ nodeId, label, category, fields, params, onChange }: ParamPanelProps) {
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
              value={toDisplayUnit(Number(params[field.id]) || 0, field.degrees)}
              step={field.step}
              onChange={(v) => onChange(field.id, toStoredUnit(v, field.degrees))}
            />
          )}
          {field.kind === "vector" && vectorField(field, params[field.id], (v) => onChange(field.id, v))}
          {field.kind === "boolean" && booleanField(params[field.id], (v) => onChange(field.id, v))}
          {field.kind === "select" && selectField(field, params[field.id], (v) => onChange(field.id, v))}
          {field.kind === "color" && (
            <ColorPickerInput value={params[field.id]} onChange={(v) => onChange(field.id, v)} />
          )}
          {field.kind === "text" && (
            <input
              type="text"
              className="param-text-input"
              value={String(params[field.id] ?? "")}
              onChange={(e) => onChange(field.id, e.target.value)}
            />
          )}
          {field.kind === "file" && fileField(nodeId, field, params[field.id], (v) => onChange(field.id, v))}

        </div>
      ))}
    </div>
  );
}
