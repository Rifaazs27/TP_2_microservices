const express = require('express');
const client = require('prom-client');
const app = express();

// --- Configuration Prometheus ---
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'service'], // Ajout du label service
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status_code', 'service'],
  buckets: [0.1, 0.5, 1, 3]
});

register.registerMetric(httpRequestCounter);
register.registerMetric(httpRequestDuration);

// --- Middlewares ---
app.use(express.json());

app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const route = req.route ? req.route.path : req.path;
    const labels = { method: req.method, route, status_code: res.statusCode, service: 'catalogue' };
    httpRequestCounter.labels(req.method, route, res.statusCode, 'catalogue').inc();
    end(labels);
  });
  next();
});

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS'); // Ajout de PATCH
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


app.get('/health', (req, res) => res.json({ status: 'ok', service: 'catalogue' }));

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.get('/products', (req, res) => res.json(products));

app.get('/products/:id', (req, res) => {
  const p = products.find(p => p.id === parseInt(req.params.id));
  if (!p) return res.status(404).json({ error: 'Produit introuvable' });
  res.json(p);
});

app.post('/products/:id/reserve', (req, res) => {
  const { quantity } = req.body;
  const product = products.find(p => p.id === parseInt(req.params.id));

  if (!product) return res.status(404).json({ error: 'Produit introuvable' });
  if (typeof quantity !== 'number' || quantity <= 0) return res.status(400).json({ error: 'Quantité invalide' });

  // Règle métier : Vérifier que stock - reservedStock >= N
  const availableStock = product.stock - product.reservedStock;
  if (availableStock < quantity) {
    return res.status(409).json({ 
      message: `Insufficient stock: requested ${quantity}, available ${availableStock}` 
    });
  }

  product.reservedStock += quantity;
  product.updatedAt = new Date().toISOString();
  res.json(product);
});

app.patch('/products/:id', (req, res) => {
  const product = products.find(p => p.id === parseInt(req.params.id));
  if (!product) return res.status(404).json({ error: 'Produit introuvable' });

  const { name, price, stock, category } = req.body;

  if (name !== undefined) product.name = name;
  if (category !== undefined) product.category = category;
  if (price !== undefined && price > 0) product.price = price;
  if (stock !== undefined && stock >= 0) product.stock = stock;

  product.updatedAt = new Date().toISOString();
  res.json(product);
});

app.listen(3001, () => console.log('📦 [catalogue] running on http://localhost:3001'));
