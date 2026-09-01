# Chromium ANGLE & Timeouts de Pilote Graphique (TDR)

*Domaine : Couche d'Abstraction Graphique & Stabilité GPU*

---

## 1. La Couche ANGLE sous Chromium (Chrome, Edge)
Chromium utilise **ANGLE** (*Almost Native Graphics Layer Engine*) pour traduire les appels WebGL en API natives du système d'exploitation :
- Windows : DirectX 11 / DirectX 12
- macOS : Metal
- Linux : Vulkan

---

## 2. Le Mécanisme TDR (Timeout Detection and Recovery)
Sous Windows, le pilote graphique surveille la durée d'exécution des shaders :
- Si un shader (ex. simulation de particules complexe ou raymarching) bloque le GPU pendant plus de **2 secondes**, Windows considère que le pilote est figé et le redémarre brutalement.
- Cela déclenche immédiatement un événement de **perte de contexte WebGL** (`webglcontextlost`) dans le navigateur.

---

## 🔗 Notes Associées
- [[WebGL Context Loss and Restoration Lifecycle]]
- [[GLSL Branchless Programming and Optimization]]
- [[Safari and iOS WebKit Memory Limits]]
