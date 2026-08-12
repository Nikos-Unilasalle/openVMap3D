import { CATEGORY_COLOR, CATEGORY_LABEL, CATEGORY_ORDER } from "../shared/graph/categories";
import { NodeDefinition } from "../shared/graph/types";
import "./node-palette.css";

interface NodePaletteProps {
  nodes: NodeDefinition[];
  onAddNode: (type: string) => void;
}

/** Grouped by category, in BIBLE.md's catalog order; a category with nothing registered in it yet just doesn't render a section. */
export function NodePalette({ nodes, onAddNode }: NodePaletteProps) {
  return (
    <div className="node-palette">
      {CATEGORY_ORDER.map((category) => {
        const inCategory = nodes.filter((def) => def.category === category);
        if (inCategory.length === 0) return null;
        const color = CATEGORY_COLOR[category];
        return (
          <div className="palette-category" key={category}>
            <div className="palette-category-title" style={{ color }}>
              {CATEGORY_LABEL[category]}
            </div>
            {inCategory.map((def) => (
              <button
                key={def.type}
                type="button"
                className="palette-node-button"
                style={{ borderLeftColor: color }}
                onClick={() => onAddNode(def.type)}
              >
                {def.label}
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}
