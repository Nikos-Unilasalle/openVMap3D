import { Handle, Position } from "@xyflow/react";
import { SOCKET_COLOR, SocketDef } from "../shared/graph/sockets";

export interface GraphNodeData {
  label: string;
  inputs: SocketDef[];
  outputs: SocketDef[];
  [key: string]: unknown;
}

/**
 * Generic node renderer — every node type looks the same shape (title,
 * inputs down the left, outputs down the right), driven entirely by the
 * NodeDefinition's socket list rather than one React component per node
 * type. A new node type in the registry needs no new UI code to show up here.
 */
export function GraphNode({ data }: { data: GraphNodeData }) {
  return (
    <div className="graph-node">
      <div className="graph-node-title">{data.label}</div>
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
