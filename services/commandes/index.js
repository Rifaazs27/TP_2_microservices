const express = require('express');
const client = require('prom-client');
const app = express();

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
const ordersGauge = new client.Gauge({
  name: 'devshop_orders_total_count',
  help: 'Nombre total de commandes en mémoire',
});

register.registerMetric(httpRequestCounter);
register.registerMetric(httpRequestDuration);
register.registerMetric(ordersGauge);

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
  
  ordersGauge.set(orders.length);
  
  // Appel async au service notifications (fire & forget)
  fetch('http://notifications:3004/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: order.id, total: order.total }),
  }).catch(err => console.warn('[commandes] notifications unreachable:', err.message));

  res.status(201).json(order);
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

const PORT = 3003;
app.listen(PORT, () => console.log(`[commandes] http://localhost:${PORT}`));
