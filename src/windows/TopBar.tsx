import React, { useEffect, useState } from "react";
import {
  ensureOvmExtension,
  incrementFilename,
  openGraphWithFilePicker,
  saveGraphAsWithFilePicker,
  saveGraphToPath,
} from "../shared/graph/storage";
import { Graph } from "../shared/graph/types";
import { closeOutputWindow, listMonitors, onOutputClosed, openOutputWindow } from "../shared/ipc";
import logoUrl from "../assets/logo.png";
import "./top-bar.css";

export interface TopBarProps {
  graph: Graph;
  onLoadGraph: (graph: Graph, filename?: string) => void;
  currentFilename: string;
  currentFilePath: string | null;
  onFilenameChange: (name: string, path: string | null) => void;
  onUndo?: () => void;
  onRedo?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  graph,
  onLoadGraph,
  currentFilename,
  currentFilePath,
  onFilenameChange,
  onUndo,
  onRedo,
}) => {
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastError, setToastError] = useState(false);
  const [isEditingFilename, setIsEditingFilename] = useState(false);
  const [filenameInput, setFilenameInput] = useState(currentFilename);
  const [isOutputOpen, setIsOutputOpen] = useState(false);

  const showToast = (msg: string, error = false) => {
    setToastMessage(msg);
    setToastError(error);
    setTimeout(() => {
      setToastMessage(null);
      setToastError(false);
    }, 3500);
  };

  // Tracks the OS-level close (red X on the output window), not just our own button.
  useEffect(() => onOutputClosed(() => setIsOutputOpen(false)), []);

  // The projector: opens fullscreen on the second monitor when there is one,
  // otherwise the only one there is. "Il faudrait une fenêtre plein écran
  // pour le deuxième écran" — one click, no monitor picker, since that's
  // the actual ask; a picker is easy to add later if a third display shows up.
  const handleToggleOutput = async () => {
    try {
      if (isOutputOpen) {
        await closeOutputWindow();
        setIsOutputOpen(false);
        return;
      }
      const monitors = await listMonitors();
      const target = monitors[1] ?? monitors[0];
      if (!target) {
        showToast("Aucun écran détecté", true);
        return;
      }
      await openOutputWindow(target, true);
      setIsOutputOpen(true);
    } catch (err: unknown) {
      const error = err as Error;
      showToast(`Erreur sortie : ${error.message}`, true);
    }
  };

  // 0. NEW GRAPH
  const handleNewGraph = () => {
    if (
      graph.nodes.length > 0 &&
      !window.confirm("Créer un nouveau graph ? Les modifications non sauvegardées seront perdues.")
    ) {
      return;
    }
    const emptyGraph: Graph = { nodes: [], connections: [] };
    onLoadGraph(emptyGraph, "project_v1.ovm");
    onFilenameChange("project_v1.ovm", null);
    showToast("Nouveau graph créé !");
  };

  // 1. LOAD GRAPH — native Tauri open dialog
  const handleLoadClick = async () => {
    try {
      const res = await openGraphWithFilePicker();
      if (res) {
        onLoadGraph(res.graph, res.filename);
        showToast(`"${res.filename}" chargé !`);
      }
    } catch (err: unknown) {
      const error = err as Error;
      showToast(`Erreur : ${error.message}`, true);
    }
  };

  // 2. SAVE — write directly to current path, or open Save As if no path
  const handleSave = async () => {
    try {
      if (currentFilePath) {
        await saveGraphToPath(graph, currentFilePath);
        showToast(`Sauvegardé : ${currentFilename}`);
      } else {
        // No path yet — fall through to Save As
        await handleSaveAs();
      }
    } catch (err: unknown) {
      const error = err as Error;
      showToast(`Erreur sauvegarde : ${error.message}`, true);
    }
  };

  // 3. SAVE AS — native Tauri save dialog
  const handleSaveAs = async () => {
    try {
      const safeName = ensureOvmExtension(currentFilename);
      const savedName = await saveGraphAsWithFilePicker(graph, safeName);
      if (savedName) {
        // We don't have the full path back from just the name, so reset path to null
        // and the next Save will prompt again, OR we store from dialog
        onFilenameChange(savedName, null);
        showToast(`Sauvegardé sous : ${savedName}`);
      }
    } catch (err: unknown) {
      const error = err as Error;
      showToast(`Erreur : ${error.message}`, true);
    }
  };

  // 4. INCREMENTAL SAVE — Save As with auto-incremented filename
  const handleIncrementalSave = async () => {
    try {
      const nextName = incrementFilename(currentFilename);
      const savedName = await saveGraphAsWithFilePicker(graph, nextName);
      if (savedName) {
        onFilenameChange(savedName, null);
        showToast(`Sauvegarde incrémentale : ${savedName}`);
      }
    } catch (err: unknown) {
      const error = err as Error;
      showToast(`Erreur : ${error.message}`, true);
    }
  };

  // FILENAME EDIT
  const handleFilenameSubmit = () => {
    setIsEditingFilename(false);
    let val = filenameInput.trim();
    if (!val) return;
    val = ensureOvmExtension(val);
    onFilenameChange(val, currentFilePath);
  };

  return (
    <header className="top-bar">
      {/* Left branding */}
      <div className="top-bar-left">
        <div className="top-bar-logo">
          <img src={logoUrl} alt="openVmap" className="top-bar-logo-img" />
          <span className="top-bar-logo-text">openVmap</span>
        </div>
        <div className="top-bar-divider" />
      </div>

      {/* Center action buttons */}
      <div className="top-bar-center">
        {/* NEW */}
        <button className="top-bar-button top-bar-button-new" onClick={handleNewGraph} title="Nouveau projet vide">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
          New
        </button>

        {/* LOAD */}
        <button className="top-bar-button top-bar-button-load" onClick={handleLoadClick} title="Charger un projet (.ovm)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            <line x1="12" y1="11" x2="12" y2="17" />
            <polyline points="9 14 12 11 15 14" />
          </svg>
          Load
        </button>

        {/* SAVE */}
        <button className="top-bar-button top-bar-button-save" onClick={handleSave} title="Sauvegarder (.ovm)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
          </svg>
          Save
        </button>

        {/* SAVE AS */}
        <button className="top-bar-button top-bar-button-save-as" onClick={handleSaveAs} title="Sauvegarder sous (.ovm)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
            <path d="M14 17h.01" />
            <path d="M17 9l4 4-4 4" />
          </svg>
          Save As...
        </button>

        {/* INCREMENTAL SAVE */}
        <button className="top-bar-button top-bar-button-inc" onClick={handleIncrementalSave} title="Sauvegarde incrémentale (.ovm)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <line x1="12" y1="3" x2="12" y2="7" />
            <line x1="10" y1="5" x2="14" y2="5" />
          </svg>
          Incremental Save
        </button>

        {/* UNDO */}
        <button className="top-bar-button" onClick={onUndo} title="Annuler (Ctrl+Z / ⌘Z)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          Undo
        </button>

        {/* REDO */}
        <button className="top-bar-button" onClick={onRedo} title="Rétablir (Ctrl+Shift+Z / ⌘⇧Z)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
          </svg>
          Redo
        </button>

        {/* OUTPUT — fullscreen window on the second monitor (the video projector) */}
        <button
          className={`top-bar-button top-bar-button-output${isOutputOpen ? " top-bar-button-output-active" : ""}`}
          onClick={handleToggleOutput}
          title={isOutputOpen ? "Fermer la fenêtre de sortie" : "Ouvrir la sortie plein écran (deuxième écran)"}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          {isOutputOpen ? "Close Output" : "Output"}
        </button>
      </div>

      {/* Right area */}
      <div className="top-bar-right">
        {toastMessage && (
          <div className={`top-bar-toast${toastError ? " top-bar-toast-error" : ""}`}>
            {toastError ? "⚠ " : "✓ "}{toastMessage}
          </div>
        )}

        {isEditingFilename ? (
          <input
            className="top-bar-filename-edit-input"
            autoFocus
            value={filenameInput}
            onChange={(e) => setFilenameInput(e.target.value)}
            onBlur={handleFilenameSubmit}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleFilenameSubmit();
              if (e.key === "Escape") setIsEditingFilename(false);
            }}
          />
        ) : (
          <div
            className="top-bar-filename"
            onClick={() => {
              setFilenameInput(currentFilename);
              setIsEditingFilename(true);
            }}
            title={currentFilePath || "Pas encore sauvegardé"}
          >
            📄 {currentFilename}
          </div>
        )}
      </div>
    </header>
  );
};
