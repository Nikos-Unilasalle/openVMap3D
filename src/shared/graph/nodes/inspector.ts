import { setInspectorValue } from "../inspectorStore";
import { NodeDefinition } from "../types";

/** Inspector node — displays live input values directly inside the node body on the editor canvas. */
export const INSPECTOR_NODE: NodeDefinition = {
  type: "io/inspector",
  label: "Inspector",
  category: "io",
  inputs: [{ id: "input", label: "Input", type: "any", owns: true }],
  outputs: [{ id: "out", label: "Out", type: "any" }],
  defaultParams: {},
  evaluate: (inputs, _params, ctx) => {
    const val = inputs.input;
    setInspectorValue(ctx.nodeId, val);
    return { out: val };
  },
};
