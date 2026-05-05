const express = require('express');
const client = require('prom-client');
const app = express();
app.use(express.json());

// --- CONFIGURATION PROMETHEUS ---
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

register.registerMetric(httpRequestCounter);
register.registerMetric(httpRequestDuration);

app.use(express.json());

// Middleware instrumentation
app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const route = req.route ? req.route.path : req.path;
    httpRequestCounter.labels(req.method, route, res.statusCode).inc();
    end({ method: req.method, route, status_code: res.statusCode });
  });
  next();
});

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

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

const PORT = 3002;
app.listen(PORT, () => console.log(`[panier] http://localhost:${PORT}`));
