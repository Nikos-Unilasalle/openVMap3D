import { NODES_DATABASE, NODE_CATEGORIES, SOCKET_TYPES } from "../data/nodes.js";

/**
 * Catalogue Interactif des Nodes d'OpenVMap3D
 */
export function initNodeCatalog(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <div class="catalog-header">
      <div class="catalog-search-bar">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input type="text" id="nodeSearchInput" placeholder="Rechercher une node par nom, type, socket (ex: Box, Bloom, DLT, Transform)..." />
        <span class="search-shortcut"><kbd>Cmd</kbd> + <kbd>K</kbd></span>
      </div>

      <div class="catalog-categories-pills" id="categoryPills">
        <button class="cat-pill active" data-cat="all">Toutes (${NODES_DATABASE.length})</button>
      </div>
    </div>

    <div class="sockets-legend">
      <span class="legend-title">Sockets :</span>
      ${Object.entries(SOCKET_TYPES).map(([type, info]) => `
        <span class="socket-tag socket-${type}" title="${info.description}">
          <span class="socket-dot" style="background: ${info.color}"></span>
          ${info.label.split(" ")[0]}
        </span>
      `).join("")}
    </div>

    <div class="node-grid" id="nodeGrid"></div>

    <!-- Modale de détail de node -->
    <div class="node-modal-backdrop" id="nodeModalBackdrop">
      <div class="node-modal" id="nodeModal">
        <button class="modal-close" id="modalCloseBtn">&times;</button>
        <div class="modal-content" id="modalContent"></div>
      </div>
    </div>
  `;

  // Génération des pills de catégories
  const categoryPillsContainer = document.getElementById("categoryPills");
  Object.entries(NODE_CATEGORIES).forEach(([catKey, catInfo]) => {
    const count = NODES_DATABASE.filter(n => n.category === catKey).length;
    if (count > 0) {
      const btn = document.createElement("button");
      btn.className = "cat-pill";
      btn.dataset.cat = catKey;
      btn.innerHTML = `<span class="pill-dot" style="background: ${catInfo.color}"></span>${catInfo.label} (${count})`;
      categoryPillsContainer.appendChild(btn);
    }
  });

  let activeCategory = "all";
  let searchQuery = "";

  function renderNodes() {
    const grid = document.getElementById("nodeGrid");
    grid.innerHTML = "";

    const filtered = NODES_DATABASE.filter(node => {
      const matchesCat = activeCategory === "all" || node.category === activeCategory;
      const q = searchQuery.toLowerCase();
      const matchesQuery = !q || 
        node.name.toLowerCase().includes(q) ||
        node.type.toLowerCase().includes(q) ||
        node.summary.toLowerCase().includes(q) ||
        node.inputs.some(i => i.label.toLowerCase().includes(q) || i.type.toLowerCase().includes(q)) ||
        node.outputs.some(o => o.label.toLowerCase().includes(q) || o.type.toLowerCase().includes(q));

      return matchesCat && matchesQuery;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <p>Aucune node ne correspond à la recherche "${searchQuery}".</p>
        </div>
      `;
      return;
    }

    filtered.forEach(node => {
      const catInfo = NODE_CATEGORIES[node.category] || { color: "#64748B", label: node.category };
      const card = document.createElement("div");
      card.className = "node-card";
      card.dataset.id = node.id;

      card.innerHTML = `
        <div class="node-card-header" style="border-left-color: ${catInfo.color}">
          <span class="node-category-tag" style="color: ${catInfo.color}">${catInfo.label}</span>
          <h4 class="node-title">${node.name}</h4>
          <span class="node-type-code">${node.type}</span>
        </div>
        <p class="node-summary">${node.summary}</p>

        <div class="node-sockets-preview">
          <div class="sockets-col inputs-col">
            <span class="sockets-head">Entrées (${node.inputs.length})</span>
            ${node.inputs.slice(0, 3).map(inp => `
              <div class="socket-item">
                <span class="socket-bullet" style="background: ${SOCKET_TYPES[inp.type]?.color || "#ccc"}"></span>
                <span class="socket-name">${inp.label}</span>
              </div>
            `).join("")}
            ${node.inputs.length > 3 ? `<span class="more-sockets">+${node.inputs.length - 3} autres...</span>` : ""}
          </div>

          <div class="sockets-col outputs-col">
            <span class="sockets-head">Sorties (${node.outputs.length})</span>
            ${node.outputs.slice(0, 3).map(out => `
              <div class="socket-item">
                <span class="socket-name">${out.label}</span>
                <span class="socket-bullet" style="background: ${SOCKET_TYPES[out.type]?.color || "#ccc"}"></span>
              </div>
            `).join("")}
          </div>
        </div>

        <div class="node-card-footer">
          <span class="btn-inspect">Inspecter la Node →</span>
        </div>
      `;

      card.addEventListener("click", () => openNodeModal(node));
      grid.appendChild(card);
    });
  }

  function openNodeModal(node) {
    const backdrop = document.getElementById("nodeModalBackdrop");
    const content = document.getElementById("modalContent");
    const catInfo = NODE_CATEGORIES[node.category] || { color: "#64748B", label: node.category };

    content.innerHTML = `
      <div class="modal-node-header" style="border-top: 4px solid ${catInfo.color}">
        <span class="cat-badge" style="background: ${catInfo.color}20; color: ${catInfo.color}">${catInfo.label}</span>
        <h2>${node.name}</h2>
        <code class="type-badge">${node.type}</code>
      </div>

      <p class="modal-desc">${node.summary}</p>

      <div class="modal-section">
        <h4>💡 Exemple d'Usage Pratique</h4>
        <p class="usage-box">${node.usage}</p>
      </div>

      <div class="modal-sockets-grid">
        <div class="sockets-box">
          <h4>📥 Prises d'Entrée (Inputs)</h4>
          <ul>
            ${node.inputs.map(inp => `
              <li>
                <span class="socket-bullet" style="background: ${SOCKET_TYPES[inp.type]?.color || "#ccc"}"></span>
                <strong>${inp.label}</strong> 
                <span class="type-tag">${inp.type}</span>
                <span class="default-val">Défaut: <code>${inp.default}</code></span>
              </li>
            `).join("")}
          </ul>
        </div>

        <div class="sockets-box">
          <h4>📤 Prises de Sortie (Outputs)</h4>
          <ul>
            ${node.outputs.map(out => `
              <li>
                <span class="socket-bullet" style="background: ${SOCKET_TYPES[out.type]?.color || "#ccc"}"></span>
                <strong>${out.label}</strong> 
                <span class="type-tag">${out.type}</span>
              </li>
            `).join("")}
          </ul>
        </div>
      </div>
    `;

    backdrop.classList.add("active");
  }

  // Événements
  categoryPillsContainer.addEventListener("click", (e) => {
    const btn = e.target.closest(".cat-pill");
    if (!btn) return;
    document.querySelectorAll(".cat-pill").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    activeCategory = btn.dataset.cat;
    renderNodes();
  });

  const searchInput = document.getElementById("nodeSearchInput");
  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    renderNodes();
  });

  document.getElementById("modalCloseBtn").addEventListener("click", () => {
    document.getElementById("nodeModalBackdrop").classList.remove("active");
  });

  document.getElementById("nodeModalBackdrop").addEventListener("click", (e) => {
    if (e.target.id === "nodeModalBackdrop") {
      e.target.classList.remove("active");
    }
  });

  renderNodes();
}
