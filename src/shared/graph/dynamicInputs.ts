import { Connection } from "./types";
import { SocketDef } from "./sockets";

/**
 * Standard behavior for a node whose input count grows as it's wired up:
 * sockets are named `${prefix}0`, `${prefix}1`, ... and there's always
 * exactly one more than the highest-numbered one currently connected, so
 * there's always a free socket to drag the next wire into. Purely a
 * function of this instance's own connections — stateless, so it self-heals
 * (shrinks back down) if a trailing connection is removed, and needs no
 * cleanup when a node is deleted.
 */
export function growingSockets(
  connections: Connection[],
  prefix: string,
  socketFor: (index: number) => SocketDef,
): SocketDef[] {
  let maxConnected = -1;
  for (const conn of connections) {
    if (!conn.toSocket.startsWith(prefix)) continue;
    const index = Number(conn.toSocket.slice(prefix.length));
    if (Number.isInteger(index) && index > maxConnected) maxConnected = index;
  }
  const count = maxConnected + 2;
  return Array.from({ length: count }, (_, i) => socketFor(i));
}
