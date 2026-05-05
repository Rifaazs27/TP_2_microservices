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

app.use((req, res, next) => {
  res.on('finish', () => {
    const route = req.route ? req.route.path : req.path;
    httpRequestCounter.labels(req.method, route, res.statusCode, 'panier').inc();
  });
  next();
});

// Stockage Phase 2
let carts = {}; 

const getOrCreateCart = (userId) => {
  if (!carts[userId]) {
    carts[userId] = { userId, items: [], updatedAt: new Date().toISOString() };
  }
  return carts[userId];
};

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'panier' }));

// Les routes incluent désormais "/cart" pour matcher la Gateway
app.get('/cart/:userId', (req, res) => {
  res.json(getOrCreateCart(req.params.userId));
});

app.post('/cart/:userId/items', (req, res) => {
  const { productId, productName, quantity, unitPrice } = req.body;
  const cart = getOrCreateCart(req.params.userId);

  // LOGIQUE ANTI-DOUBLON (Phase 2)
  const existingItem = cart.items.find(i => i.productId === productId);
  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    cart.items.push({ itemId: Date.now().toString(), productId, productName, quantity, unitPrice });
  }

  cart.updatedAt = new Date().toISOString();
  res.status(201).json(cart);
});

app.get('/cart/:userId/summary', (req, res) => {
  const cart = getOrCreateCart(req.params.userId);
  const total = cart.items.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
  res.json({
    userId: cart.userId,
    itemCount: cart.items.reduce((acc, item) => acc + item.quantity, 0),
    total: parseFloat(total.toFixed(2)),
    isEmpty: cart.items.length === 0
  });
});

app.delete('/cart/:userId', (req, res) => {
  carts[req.params.userId] = { userId: req.params.userId, items: [], updatedAt: new Date().toISOString() };
  res.json(carts[req.params.userId]);
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.listen(3002, () => console.log('Panier sur 3002'));
