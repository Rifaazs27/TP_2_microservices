const express = require('express');
const logger = require('./logger');
const { metricsMiddleware, generateMetrics } = require('./metrics');
const app = express();

app.use(express.json());
app.use(metricsMiddleware);

app.use((req, res, next) => {
  if (req.path === '/health' || req.path === '/metrics') return next();
  const start = Date.now();
  res.on('finish', () => {
    logger.info('Request handled', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: Date.now() - start,
    });
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


app.get('/health', (req, res) => {
  const used_mb = Math.round(process.memoryUsage().rss / 1024 / 1024 * 100) / 100;
  const status = used_mb > 400 ? "degraded" : "ok";
  res.status(status === "ok" ? 200 : 503).json({
    status, service: "panier", uptime: process.uptime(),
    checks: { memory: { used_mb }, dataStore: { records: Object.keys(carts).length } }
  });
});

app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(generateMetrics('panier', { carts_total: Object.keys(carts).length }));
});


// GET Cart
app.get(['/cart/:userId', '/:userId'], (req, res) => {
  const cart = getOrCreateCart(req.params.userId);
  const total = cart.items.reduce((acc, i) => acc + (i.quantity * i.unitPrice), 0);
  const itemCount = cart.items.reduce((acc, i) => acc + i.quantity, 0); // Ajout itemCount
  res.json({ ...cart, total: parseFloat(total.toFixed(2)), itemCount });
});

app.post(['/cart/:userId/items', '/:userId/items'], (req, res) => {
  const { productId, productName, quantity, unitPrice } = req.body;
  
  if (!productId || quantity === undefined || quantity <= 0) {
    logger.warn('Validation failed', { userId: req.params.userId, quantity });
    return res.status(400).json({ error: "Validation failed", details: ["Quantité invalide ou manquante"] });
  }

  const cart = getOrCreateCart(req.params.userId);
  const existingItem = cart.items.find(i => i.productId === productId);
  
  if (existingItem) {
    existingItem.quantity += quantity;
    logger.info('Resource updated', { userId: cart.userId, productId, action: 'increment' });
  } else {
    cart.items.push({ 
      itemId: Date.now().toString(), 
      productId, 
      productName: productName || "Produit inconnu", 
      quantity, 
      unitPrice: unitPrice || 0 
    });
    logger.info('Resource created', { userId: cart.userId, productId });
  }

  cart.updatedAt = new Date().toISOString();
  
  const itemCount = cart.items.reduce((acc, i) => acc + i.quantity, 0);
  res.status(201).json({ ...cart, itemCount });
});

app.get(['/cart/:userId/summary', '/:userId/summary'], (req, res) => {
  const cart = getOrCreateCart(req.params.userId);
  const total = cart.items.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
  const itemCount = cart.items.reduce((acc, item) => acc + item.quantity, 0);
  
  res.json({
    userId: cart.userId,
    itemCount: itemCount,
    uniqueProducts: cart.items.length,
    total: parseFloat(total.toFixed(2)),
    isEmpty: cart.items.length === 0
  });
});

app.delete(['/cart/:userId', '/:userId'], (req, res) => {
  carts[req.params.userId] = { userId: req.params.userId, items: [], updatedAt: new Date().toISOString() };
  res.json(carts[req.params.userId]);
});


app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message });
  res.status(500).json({ error: 'Internal Server Error' });
});

const PORT = 3002;
const server = app.listen(PORT, () => logger.info('Service started', { port: PORT }));

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
