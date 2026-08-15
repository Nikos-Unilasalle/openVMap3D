/**
 * Simulateur Interactif de Calibration DLT (Direct Linear Transformation)
 * Permet d'ajuster 6 poignées de calage sur un canvas 2D/3D et d'observer la résolution de pose en direct.
 */
export function initDLTSimulator(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <div class="dlt-sim-card">
      <div class="dlt-sim-header">
        <div class="dlt-sim-title">
          <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
          </svg>
          <h3>Simulateur Interactif de Calibration DLT</h3>
        </div>
        <div class="dlt-badge">En direct • Solveur Temps Réel</div>
      </div>
      
      <p class="dlt-sim-desc">
        Déplacez les 6 poignées colorées numerotées ci-dessous pour simuler l'alignement sur votre mur réel. Observez la réévaluation instantanée des paramètres de projecteur (Position, FOV, Lens Shift et Erreur Résiduelle).
      </p>

      <div class="dlt-sim-workspace">
        <div class="dlt-canvas-container">
          <canvas id="dltCanvas" width="680" height="420"></canvas>
          <div class="dlt-instructions">💡 Cliquez et glissez l'un des 6 numéros pour ajuster le calage</div>
        </div>

        <div class="dlt-metrics-panel">
          <div class="metrics-card-header">Paramètres Calculés (DLT Solve)</div>
          
          <div class="metric-row">
            <span class="metric-label">Position Spatial ($X, Y, Z$) :</span>
            <span class="metric-val" id="metricPos">-4.85m, 1.72m, 7.90m</span>
          </div>

          <div class="metric-row">
            <span class="metric-label">Champ de Vision (FOV) :</span>
            <span class="metric-val" id="metricFov">H: 62.4° | V: 46.8°</span>
          </div>

          <div class="metric-row">
            <span class="metric-label">Décalage Objectif (Lens Shift) :</span>
            <span class="metric-val" id="metricShift">X: +0.012, Y: -0.006</span>
          </div>

          <div class="metric-row highlight-row">
            <span class="metric-label">Erreur Résiduelle (Residual Error) :</span>
            <span class="metric-val quality-good" id="metricError">1.12 px (Excellent)</span>
          </div>

          <div class="dlt-controls">
            <button id="btnResetDLT" class="btn-dlt-reset">Réinitialiser les Poignées</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const canvas = document.getElementById("dltCanvas");
  const ctx = canvas.getContext("2d");

  // Points de repères initiaux (6 poignées de calibration DLT)
  const defaultHandles = [
    { id: 1, name: "Corner Base", x: 340, y: 340, color: "#06B6D4" },
    { id: 2, name: "Top Corner", x: 340, y: 110, color: "#06B6D4" },
    { id: 3, name: "Right Corner Base", x: 550, y: 310, color: "#EAB308" },
    { id: 4, name: "Right Wall Top", x: 550, y: 90, color: "#EAB308" },
    { id: 5, name: "Left Wall Top", x: 130, y: 90, color: "#EC4899" },
    { id: 6, name: "Left Corner Base", x: 130, y: 310, color: "#10B981" }
  ];

  let handles = JSON.parse(JSON.stringify(defaultHandles));
  let draggingHandle = null;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Grille de fond
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Tracer les arêtes de la pièce 3D
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
    ctx.setLineDash([4, 4]);

    // Mur central vertical (Point 1 -> Point 2)
    ctx.beginPath();
    ctx.moveTo(handles[0].x, handles[0].y);
    ctx.lineTo(handles[1].x, handles[1].y);
    ctx.stroke();

    // Mur droit (Point 1 -> 3, Point 2 -> 4, Point 3 -> 4)
    ctx.beginPath();
    ctx.moveTo(handles[0].x, handles[0].y);
    ctx.lineTo(handles[2].x, handles[2].y);
    ctx.lineTo(handles[3].x, handles[3].y);
    ctx.lineTo(handles[1].x, handles[1].y);
    ctx.stroke();

    // Mur gauche (Point 1 -> 6, Point 2 -> 5, Point 6 -> 5)
    ctx.beginPath();
    ctx.moveTo(handles[0].x, handles[0].y);
    ctx.lineTo(handles[5].x, handles[5].y);
    ctx.lineTo(handles[4].x, handles[4].y);
    ctx.lineTo(handles[1].x, handles[1].y);
    ctx.stroke();

    ctx.setLineDash([]);

    // Remplissage léger des façades
    ctx.fillStyle = "rgba(56, 189, 248, 0.03)";
    ctx.beginPath();
    ctx.moveTo(handles[0].x, handles[0].y);
    ctx.lineTo(handles[2].x, handles[2].y);
    ctx.lineTo(handles[3].x, handles[3].y);
    ctx.lineTo(handles[1].x, handles[1].y);
    ctx.fill();

    ctx.fillStyle = "rgba(236, 72, 153, 0.03)";
    ctx.beginPath();
    ctx.moveTo(handles[0].x, handles[0].y);
    ctx.lineTo(handles[5].x, handles[5].y);
    ctx.lineTo(handles[4].x, handles[4].y);
    ctx.lineTo(handles[1].x, handles[1].y);
    ctx.fill();

    // Dessiner les poignées interactives
    handles.forEach((h) => {
      ctx.shadowColor = h.color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = h.color;
      ctx.beginPath();
      ctx.arc(h.x, h.y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Numéro
      ctx.fillStyle = "#0D0F12";
      ctx.font = "bold 13px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(h.id, h.x, h.y);

      // Label de la poignée
      ctx.fillStyle = "#E2E8F0";
      ctx.font = "11px Inter, sans-serif";
      ctx.fillText(h.name, h.x, h.y + 24);
    });

    updateMetrics();
  }

  function updateMetrics() {
    // Calcul de simulation d'erreur DLT basé sur les décalages par rapport aux poignées d'origine
    let devSq = 0;
    for (let i = 0; i < handles.length; i++) {
      let dx = handles[i].x - defaultHandles[i].x;
      let dy = handles[i].y - defaultHandles[i].y;
      devSq += dx * dx + dy * dy;
    }
    const err = (0.8 + Math.sqrt(devSq) * 0.04).toFixed(2);
    
    // Position simulée
    const posX = (-5.0 + (handles[0].x - 340) * 0.02).toFixed(2);
    const posY = (1.7 + (340 - handles[0].y) * 0.02).toFixed(2);
    const posZ = (8.0 + (handles[1].y - 110) * 0.01).toFixed(2);

    document.getElementById("metricPos").innerText = `${posX}m, ${posY}m, ${posZ}m`;
    document.getElementById("metricFov").innerText = `H: ${(60 + (handles[2].x - 550) * 0.1).toFixed(1)}° | V: 45.2°`;
    document.getElementById("metricShift").innerText = `X: ${((handles[0].x - 340) * 0.0005).toFixed(3)}, Y: ${((handles[0].y - 340) * 0.0005).toFixed(3)}`;

    const errElem = document.getElementById("metricError");
    if (err < 2.0) {
      errElem.innerText = `${err} px (Excellent • Précis)`;
      errElem.className = "metric-val quality-good";
    } else if (err < 4.5) {
      errElem.innerText = `${err} px (Acceptable)`;
      errElem.className = "metric-val quality-warn";
    } else {
      errElem.innerText = `${err} px (Élevé • Ajustement requis)`;
      errElem.className = "metric-val quality-bad";
    }
  }

  // Interactivité Glisser-Déposer
  function getMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  canvas.addEventListener("mousedown", (e) => {
    const pos = getMousePos(e);
    for (let h of handles) {
      const dist = Math.hypot(h.x - pos.x, h.y - pos.y);
      if (dist <= 18) {
        draggingHandle = h;
        dragOffsetX = pos.x - h.x;
        dragOffsetY = pos.y - h.y;
        canvas.style.cursor = "grabbing";
        break;
      }
    }
  });

  canvas.addEventListener("mousemove", (e) => {
    const pos = getMousePos(e);
    if (draggingHandle) {
      draggingHandle.x = pos.x - dragOffsetX;
      draggingHandle.y = pos.y - dragOffsetY;
      render();
    } else {
      let hover = false;
      for (let h of handles) {
        if (Math.hypot(h.x - pos.x, h.y - pos.y) <= 18) {
          hover = true;
          break;
        }
      }
      canvas.style.cursor = hover ? "pointer" : "default";
    }
  });

  window.addEventListener("mouseup", () => {
    if (draggingHandle) {
      draggingHandle = null;
      canvas.style.cursor = "default";
    }
  });

  document.getElementById("btnResetDLT").addEventListener("click", () => {
    handles = JSON.parse(JSON.stringify(defaultHandles));
    render();
  });

  render();
}
