const express = require('express');
const logger = require('./logger');
const { metricsMiddleware, generateMetrics } = require('./metrics');
const app = express();

app.use(express.json());
app.use(metricsMiddleware);

// Middleware de Logging JSON
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

let carts = {}; 

const getOrCreateCart = (userId) => {
  if (!carts[userId]) {
    carts[userId] = { userId, items: [], updatedAt: new Date().toISOString() };
  }
  return carts[userId];
};

// --- ROUTES ---
app.get('/health', (req, res) => {
  const used_mb = Math.round(process.memoryUsage().rss / 1024 / 1024 * 100) / 100;
  res.json({
    status: used_mb > 400 ? "degraded" : "ok",
    service: "panier",
    uptime: process.uptime(),
    checks: { memory: { used_mb, threshold_mb: 400 }, dataStore: { records: Object.keys(carts).length } }
  });
});

app.post(['/cart/:userId/items', '/:userId/items'], (req, res) => {
  const { productId, quantity, unitPrice } = req.body;
  
  // Validation simple Phase 4
  const errors = [];
  if (!productId) errors.push("productId: requis");
  if (!Number.isInteger(quantity) || quantity < 1) errors.push("quantity: doit être un entier >= 1");
  
  if (errors.length > 0) {
    logger.warn('Validation failed', { errors });
    return res.status(400).json({ error: "Validation failed", details: errors });
  }

  const cart = getOrCreateCart(req.params.userId);
  const existingItem = cart.items.find(i => i.productId === productId);
  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    cart.items.push({ productId, quantity, unitPrice: unitPrice || 0 });
  }
  cart.updatedAt = new Date().toISOString();
  res.status(201).json(cart);
});

// --- GESTION ERREURS (4.3) ---
app.use((req, res) => {
  logger.warn('Route not found', { method: req.method, path: req.path });
  res.status(404).json({ error: 'Not Found', message: `La route ${req.method} ${req.path} n'existe pas` });
});

app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, path: req.path });
  res.status(500).json({ error: 'Internal Server Error', requestId: Date.now().toString() });
});

// --- SHUTDOWN (4.4) ---
const PORT = 3002;
const server = app.listen(PORT, () => logger.info('Service started', { port: PORT }));

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed — all connections drained');
    process.exit(0);
  });
  setTimeout(() => { process.exit(1); }, 10000);
});
