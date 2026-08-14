import { EvalResult } from "./evaluate";
import { Graph, NodeDefinition, NodeInstance } from "./types";

/**
 * What the param panel should show for each of a node's fields.
 *
 * A field has to read from the same place its edits are written to, or it
 * misreports and the keyframe taken from it captures the wrong value.
 * Editing always writes `instance.params`, so that is the base — and an
 * evaluated value is layered on top only where the param genuinely isn't in
 * charge:
 *
 *  - a *connected* input socket ignores its param entirely (the param is
 *    only the unconnected fallback), so the upstream value is what's
 *    actually in effect and is the useful thing to display;
 *  - a node *output* is a readout, not a setting — it may only fill in a key
 *    that isn't an editable param at all (a solver's `error`, a camera's
 *    computed `projection`).
 *
 * Both layers used to be spread unconditionally over the params, which let a
 * node's output shadow the identically-named param it was derived from. The
 * Empty is the clearest case: it emits a `location` output decomposed from
 * its composed matrix, which covered the `location` param the panel was
 * editing — so the field displayed the composed result while a gizmo drag
 * wrote the base into the param underneath it, and the two disagreed as soon
 * as anything was wired into the Empty's Matrix input.
 */
export function paramPanelValues(
  graph: Graph,
  instance: NodeInstance,
  def: NodeDefinition,
  results: EvalResult | null,
): Record<string, unknown> {
  const evaluated = results?.get(instance.id) ?? null;
  const merged: Record<string, unknown> = { ...def.defaultParams, ...instance.params };

  const evaluatedInputs = (evaluated?.__evaluatedInputs as Record<string, unknown>) ?? {};
  for (const connection of graph.connections) {
    if (connection.toNode !== instance.id) continue;
    if (connection.toSocket in evaluatedInputs) {
      merged[connection.toSocket] = evaluatedInputs[connection.toSocket];
    }
  }

  for (const [key, value] of Object.entries(evaluated ?? {})) {
    if (key === "__evaluatedInputs") continue;
    if (key in def.defaultParams) continue;
    merged[key] = value;
  }

  return merged;
}
