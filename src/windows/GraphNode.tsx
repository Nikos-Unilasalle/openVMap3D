import { Handle, Position } from "@xyflow/react";
import { CATEGORY_COLOR, NodeCategory, UNKNOWN_CATEGORY_COLOR } from "../shared/graph/categories";
import { SOCKET_COLOR, SocketDef } from "../shared/graph/sockets";

export interface GraphNodeData {
  label: string;
  category?: NodeCategory;
  inputs: SocketDef[];
  outputs: SocketDef[];
  [key: string]: unknown;
}

/**
 * Generic node renderer — every node type looks the same shape (title,
 * inputs down the left, outputs down the right), driven entirely by the
 * NodeDefinition's socket list rather than one React component per node
 * type. A new node type in the registry needs no new UI code to show up here.
 * The title's color is the node's category color — the same color also
 * shows in the palette section it came from, its param panel, and (as a
 * border) here when the node is selected.
 */
export function GraphNode({ data, selected }: { data: GraphNodeData; selected?: boolean }) {
  const categoryColor = data.category ? CATEGORY_COLOR[data.category] : UNKNOWN_CATEGORY_COLOR;
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
    </div>
  );
}
