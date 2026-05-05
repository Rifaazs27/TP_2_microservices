const express = require('express');
const logger = require('./logger');
const { metricsMiddleware, generateMetrics } = require('./metrics');
const { validateProduct } = require('./validators'); 
const app = express();

app.use(express.json());
app.use(metricsMiddleware);

// Middleware de Logging JSON (Phase 3)
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

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Données en mémoire
const products = [
  { id: 1, name: "Laptop Pro 15", price: 1299.99, stock: 10, reservedStock: 0, category: "electronics", description: "Ordinateur portable haute performance", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 2, name: "Clavier Mécanique", price: 89.99, stock: 50, reservedStock: 0, category: "accessories", description: "Clavier mécanique RGB", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 3, name: "Écran 4K 27\"", price: 449.99, stock: 15, reservedStock: 0, category: "electronics", description: "Écran 4K 27 pouces", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 4, name: "Souris Ergonomique", price: 59.99, stock: 80, reservedStock: 0, category: "accessories", description: "Souris ergonomique sans fil", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 5, name: "Webcam HD", price: 79.99, stock: 0, reservedStock: 0, category: "electronics", description: "Webcam 1080p", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 6, name: "Hub USB-C 7 ports", price: 49.99, stock: 30, reservedStock: 0, category: "accessories", description: "Hub USB-C multiport", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
];

// --- ROUTES DE SANTÉ ET MÉTRIQUES ---

app.get('/health', (req, res) => {
  const used_mb = Math.round(process.memoryUsage().rss / 1024 / 1024 * 100) / 100;
  const threshold_mb = 400;
  const status = used_mb > threshold_mb ? "degraded" : "ok";

  res.status(status === "ok" ? 200 : 503).json({
    status,
    service: "catalogue",
    version: "1.0.0",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    checks: {
      memory: { status, used_mb, threshold_mb },
      dataStore: { status: "ok", records: products.length }
    }
  });
});

app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(generateMetrics('catalogue', { records_total: products.length }));
});

// --- ROUTES PRODUITS ---

// GET All Products
app.get(['/products', '/'], (req, res) => res.json(products));

// POST Create Product (AJOUTÉ POUR LA PHASE 4.1)
app.post(['/products', '/'], (req, res) => {
  const errors = validateProduct(req.body);

  if (errors.length > 0) {
    logger.warn('Validation failed for new product', { errors });
    return res.status(400).json({ error: "Validation failed", details: errors });
  }

  const newProduct = {
    id: products.length + 1,
    ...req.body,
    stock: req.body.stock || 0,
    reservedStock: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  products.push(newProduct);
  logger.info('Resource created', { id: newProduct.id, name: newProduct.name });
  res.status(201).json(newProduct);
});

// GET Product by ID
app.get(['/products/:id', '/:id'], (req, res) => {
  const p = products.find(p => p.id === parseInt(req.params.id));
  if (!p) {
    logger.warn('Resource not found', { id: req.params.id });
    return res.status(404).json({ error: 'Produit introuvable' });
  }
  res.json(p);
});

// POST Reserve Product
app.post(['/products/:id/reserve', '/:id/reserve'], (req, res) => {
  const { quantity } = req.body;
  const product = products.find(p => p.id === parseInt(req.params.id));

  if (!product) {
    logger.warn('Resource not found', { id: req.params.id });
    return res.status(404).json({ error: 'Produit introuvable' });
  }

  if (typeof quantity !== 'number' || quantity <= 0) {
    logger.warn('Validation failed', { errors: ['Quantité invalide'] });
    return res.status(400).json({ error: 'Quantité invalide' });
  }

  const availableStock = product.stock - product.reservedStock;
  if (availableStock < quantity) {
    logger.warn('Validation failed', { errors: [`Insufficient stock for product ${product.id}`] });
    return res.status(409).json({ 
      message: `Insufficient stock: requested ${quantity}, available ${availableStock}` 
    });
  }

  product.reservedStock += quantity;
  product.updatedAt = new Date().toISOString();
  logger.info('Resource updated', { id: product.id, type: 'reservation', quantity });
  res.json(product);
});

// PATCH Update Product
app.patch(['/products/:id', '/:id'], (req, res) => {
  const product = products.find(p => p.id === parseInt(req.params.id));
  if (!product) return res.status(404).json({ error: 'Produit introuvable' });

  const errors = validateProduct({ ...product, ...req.body });

  if (errors.length > 0) {
    logger.warn('Validation failed', { errors });
    return res.status(400).json({ error: "Validation failed", details: errors });
  }

  Object.assign(product, req.body);
  product.updatedAt = new Date().toISOString();
  logger.info('Resource updated', { id: product.id, type: 'patch' });
  res.json(product);
});

// --- GESTION DES ERREURS (Phase 4.3) ---

app.use((req, res) => {
  logger.warn('Route not found', { method: req.method, path: req.path });
  res.status(404).json({
    error: 'Not Found',
    message: `La route ${req.method} ${req.path} n'existe pas`,
  });
});

app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    path: req.path,
    method: req.method,
  });
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'Une erreur inattendue s\'est produite',
    requestId: Date.now().toString(),
  });
});

// --- SERVEUR & SHUTDOWN (Phase 4.4) ---

const PORT = 3001;
const server = app.listen(PORT, () => {
  logger.info('Service started', { port: PORT });
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed — all connections drained');
    process.exit(0);
  });
  
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
});
