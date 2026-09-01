# Pauses de Garbage Collection & Stratégies d'Évitement

*Domaine : Moteur V8, SpiderMonkey, JavaScriptCore & Temps Réel*

---

## 1. Le Ramasse-Miettes Générationnel
Les moteurs JavaScript partitionnent le Heap en deux zones :
- **Young Generation (Nursery)** : Les objets éphémères y sont alloués. Nettoyage très fréquent et rapide (*Minor GC* $<1\text{ ms}$).
- **Old Generation** : Les objets survivant à plusieurs cycles y sont promus. Le nettoyage (*Major Mark-Sweep / Compact*) est **bloquant** (*Stop-the-World*) et peut figer le thread pendant $10$ à $50\text{ ms}$.

---

## 2. La Règle d'Or du Temps Réel 60 FPS
Pour conserver une fréquence d'affichage fluide de $16.6\text{ ms}$ par image :
- **Ne jamais allouer d'objets temporaires dans la boucle `requestAnimationFrame`** (pas de `new THREE.Vector3()`, `new Array()`, ou `{ x, y }`).
- L'instanciation continue force la promotion d'objets dans la *Old Generation* et déclenche des saccades de *Major GC*.

---

## 🔗 Notes Associées
- [[JavaScript Heap vs GPU VRAM Dual-Stack]]
- [[Object Pooling in 60 FPS Render Loops]]
- [[Chrome DevTools Memory Profiling Playbook]]
