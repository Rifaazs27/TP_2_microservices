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

const products = [
  { id: 1, name: 'Clavier mécanique', emoji: '⌨️', price: 89.99, stock: 12 },
  { id: 2, name: 'Souris ergonomique', emoji: '🖱️', price: 49.99, stock: 8 },
  { id: 3, name: 'Écran 27"',          emoji: '🖥️', price: 299.99, stock: 5 },
  { id: 4, name: 'Casque audio',        emoji: '🎧', price: 129.99, stock: 20 },
  { id: 5, name: 'Hub USB-C',           emoji: '🔌', price: 39.99, stock: 15 },
  { id: 6, name: 'Webcam HD',           emoji: '📷', price: 69.99, stock: 7 },
];

// ── TODO ETUDIANT : instrumenter avec prom-client ──────────────────────────
// const client = require('prom-client');
// ...

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'catalogue' }));

app.get('/products', (req, res) => {
  // TODO : incrémenter un counter de requêtes
  res.json(products);
});

app.get('/products/:id', (req, res) => {
  const p = products.find(p => p.id === parseInt(req.params.id));
  if (!p) return res.status(404).json({ error: 'Produit introuvable' });
  res.json(p);
});

// TODO ETUDIANT : exposer GET /metrics

const PORT = 3001;
app.listen(PORT, () => console.log(`[catalogue] http://localhost:${PORT}`));
