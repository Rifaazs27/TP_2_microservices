const express = require('express');
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Stockage en mémoire (pas de DB pour simplifier)
let cart = [];

// ── TODO ETUDIANT : instrumenter avec prom-client ──────────────────────────
// const client = require('prom-client');
// ...

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'panier', items: cart.length }));

app.get('/cart', (req, res) => {
  // TODO : incrémenter un counter
  res.json(cart);
});

app.post('/cart', (req, res) => {
  const { productId, name, price } = req.body;
  if (!productId || !name || price === undefined)
    return res.status(400).json({ error: 'productId, name et price requis' });
  cart.push({ productId, name, price });
  res.status(201).json({ message: 'Ajouté', cart });
});

app.delete('/cart/:productId', (req, res) => {
  const id = parseInt(req.params.productId);
  const idx = cart.findIndex(i => i.productId === id);
  if (idx === -1) return res.status(404).json({ error: 'Article introuvable' });
  cart.splice(idx, 1);
  res.json({ message: 'Supprimé', cart });
});

app.delete('/cart', (req, res) => {
  cart = [];
  res.json({ message: 'Panier vidé' });
});

// TODO ETUDIANT : exposer GET /metrics

const PORT = 3002;
app.listen(PORT, () => console.log(`[panier] http://localhost:${PORT}`));
