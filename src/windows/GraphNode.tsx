import { useEffect, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import * as THREE from "three";
import { CATEGORY_COLOR, NodeCategory, UNKNOWN_CATEGORY_COLOR } from "../shared/graph/categories";
import { getInspectorValue, subscribeInspector } from "../shared/graph/inspectorStore";
import { SOCKET_COLOR, SocketDef } from "../shared/graph/sockets";

export interface GraphNodeData {
  nodeId?: string;
  nodeType?: string;
  label: string;
  category?: NodeCategory;
  inputs: SocketDef[];
  outputs: SocketDef[];
  [key: string]: unknown;
}

function useInspectorValue(nodeId?: string) {
  const [val, setVal] = useState<unknown>(() => (nodeId ? getInspectorValue(nodeId) : undefined));

  useEffect(() => {
    if (!nodeId) return;
    setVal(getInspectorValue(nodeId));
    return subscribeInspector(() => {
      setVal(getInspectorValue(nodeId));
    });
  }, [nodeId]);

  return val;
}

function renderValuePreview(val: unknown) {
  if (val === undefined || val === null) {
    return <span style={{ color: "#6b7280" }}>null</span>;
  }

  if (typeof val === "number") {
    return Number.isInteger(val) ? val.toString() : val.toFixed(3);
  }

  if (typeof val === "boolean") {
    return val ? "true" : "false";
  }

  if (typeof val === "string") {
    return `"${val}"`;
  }

  if (val instanceof THREE.Vector3) {
    return `Vec3(${val.x.toFixed(2)}, ${val.y.toFixed(2)}, ${val.z.toFixed(2)})`;
  }

  if (val instanceof THREE.Color) {
    const hex = `#${val.getHexString()}`;
    return (
      <span>
        <span className="inspector-color-swatch" style={{ background: hex }} />
        {hex}
      </span>
    );
  }

  if (val instanceof THREE.Matrix4) {
    return "[Matrix 4x4]";
  }

  if (val instanceof THREE.Object3D) {
    return `<${val.type || "Object3D"}>`;
  }

  if (val instanceof THREE.Texture) {
    return "<Texture>";
  }

  if (Array.isArray(val)) {
    const sample = val.slice(0, 3).map((x) => {
      if (typeof x === "number") return Number.isInteger(x) ? x : x.toFixed(2);
      if (x instanceof THREE.Color) return `#${x.getHexString()}`;
      return String(x);
    });
    const suffix = val.length > 3 ? `, ... (+${val.length - 3})` : "";
    return `List[${val.length}]: [${sample.join(", ")}${suffix}]`;
  }

  try {
    return JSON.stringify(val);
  } catch {
    return String(val);
  }
}

/**
 * Generic node renderer — every node type looks the same shape (title,
 * inputs down the left, outputs down the right), driven entirely by the
 * NodeDefinition's socket list.
 */
export function GraphNode({ data, selected }: { data: GraphNodeData; selected?: boolean }) {
  const categoryColor = data.category ? CATEGORY_COLOR[data.category] : UNKNOWN_CATEGORY_COLOR;
  const inspectorVal = useInspectorValue(data.nodeId);

  return (
    <div className="graph-node" style={{ borderColor: selected ? categoryColor : undefined }}>
      <div className="graph-node-title" style={{ color: categoryColor }}>
        {data.label}
      </div>
      <div className="graph-node-body">
        <div className="graph-node-column">
          {data.inputs.map((socket) => (
            <div className="graph-node-socket" key={socket.id}>
              <Handle
                type="target"
                position={Position.Left}
                id={socket.id}
                style={{ background: SOCKET_COLOR[socket.type] }}
              />
              <span>{socket.label}</span>
            </div>
          ))}
        </div>
        <div className="graph-node-column graph-node-column-right">
          {data.outputs.map((socket) => (
            <div className="graph-node-socket graph-node-socket-out" key={socket.id}>
              <span>{socket.label}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={socket.id}
                style={{ background: SOCKET_COLOR[socket.type] }}
              />
            </div>
          ))}
        </div>
      </div>
      {data.nodeType === "io/inspector" && (
        <div className="graph-node-inspector">{renderValuePreview(inspectorVal)}</div>
      )}
    </div>
  );
}
