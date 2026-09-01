# Gestion de la Mémoire, des Caches et Optimisation Navigateurs (Chrome, Firefox, Safari)

*Domaine : Ingénierie WebGL Temps Réel, Moteurs JavaScript (V8, SpiderMonkey, JavaScriptCore), Gestion Mémoire & Caches Navigateurs*  
*Sources & Références : V8 Engine Internals, Chromium ANGLE Architecture, WebKit WebGL Guidelines, MDN Web Storage & Workers API, Google Chrome DevTools Performance Profiling.*

---

## 1. La Dualité Mémoire des Navigateurs : Heap JavaScript vs. VRAM GPU

Dans un navigateur web, une application 3D WebGL opère sur deux espaces mémoires totalement disjoints :

```
┌──────────────────────────────────────────────────────────┐
│              Espace Mémoire Navigateur (CPU)             │
│  - Objets JS, Scène Three.js, Typescript Classes         │
│  - Géré par le Garbage Collector (V8, SpiderMonkey, JSC) │
└────────────────────────────┬─────────────────────────────┘
                             │  Passage d'ordres WebGL (gl.bufferData, etc.)
┌────────────────────────────▼─────────────────────────────┐
│                 Espace Mémoire Pilote (GPU / VRAM)       │
│  - Textures GPU natives, Buffers de sommets (VBO, IBO)   │
│  - Framebuffers (FBO), Shaders compilés                  │
│  - ⚠️ NON géré par le Garbage Collector JavaScript       │
└──────────────────────────────────────────────────────────┘
```

### 1.1 Le Piège du Garbage Collector (GC Pauses / Micro-Saccades)
Les moteurs JavaScript modernes utilisent un ramasse-miettes générationnel (*Generational GC*) :
- **Young Generation (*Scavenge*)** : Fréquent et très rapide ($<1\text{ ms}$).
- **Old Generation (*Major Mark-Sweep / Compact*)** : Lourd et bloquant (*Stop-The-World*), pouvant immobiliser le thread principal pendant $10$ à $50\text{ ms}$, provoquant des sauts d'images visibles à 60 fps.

> [!CAUTION]
> **Antipattern d'Allocation dans la Boucle de Rendu** :  
> Instancier des objets temporaires (ex. `new THREE.Vector3()`, `new Float32Array()`, objets anonymes `{ x, y }`) à chaque tick de la boucle `requestAnimationFrame` remplit frénétiquement la *Young Space* et force des cycles fréquents de *Major GC*.

### 1.2 Le Pattern "Object Pooling" (Allocation Zéro en Rendu)
Pour éliminer les GC pauses en production :
```typescript
// Allouer les instances de travail statiquement en dehors de la boucle :
const _tempVecA = new THREE.Vector3();
const _tempVecB = new THREE.Vector3();
const _tempMatrix = new THREE.Matrix4();

function updateNodeCalculation(inputA: THREE.Vector3, inputB: THREE.Vector3): THREE.Vector3 {
  // Réutilisation des instances partagées sans aucune allocation heap :
  _tempVecA.copy(inputA);
  _tempVecB.copy(inputB);
  return _tempVecA.add(_tempVecB);
}
```

---

## 2. Stratégies de Cache Navigateur & Stockage Persistant d'Assets 3D

Les assets 3D (fichiers `.glb`, textures compressées `.ktx2`, environnements `.hdr`, banques de sons) peuvent rapidement peser des dizaines de mégaoctets. Le téléchargement réseau répété dégrade l'expérience utilisateur et sature la mémoire.

```
                  ┌─────────────────────────────────────────┐
                  │ Requête d'Asset (Modèle GLTF / KTX2)    │
                  └────────────────────┬────────────────────┘
                                       │
                    ┌──────────────────┴──────────────────┐
                    ▼                                     ▼
        [Cache Mémoire RAM (LRU)]               [Cache Disque Persistant]
        (Texture/Mesh Cache en JS)              (IndexedDB / Cache Storage API)
                    │                                     │
                    │ Hit                                 │ Hit
                    ▼                                     ▼
          Utilisation Directe                   Lecture Binaire Asynchrone
                                                          │ Miss
                                                          ▼
                                                Téléchargement Réseau (Fetch)
                                                          │
                                                Stockage dans IndexedDB
```

### 2.1 Cache Storage API vs. IndexedDB pour les Données 3D
1. **Cache Storage API (Recommandé avec Service Worker)** :
   - Idéal pour intercepter les requêtes HTTP `fetch()` d'assets statiques (`.glb`, `.ktx2`, `.wasm`).
   - Stratégie *Cache-First with Network Fallback* ou *Stale-While-Revalidate*.
2. **IndexedDB (Recommandé pour les projets utilisateurs & créations locales)** :
   - Stocke directement des objets binaires `Blob` ou `ArrayBuffer`.

> [!WARNING]
> **Antipattern Base64** : Ne jamais convertir de fichiers GLB ou textures en chaînes `Base64` pour les stocker dans `localStorage` ou `IndexedDB`. Le décodage Base64 gonfle la taille mémoire de $+33\%$ et engendre des pics de mémoire massifs lors du parsing JSON, provoquant le crash du navigateur.

### 2.2 Gestion des Quotas de Stockage (`StorageManager API`)
Les navigateurs attribuent un quota dynamique (souvent jusqu'à $60\%$ de l'espace disque disponible sur Chrome desktop, mais restreint sur Safari/iOS) :
```typescript
if (navigator.storage && navigator.storage.estimate) {
  const { quota, usage } = await navigator.storage.estimate();
  console.log(`Utilisation : ${(usage! / (1024 * 1024)).toFixed(2)} Mo sur ${(quota! / (1024 * 1024)).toFixed(2)} Mo`);
}
```

---

## 3. Déport sur Web Workers & `OffscreenCanvas`

Pour décharger le thread principal (UI React, interactions DOM) des calculs intensifs (évaluation de graphe, parsing GLTF, décompression Meshopt, physique, génération procédurale de géométrie) :

### 3.1 Transferts Zéro-Copie via `Transferable Objects`
Le transfert classique `postMessage(data)` effectue un clonage structuré en profondeur (*Structured Clone*) qui duplique la mémoire et fige le thread sur les gros buffers.  
L'utilisation des **Transferables** réalise un transfert de propriété instantané en $\mathcal{O}(1)$ sans duplication :

```typescript
// Thread Principal -> Worker :
const vertexBuffer = new Float32Array(1_000_000); // 4 Mo
worker.postMessage({ buffer: vertexBuffer.buffer }, [vertexBuffer.buffer]);
// vertexBuffer.byteLength vaut désormais 0 sur le thread principal (mémoire transférée).
```

### 3.2 Rendu Hors-Thread avec `OffscreenCanvas`
- `canvas.transferControlToOffscreen()` permet de confier l'intégralité du contexte WebGL au Web Worker.
- Les ralentissements du thread principal (ex. ouverture d'une modal, calculs React lourds) n'impactent plus la fluidité du rendu 60/120 fps.

---

## 4. Spécificités & Contraintes par Navigateur

### 4.1 Safari & WebKit (iOS / iPadOS / macOS)
WebKit applique la politique de gestion mémoire la plus agressive de l'industrie :
1. **Limite Mémoire d'Onglet sur iOS** : Un onglet Safari sur iPhone/iPad est généralement contraint entre **300 Mo et 1 Go** de RAM totale. Si cette limite est franchie, le processus WebKit est tué instantanément par le système (*Jetsam event* / crash blanc de page).
2. **Limite de Pixels Canvas** : Un élément `<canvas>` sur iOS Safari ne peut excéder environ **16.7 millions de pixels** (ex. $4096 \times 4096$).
3. **Fuite Mémoire de "Rétention de Canvas" (*Canvas Hoarding Bug*)** : WebKit ne libère pas la mémoire d'un canvas supprimé du DOM s'il n'est pas réinitialisé manuellement.
   ```typescript
   export function releaseCanvasMemory(canvas: HTMLCanvasElement): void {
     canvas.width = 1;
     canvas.height = 1;
     const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
     if (gl) {
       gl.getExtension("WEBGL_lose_context")?.loseContext();
     }
   }
   ```

### 4.2 Google Chrome & Moteurs Chromium (Edge, Opera, Brave)
1. **Couche d'Abstraction ANGLE (Almost Native Graphics Layer Engine)** :
   - Chromium traduit les appels WebGL en DirectX 11/12 (Windows), Metal (macOS) ou Vulkan (Linux).
   - **TDR (Timeout Detection and Recovery)** : Si un shader met plus de $2\text{ secondes}$ à s'exécuter, le pilote graphique Windows redémarre le GPU, déclenchant une perte de contexte WebGL.
2. **Outil interne `chrome://gpu`** : Permet de diagnostiquer les listes noires de pilotes graphiques, l'accélération matérielle et les options ANGLE.

### 4.3 Mozilla Firefox (SpiderMonkey)
1. **Gestion des Contextes Multiples** : Firefox restreint le nombre maximum de contextes WebGL actifs simultanés (généralement 16 par page).
2. **Redimensionnement de Canvas** : Modifier fréquemment `canvas.width` et `canvas.height` entraîne des réallocations de framebuffers internes. Privilégier un dimensionnement stable avec mise à l'échelle CSS (`style.width`).

---

## 5. Gestion et Restauration de la Perte de Contexte WebGL

Une perte de contexte (`webglcontextlost`) survient lors d'une mise en veille, d'un basculement de carte graphique (iGPU $\leftrightarrow$ dGPU), d'un dépassement de mémoire ou d'un redémarrage du pilote.

### Protocole de Résilience :
```typescript
canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault(); // Indique au navigateur que l'application souhaite restaurer le contexte
  console.warn("Contexte WebGL perdu. Mise en pause du moteur.");
  stopAnimationLoop();
}, false);

canvas.addEventListener("webglcontextrestored", () => {
  console.info("Contexte WebGL restauré. Reconstitution des ressources GPU.");
  rebuildRendererAndShaders(); // Réinstancie les textures, buffers et shaders depuis le cache
  resumeAnimationLoop();
}, false);
```

---

## 6. Guide Pratique de Profilage Mémoire (Chrome DevTools)

| Outil DevTools | Ce qu'il mesure | Problème Détecté |
| :--- | :--- | :--- |
| **Memory > Heap Snapshot** | Instantané de tous les objets JS en RAM. | Comparaison de snapshots (Delta) pour repérer les objets non libérés. |
| **Memory > Allocation on Timeline** | Enregistre en direct les allocations mémoire sous forme de barres bleues. | Repérer les fonctions qui allouent des objets en continu pendant le rendu. |
| **Performance > Track Memory** | Courbe d'évolution du Heap JS et des écouteurs d'événements. | Forme en "dent de scie" abrupte indiquant une pression GC excessive. |
| **Chrome Task Manager (`Shift + Esc`)** | Colonne *GPU Memory* vs *Memory Footprint*. | Suivi de l'enveloppe VRAM totale allouée par le processus GPU. |

---

## 🔗 Notes Associées dans la Base de Connaissances
- [[ThreeJS GPU Optimization Synthesis and Production Playbook]]
- [[ThreeJS Optimization and Performance Guide]]
- [[State Management and Multi-Canvas]]
- [[System Invariants and Coding Rules]]
