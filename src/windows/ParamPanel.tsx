import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile, readTextFile } from "@tauri-apps/plugin-fs";
import * as THREE from "three";
import { CATEGORY_COLOR, NodeCategory, UNKNOWN_CATEGORY_COLOR } from "../shared/graph/categories";
import { ParamFieldDef } from "../shared/graph/types";
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

function parseColorToHex(v: unknown): string {
  if (!v) return "#ffffff";
  try {
    if (v instanceof THREE.Color) {
      return `#${v.getHexString()}`;
    }
    if (typeof v === "object" && v !== null && "r" in v && "g" in v && "b" in v) {
      const { r, g, b } = v as { r: number; g: number; b: number };
      return `#${new THREE.Color(r, g, b).getHexString()}`;
    }
    if (typeof v === "string") {
      const clean = v.trim();
      const hex = clean.startsWith("#") ? clean : `#${clean}`;
      return `#${new THREE.Color(hex).getHexString()}`;
    }
    if (typeof v === "number") {
      return `#${new THREE.Color(v).getHexString()}`;
    }
  } catch {
    return "#ffffff";
  }
  return "#ffffff";
}

function ColorPickerInput({ value, onChange }: { value: unknown; onChange: (v: THREE.Color) => void }) {
  const swatchRef = useRef<HTMLInputElement>(null);
  const colorHex = parseColorToHex(value);

  const [textValue, setTextValue] = useState(colorHex);

  useEffect(() => {
    setTextValue(colorHex);
  }, [colorHex]);

  const handleHexChange = (newHex: string) => {
    setTextValue(newHex);
    try {
      const cleanHex = newHex.startsWith("#") ? newHex : `#${newHex}`;
      const c = new THREE.Color(cleanHex);
      onChange(c);
    } catch {
      // Invalid hex typing in progress
    }
  };

  const openPicker = () => {
    if (swatchRef.current) {
      if ("showPicker" in swatchRef.current && typeof swatchRef.current.showPicker === "function") {
        try {
          swatchRef.current.showPicker();
          return;
        } catch {
          // Fallback to click
        }
      }
      swatchRef.current.click();
    }
  };

  const presets = ["#ffffff", "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#a855f7", "#000000"];

  return (
    <div className="param-color-picker-container" onMouseDown={(e) => e.stopPropagation()}>
      <div className="param-color-main">
        <div
          className="param-color-swatch-box"
          style={{ backgroundColor: colorHex }}
          onClick={openPicker}
          title="Click to pick color"
        >
          <input
            ref={swatchRef}
            type="color"
            className="param-color-swatch-hidden"
            value={colorHex}
            onInput={(e) => handleHexChange((e.target as HTMLInputElement).value)}
            onChange={(e) => handleHexChange((e.target as HTMLInputElement).value)}
          />
        </div>
        <input
          type="text"
          className="param-color-hex-input"
          value={textValue}
          onChange={(e) => handleHexChange(e.target.value)}
          onBlur={() => setTextValue(colorHex)}
        />
      </div>
      <div className="param-color-presets">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            className="param-color-preset-btn"
            style={{ backgroundColor: preset }}
            onClick={() => handleHexChange(preset)}
            title={preset}
          />
        ))}
      </div>
    </div>
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
        const isBinaryImage = ["png", "jpg", "jpeg", "webp", "bmp"].includes(ext);

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
              value={Number(params[field.id]) || 0}
              step={field.step}
              onChange={(v) => onChange(field.id, v)}
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
