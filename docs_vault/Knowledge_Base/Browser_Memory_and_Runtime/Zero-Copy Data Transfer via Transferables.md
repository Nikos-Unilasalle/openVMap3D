# Transfert Zéro-Copie via `Transferable Objects`

*Domaine : Communication Inter-Threads & Performance Mémoire*

---

## 1. Clonage Structuré vs. Transfert de Propriété

Lors de l'envoi de données entre le thread principal et un Web Worker :
- **Par défaut (`postMessage(data)`)** : Le navigateur effectue un *Structured Clone*, c'est-à-dire une duplication intégrale en mémoire $\mathcal{O}(N)$ qui sature la RAM sur les gros buffers.
- **Avec Transferables (`postMessage(data, [transferables])`)** : Le navigateur transfère instantanément la propriété du pointeur mémoire en $\mathcal{O}(1)$.

```typescript
const vertexBuffer = new Float32Array(5_000_000); // 20 Mo de RAM

// Transfert instantané zéro-copie :
worker.postMessage({ buffer: vertexBuffer.buffer }, [vertexBuffer.buffer]);

// vertexBuffer.byteLength devient 0 sur le thread émetteur (mémoire détachée).
```

### Objets Éligibles aux Transferables :
`ArrayBuffer`, `MessagePort`, `ImageBitmap`, `OffscreenCanvas`, `ReadableStream`, `WritableStream`.

---

## 🔗 Notes Associées
- [[Web Workers and OffscreenCanvas Multi-Threading]]
- [[Browser Memory Management, Caching and WebGL Performance]]
