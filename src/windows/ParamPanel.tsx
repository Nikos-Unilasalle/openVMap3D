import { useState } from "react";
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

function toDisplayUnit(value: number, degrees?: boolean): number {
  return degrees ? value * RAD_TO_DEG : value;
}

function toStoredUnit(value: number, degrees?: boolean): number {
  return degrees ? value / RAD_TO_DEG : value;
}

export function parseVector3(value: unknown): THREE.Vector3 {
  if (value instanceof THREE.Vector3) return value;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const x = Number(obj.x);
    const y = Number(obj.y);
    const z = Number(obj.z);
    return new THREE.Vector3(
      Number.isFinite(x) ? x : 0,
      Number.isFinite(y) ? y : 0,
      Number.isFinite(z) ? z : 0
    );
  }
  if (Array.isArray(value)) {
    const x = Number(value[0]);
    const y = Number(value[1]);
    const z = Number(value[2]);
    return new THREE.Vector3(
      Number.isFinite(x) ? x : 0,
      Number.isFinite(y) ? y : 0,
      Number.isFinite(z) ? z : 0
    );
  }
  return new THREE.Vector3(0, 0, 0);
}

function vectorField(field: ParamFieldDef & { kind: "vector" }, value: unknown, onChange: (v: unknown) => void) {
  const v = parseVector3(value);
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

/** Assign a logical group name for parameter fields if none is explicitly specified */
function getGroupName(field: ParamFieldDef): string {
  if (field.group) return field.group;

  const id = field.id.toLowerCase();
  if (["location", "rotation", "scale", "position", "transform"].includes(id)) {
    return "Transform";
  }
  if (
    [
      "color",
      "emissive",
      "emissiveintensity",
      "shadeless",
      "roughness",
      "metalness",
      "wireframe",
      "wireframelinewidth",
      "opacity",
    ].includes(id)
  ) {
    return "Material";
  }
  if (id.includes("uv") || id.includes("texture") || id.includes("normal") || field.kind === "file") {
    return "Texture & Files";
  }
  if (["fov", "near", "far"].includes(id)) {
    return "Lens & Optics";
  }
  if (["intensity", "distance", "decay", "angle", "penumbra", "castshadow"].includes(id)) {
    return "Light Settings";
  }
  return "General";
}

export function ParamPanel({ nodeId, label, category, fields, params, onChange }: ParamPanelProps) {
  const categoryColor = category ? CATEGORY_COLOR[category] : UNKNOWN_CATEGORY_COLOR;

  // Track which collapsible groups are open. Default = OPEN for Transform, closed for others.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ Transform: true });

  const toggleGroup = (groupName: string) => {
    setOpenGroups((prev) => ({ ...prev, [groupName]: !prev[groupName] }));
  };

  // Group fields into ordered buckets
  const groupsMap: Map<string, ParamFieldDef[]> = new Map();
  for (const field of fields) {
    const groupName = getGroupName(field);
    if (!groupsMap.has(groupName)) {
      groupsMap.set(groupName, []);
    }
    groupsMap.get(groupName)!.push(field);
  }

  const groups = Array.from(groupsMap.entries());

  return (
    <div className="param-panel">
      <div className="param-panel-title" style={{ color: categoryColor }}>
        {label}
      </div>

      {fields.length === 0 && <div className="param-panel-empty">No editable parameters.</div>}

      {groups.map(([groupName, groupFields]) => {
        const isOpen =
          openGroups[groupName] !== undefined
            ? openGroups[groupName]
            : groupName.includes("Transform") || groupName === "General";

        return (
          <div className="param-group" key={groupName}>
            <button
              type="button"
              className="param-group-header"
              onClick={() => toggleGroup(groupName)}
              title={isOpen ? "Fermer la catégorie" : "Ouvrir la catégorie"}
            >
              <span className="param-group-arrow">{isOpen ? "▼" : "▶"}</span>
              <span className="param-group-title">{groupName}</span>
              <span className="param-group-count">({groupFields.length})</span>
            </button>

            {isOpen && (
              <div className="param-group-body">
                {groupFields.map((field) => (
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
            )}
          </div>
        );
      })}
    </div>
  );
}
