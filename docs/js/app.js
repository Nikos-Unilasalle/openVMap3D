import { initNodeCatalog } from "./components/nodeCatalog.js";
import { initDLTSimulator } from "./components/dltSimulator.js";
import { initTroubleshooter } from "./components/troubleshooter.js";
import { initKeyboardViz } from "./components/keyboardViz.js";
import { GUIDES_DATABASE } from "./data/guides.js";

/**
 * Application principale du Wiki OpenVMap3D
 */
document.addEventListener("DOMContentLoaded", () => {
  initNavigation();
  initNodeCatalog("nodeCatalogContainer");
  initDLTSimulator("dltSimulatorContainer");
  initTroubleshooter("troubleshooterContainer");
  initKeyboardViz("keyboardVizContainer");
  renderPedagogicalGuides();
});

function initNavigation() {
  const navLinks = document.querySelectorAll(".nav-link");
  const tabContents = document.querySelectorAll(".wiki-tab-content");

  navLinks.forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const targetTab = link.getAttribute("href").substring(1);

      navLinks.forEach(l => l.classList.remove("active"));
      tabContents.forEach(tc => tc.classList.remove("active"));

      link.classList.add("active");
      const activeEl = document.getElementById(targetTab);
      if (activeEl) {
        activeEl.classList.add("active");
      }

      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

function renderPedagogicalGuides() {
  const container = document.getElementById("guidesListContainer");
  if (!container) return;

  container.innerHTML = `
    <div class="guides-layout">
      <!-- Sommaire des Guides -->
      <aside class="guides-sidebar">
        <div class="sidebar-title">Sommaire des Tutoriels</div>
        <nav class="guides-toc-nav">
          ${GUIDES_DATABASE.map((g, idx) => `
            <a href="#guide-art-${g.id}" class="toc-link ${idx === 0 ? "active" : ""}" data-guide="${g.id}">
              <span>${g.title.split(" ")[0]}</span>
              <span>${g.title.split(" ").slice(1).join(" ")}</span>
            </a>
          `).join("")}
        </nav>
      </aside>

      <!-- Flux des Articles Pédagogiques -->
      <div class="guides-content-stream">
        ${GUIDES_DATABASE.map(guide => renderSingleGuideArticle(guide)).join("")}
      </div>
    </div>
  `;

  // Gestion des liens du sommaire
  const tocLinks = container.querySelectorAll(".toc-link");
  tocLinks.forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      tocLinks.forEach(l => l.classList.remove("active"));
      link.classList.add("active");

      const targetId = link.getAttribute("href").substring(1);
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
}

function renderSingleGuideArticle(guide) {
  return `
    <article class="guide-article-card" id="guide-art-${guide.id}">
      <div class="guide-meta-bar">
        <span class="guide-badge-time">⏱️ ${guide.time}</span>
        <span class="guide-badge-level">${guide.level}</span>
      </div>

      <h2 class="guide-main-title">${guide.title}</h2>
      <p class="guide-intro-lead">${guide.content.lead}</p>

      <div class="guide-markdown-body">
        ${guide.content.sections.map(section => renderGuideSection(section)).join("")}
      </div>
    </article>
  `;
}

function renderGuideSection(section) {
  if (section.type === "text") {
    return `
      <h2>${section.title}</h2>
      <p>${section.body}</p>
    `;
  }

  if (section.type === "steps") {
    return `
      <h2>${section.title}</h2>
      <div class="step-cards-container">
        ${section.items.map(step => `
          <div class="step-card-item">
            <div class="step-number-circle">${step.number}</div>
            <div class="step-content-text">
              <h4>${step.title}</h4>
              <p>${step.desc}</p>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  if (section.type === "tip") {
    return `
      <div class="callout-box callout-tip">
        <div class="callout-icon">💡</div>
        <div class="callout-text">
          <h5>${section.titleTip}</h5>
          <p>${section.bodyTip}</p>
        </div>
      </div>
    `;
  }

  if (section.type === "warning") {
    return `
      <div class="callout-box callout-warning">
        <div class="callout-icon">⚠️</div>
        <div class="callout-text">
          <h5>${section.titleWarning}</h5>
          <p>${section.bodyWarning}</p>
        </div>
      </div>
    `;
  }

  if (section.type === "image") {
    return `
      <div class="guide-image-frame">
        <img src="${section.src}" alt="${section.caption}" />
        <div class="image-caption">${section.caption}</div>
      </div>
    `;
  }

  return "";
}
