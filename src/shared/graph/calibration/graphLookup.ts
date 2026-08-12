import { ROOM_CORNER_NODE, readRoomCornerDimensions } from "../nodes/roomCorner";
import { Graph } from "../types";
import { ReferencePoint, roomCornerReferencePoints } from "./roomCorner";

/** The Camera input socket a calibration target has to be wired into. */
export const REF_POINTS_SOCKET = "refPoints";

/**
 * Follows the wire out of a Camera node's Ref Points socket to find what it
 * is calibrating against.
 *
 * The wire is the single source of truth on purpose: the overlay draws
 * handles for exactly the points the Camera node will solve with, so the two
 * cannot drift. No wire means no calibration — which the overlay says out
 * loud rather than silently drawing handles that lead nowhere.
 */
export function findReferencePointsForCamera(graph: Graph, cameraNodeId: string): ReferencePoint[] | null {
  const connection = graph.connections.find(
    (c) => c.toNode === cameraNodeId && c.toSocket === REF_POINTS_SOCKET,
  );
  if (!connection) return null;

  const source = graph.nodes.find((n) => n.id === connection.fromNode);
  if (!source || source.type !== ROOM_CORNER_NODE.type) return null;

  const dimensions = readRoomCornerDimensions({}, { ...ROOM_CORNER_NODE.defaultParams, ...source.params });
  return roomCornerReferencePoints(dimensions);
}
