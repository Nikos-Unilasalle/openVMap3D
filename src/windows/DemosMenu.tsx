import React, { useEffect, useRef, useState } from "react";
import { DEMO_CATALOG } from "../shared/demos";
import { deserializeProject } from "../shared/graph/storage";
import { Project } from "../shared/graph/types";
import "./demos-menu.css";

export interface DemosMenuProps {
  onLoadDemo: (project: Project, filename: string) => void;
  onError: (message: string) => void;
}

/**
 * Anchored dropdown, not a full-screen popover — a demo list is read top to
 * bottom and picked once, unlike EasingPopover's positioned editor, so it
 * doesn't need x/y placement math, just to hang off its own trigger button.
 */
export const DemosMenu: React.FC<DemosMenuProps> = ({ onLoadDemo, onError }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [loadingFile, setLoadingFile] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const handlePick = async (file: string) => {
    setLoadingFile(file);
    try {
      const res = await fetch(`/demos/${file}`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const text = await res.text();
      const project = deserializeProject(text);
      onLoadDemo(project, file);
      setIsOpen(false);
    } catch (err: unknown) {
      const error = err as Error;
      onError(`Erreur démo : ${error.message}`);
    } finally {
      setLoadingFile(null);
    }
  };

  return (
    <div className="demos-menu-root" ref={rootRef}>
      <button
        className={`top-bar-button top-bar-button-demos${isOpen ? " top-bar-button-output-active" : ""}`}
        onClick={() => setIsOpen((v) => !v)}
        title="Parcourir les démos"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
        Demos
      </button>

      {isOpen && (
        <div className="demos-menu-panel">
          {DEMO_CATALOG.map((category) => (
            <div className="demos-menu-category" key={category.title}>
              <div className="demos-menu-category-title">{category.title}</div>
              {category.demos.map((demo) => (
                <button
                  key={demo.file}
                  type="button"
                  className="demos-menu-item"
                  disabled={loadingFile !== null}
                  onClick={() => handlePick(demo.file)}
                  title={demo.description}
                >
                  <span className="demos-menu-item-label">{demo.label}</span>
                  <span className="demos-menu-item-desc">{demo.description}</span>
                  {loadingFile === demo.file && <span className="demos-menu-item-loading">…</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
