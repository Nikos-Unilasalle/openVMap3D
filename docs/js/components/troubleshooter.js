import { DIAGNOSTICS_DATABASE } from "../data/faq.js";

/**
 * Assistant Interactif de Diagnostic & Résolution de Problèmes
 */
export function initTroubleshooter(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <div class="troubleshooter-card">
      <div class="ts-header">
        <h3>🔧 Centre de Diagnostic & Dépannage</h3>
        <p>Sélectionnez le symptôme rencontré pour obtenir immédiatement le diagnostic et les étapes de résolution.</p>
      </div>

      <div class="ts-body">
        <div class="ts-symptoms-list" id="symptomsList"></div>
        <div class="ts-solution-view" id="solutionView">
          <div class="ts-placeholder">
            <p>👈 Sélectionnez un problème dans la liste de gauche pour afficher la solution.</p>
          </div>
        </div>
      </div>
    </div>
  `;

  const symptomsList = document.getElementById("symptomsList");
  const solutionView = document.getElementById("solutionView");

  DIAGNOSTICS_DATABASE.forEach((diag, index) => {
    const item = document.createElement("div");
    item.className = `ts-symptom-item ${index === 0 ? "active" : ""}`;
    item.dataset.id = diag.id;
    item.innerHTML = `
      <span class="ts-cat-badge">${diag.category}</span>
      <div class="ts-symptom-text">${diag.symptom}</div>
    `;

    item.addEventListener("click", () => {
      document.querySelectorAll(".ts-symptom-item").forEach(el => el.classList.remove("active"));
      item.classList.add("active");
      showSolution(diag);
    });

    symptomsList.appendChild(item);
  });

  function showSolution(diag) {
    solutionView.innerHTML = `
      <div class="solution-content">
        <div class="sol-header">
          <span class="sol-category">${diag.category}</span>
          <h2>${diag.symptom}</h2>
        </div>

        <div class="sol-box cause-box">
          <h4>🔍 Cause Identifiée</h4>
          <p><strong>${diag.cause}</strong></p>
          <p>${diag.explanation}</p>
        </div>

        <div class="sol-box steps-box">
          <h4>🛠️ Étapes de Résolution Pas-à-Pas</h4>
          <ol>
            ${diag.steps.map(step => `<li>${step}</li>`).join("")}
          </ol>
        </div>
      </div>
    `;
  }

  // Afficher la première solution par défaut
  if (DIAGNOSTICS_DATABASE.length > 0) {
    showSolution(DIAGNOSTICS_DATABASE[0]);
  }
}
