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


const products = [
  { id: 1, name: "Laptop Pro 15", price: 1299.99, stock: 10, reservedStock: 0, category: "electronics", description: "Ordinateur portable haute performance", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 2, name: "Clavier Mécanique", price: 89.99, stock: 50, reservedStock: 0, category: "accessories", description: "Clavier mécanique RGB", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 3, name: "Écran 4K 27\"", price: 449.99, stock: 15, reservedStock: 0, category: "electronics", description: "Écran 4K 27 pouces", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 4, name: "Souris Ergonomique", price: 59.99, stock: 80, reservedStock: 0, category: "accessories", description: "Souris ergonomique sans fil", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 5, name: "Webcam HD", price: 79.99, stock: 0, reservedStock: 0, category: "electronics", description: "Webcam 1080p", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 6, name: "Hub USB-C 7 ports", price: 49.99, stock: 30, reservedStock: 0, category: "accessories", description: "Hub USB-C multiport", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
];



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
      memory: {
        status: used_mb > threshold_mb ? "degraded" : "ok",
        used_mb,
        threshold_mb
      },
      dataStore: {
        status: "ok",
        records: products.length
      }
    }
  });
});

app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(generateMetrics('catalogue', {
    records_total: products.length
  }));
});



app.get(['/products', '/'], (req, res) => res.json(products));

app.get(['/products/:id', '/:id'], (req, res) => {
  const p = products.find(p => p.id === parseInt(req.params.id));
  if (!p) {
    logger.warn('Resource not found', { id: req.params.id });
    return res.status(404).json({ error: 'Produit introuvable' });
  }
  res.json(p);
});

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

app.patch(['/products/:id', '/:id'], (req, res) => {
  const product = products.find(p => p.id === parseInt(req.params.id));
  if (!product) return res.status(404).json({ error: 'Produit introuvable' });

  const { name, price, stock, category } = req.body;


  let errors = [];
  if (price !== undefined && price <= 0) errors.push('Price must be positive');
  if (category !== undefined && !['electronics', 'accessories', 'clothing', 'food', 'other'].includes(category)) errors.push('Invalid category');

  if (errors.length > 0) {
    logger.warn('Validation failed', { errors });
    return res.status(400).json({ error: errors.join(', ') });
  }

  if (name !== undefined) product.name = name;
  if (category !== undefined) product.category = category;
  if (price !== undefined) product.price = price;
  if (stock !== undefined) product.stock = stock;

  product.updatedAt = new Date().toISOString();
  logger.info('Resource updated', { id: product.id, type: 'patch' });
  res.json(product);
});


const PORT = 3001;
app.listen(PORT, () => {
  logger.info('Service started', { port: PORT });
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down');
  process.exit(0);
});
