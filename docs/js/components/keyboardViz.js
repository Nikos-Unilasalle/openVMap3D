import { SHORTCUTS_DATABASE } from "../data/shortcuts.js";

/**
 * Visualiseur Interactif de Raccourcis Clavier
 */
export function initKeyboardViz(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <div class="shortcuts-card">
      <div class="shortcuts-header">
        <h3>⌨️ Matrice des Raccourcis Clavier</h3>
        <p>Survolez ou filtrez les raccourcis clés pour accélérer votre workflow de créateur 3D.</p>
      </div>

      <div class="shortcuts-grid">
        ${SHORTCUTS_DATABASE.map(sc => `
          <div class="shortcut-item">
            <div class="keys-group">
              ${sc.keys.map(k => `<kbd class="key-badge">${k}</kbd>`).join(" + ")}
            </div>
            <div class="shortcut-info">
              <span class="action-name">${sc.action}</span>
              <p class="action-desc">${sc.description}</p>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}
