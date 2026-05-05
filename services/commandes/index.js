const express = require('express');
const client = require('prom-client');
const app = express();

// --- CONFIGURATION PROMETHEUS ---
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'service'],
});
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'service'],
});
const ordersGauge = new client.Gauge({
  name: 'devshop_orders_total_count',
  help: 'Nombre total de commandes actives',
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
    httpRequestCounter.labels(req.method, route, res.statusCode, 'commandes').inc();
    end({ method: req.method, route, status_code: res.statusCode, service: 'commandes' });
  });
  next();
});

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

let orders = [];

// Fonction utilitaire pour notifier
async function sendNotification(type, userId, orderId) {
  try {
    await fetch('http://notifications:3004/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, userId, orderId })
    });
  } catch (err) {
    console.warn(`[commandes] notifications indisponible: ${err.message}`);
  }
}

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'commandes', total: orders.length }));

// --- ROUTES ---


app.get(['/orders/stats', '/stats'], (req, res) => {
  const activeOrders = orders.filter(o => o.status !== 'cancelled');
  const revenue = activeOrders.reduce((sum, o) => sum + o.total, 0);
  
  res.json({
    totalCount: orders.length,
    totalRevenue: Math.round(revenue * 100) / 100,
    activeCount: activeOrders.length
  });
});

app.post(['/orders', '/'], async (req, res) => {
  const { userId, items, shippingAddress } = req.body;

  if (!items || !items.length) {
    return res.status(400).json({ error: 'items requis et non vide' });
  }

  const orderId = `order-${Date.now()}`;
  const total = items.reduce((sum, i) => sum + (i.unitPrice * i.quantity || i.price || 0), 0);

  const order = {
    id: orderId,
    userId: userId || 'guest',
    items,
    total: Math.round(total * 100) / 100,
    status: 'pending',
    shippingAddress: shippingAddress || 'N/A',
    createdAt: new Date().toISOString(),
  };

  orders.push(order);
  ordersGauge.set(orders.length);
  
  sendNotification('order_created', order.userId, order.id);

  res.status(201).json(order);
});

app.get('/orders/stats', (req, res) => {
  const activeOrders = orders.filter(o => o.status !== 'cancelled');
  const revenue = activeOrders.reduce((sum, o) => sum + o.total, 0);
  
  res.json({
    totalCount: orders.length,
    totalRevenue: Math.round(revenue * 100) / 100,
    activeCount: activeOrders.length
  });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

const PORT = 3003;
app.listen(PORT, () => console.log(` [commandes] http://localhost:${PORT}`));
