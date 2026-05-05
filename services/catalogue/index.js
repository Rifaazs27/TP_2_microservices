const express = require('express');
const client = require('prom-client');
const app = express();

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 3]
});
register.registerMetric(httpRequestCounter);
register.registerMetric(httpRequestDuration);

app.use(express.json());
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

const products = [
  { id: 1, name: 'Clavier mécanique', emoji: '⌨️', price: 89.99, stock: 12 },
  { id: 2, name: 'Souris ergonomique', emoji: '🖱️', price: 49.99, stock: 8 },
  { id: 3, name: 'Écran 27"', emoji: '🖥️', price: 299.99, stock: 5 },
  { id: 4, name: 'Casque audio', emoji: '🎧', price: 129.99, stock: 20 },
  { id: 5, name: 'Hub USB-C', emoji: '🔌', price: 39.99, stock: 15 },
  { id: 6, name: 'Webcam HD', emoji: '📷', price: 69.99, stock: 7 },
];

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'catalogue' }));
app.get('/products', (req, res) => res.json(products));
app.get('/products/:id', (req, res) => {
  const p = products.find(p => p.id === parseInt(req.params.id));
  if (!p) return res.status(404).json({ error: 'Produit introuvable' });
  res.json(p);
});
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.listen(3001, () => console.log('[catalogue] http://localhost:3001'));
