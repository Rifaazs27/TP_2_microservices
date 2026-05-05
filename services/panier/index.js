const express = require('express');
const client = require('prom-client');
const app = express();
app.use(express.json());

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

register.registerMetric(httpRequestCounter);
register.registerMetric(httpRequestDuration);

app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const route = req.route ? req.route.path : req.path;
    const labels = { method: req.method, route, status_code: res.statusCode, service: 'panier' };
    httpRequestCounter.labels(req.method, route, res.statusCode, 'panier').inc();
    end(labels);
  });
  next();
});

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

let carts = {};

const getOrCreateCart = (userId) => {
  if (!carts[userId]) {
    carts[userId] = {
      userId,
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
  return carts[userId];
};

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'panier' }));

app.get('/:userId', (req, res) => {
  const cart = getOrCreateCart(req.params.userId);
  res.json(cart);
});

app.post('/:userId/items', (req, res) => {
  const { productId, productName, quantity, unitPrice } = req.body;
  if (!productId || !quantity || quantity < 1) {
    return res.status(400).json({ error: 'Données invalides' });
  }

  const cart = getOrCreateCart(req.params.userId);

  const existingItem = cart.items.find(i => i.productId === productId);
  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    cart.items.push({
      itemId: Date.now().toString(),
      productId,
      productName,
      quantity,
      unitPrice
    });
  }

  cart.updatedAt = new Date().toISOString();
  res.status(201).json(cart);
});

app.get('/:userId/summary', (req, res) => {
  const cart = getOrCreateCart(req.params.userId);
  
  const total = cart.items.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
  const itemCount = cart.items.reduce((acc, item) => acc + item.quantity, 0);

  res.json({
    userId: cart.userId,
    itemCount,
    uniqueProducts: cart.items.length,
    total: parseFloat(total.toFixed(2)),
    isEmpty: cart.items.length === 0
  });
});

app.delete('/:userId', (req, res) => {
  const cart = getOrCreateCart(req.params.userId);
  cart.items = [];
  cart.updatedAt = new Date().toISOString();
  res.json(cart);
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

const PORT = 3002;
app.listen(PORT, () => console.log(`[panier] http://localhost:${PORT}`));
