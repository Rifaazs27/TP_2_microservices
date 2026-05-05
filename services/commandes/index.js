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

let orders = [];
let nextId = 1;

// ── TODO ETUDIANT : instrumenter avec prom-client ──────────────────────────
// const client = require('prom-client');
// Idées : counter commandes créées, histogram montant des commandes...

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'commandes', total: orders.length }));

app.get('/orders', (req, res) => {
  res.json(orders);
});

app.post('/orders', (req, res) => {
  const { items } = req.body;
  if (!items || !items.length)
    return res.status(400).json({ error: 'items requis et non vide' });

  const total = items.reduce((sum, i) => sum + i.price, 0);
  const order = {
    id: nextId++,
    items,
    total: Math.round(total * 100) / 100,
    status: 'confirmée',
    createdAt: new Date().toISOString(),
  };
  orders.push(order);

  // Appel async au service notifications (fire & forget)
  fetch('http://notifications:3004/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: order.id, total: order.total }),
  }).catch(err => console.warn('[commandes] notifications unreachable:', err.message));

  res.status(201).json(order);
});

// TODO ETUDIANT : exposer GET /metrics

const PORT = 3003;
app.listen(PORT, () => console.log(`[commandes] http://localhost:${PORT}`));
