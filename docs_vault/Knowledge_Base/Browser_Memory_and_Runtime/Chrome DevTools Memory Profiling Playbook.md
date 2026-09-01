# Playbook de Profilage Mémoire avec Chrome DevTools

*Domaine : Diagnostic Mémoire & Outils de Profilage*

---

## 1. Les 3 Modes du Panneau Memory

1. **Heap Snapshot (Instantané du Tas)** :
   - Prendre un snapshot $A$, exécuter une action (ex. ajouter puis supprimer un nœud), prendre un snapshot $B$.
   - Sélectionner la vue **Comparison** pour repérer les objets qui ont un Delta positif et ne sont pas libérés.
2. **Allocation instrumentation on timeline** :
   - Enregistre visuellement les allocations sous forme de barres bleues.
   - Les barres qui restent bleues sans virer au gris indiquent des objets non collectés en continu.
3. **Allocation sampling** :
   - Mesure à faible surcoût CPU pour identifier les fonctions JavaScript responsables des plus gros volumes d'allocations.

---

## 2. Le Gestionnaire des Tâches Chrome (`Shift + Esc`)
- Permet de distinguer la mémoire consommée par le **Processus GPU** (VRAM + contextes graphiques) de celle du **Processus Onglet** (Heap JS + DOM).

---

## 🔗 Notes Associées
- [[Garbage Collection Pauses and Mitigation]]
- [[JavaScript Heap vs GPU VRAM Dual-Stack]]
- [[ThreeJS GPU Optimization Synthesis and Production Playbook]]
