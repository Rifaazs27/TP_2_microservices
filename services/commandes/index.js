const express = require('express');
const logger = require('./logger');
const { metricsMiddleware, generateMetrics } = require('./metrics');
const { validateOrder } = require('./validators');
const { withRetry } = require('./retry');   
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
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

let orders = [];

async function sendNotification(type, userId, orderId) {
  const url = 'http://notifications:3004/notify';
  try {
    await withRetry(
      async () => {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, userId, orderId })
        });
        if (!response.ok) throw new Error(`Status ${response.status}`);
        logger.info('Notification sent', { orderId, userId });
      },
      { maxAttempts: 3, baseDelayMs: 200 }
    );
  } catch (err) {
    logger.error('Notification failed', { error: err.message });
  }
}

app.get('/health', (req, res) => {
  res.json({
    status: "ok",
    service: "commandes",
    uptime: process.uptime(),
    checks: { dataStore: { status: "ok", records: orders.length } }
  });
});

app.get('/metrics', (req, res) => {
  const revenue = orders.reduce((sum, o) => sum + o.total, 0);
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(generateMetrics('commandes', {
    orders_total_count: orders.length,
    revenue_total: revenue
  }));
});

app.get(['/orders/stats', '/stats'], (req, res) => {
  const totalRevenue = orders.reduce((acc, o) => acc + o.total, 0);
  const byStatus = orders.reduce((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});

  res.json({
    total: orders.length,
    totalRevenue: parseFloat(totalRevenue.toFixed(2)),
    byStatus
  });
});

app.get(['/orders', '/'], (req, res) => {
  const { userId } = req.query;
  const result = userId ? orders.filter(o => o.userId === userId) : orders;
  res.json(result);
});

app.post(['/orders', '/'], async (req, res) => {
  const errors = validateOrder(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  const { userId, items, shippingAddress } = req.body;
  const total = items.reduce((sum, i) => sum + (i.unitPrice * i.quantity || 0), 0);
  
  const order = {
    id: `order-${Date.now()}`,
    userId,
    items,
    total: Math.round(total * 100) / 100,
    status: 'pending',
    shippingAddress,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  orders.push(order);
  sendNotification('order_created', order.userId, order.id);
  res.status(201).json(order);
});

app.get(['/orders/:id', '/:id'], (req, res) => {
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Not Found' });
  res.json(order);
});

app.patch(['/orders/:id/status', '/:id/status'], (req, res) => {
  const order = orders.find(o => o.id === req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Not Found' });
  }

  const newStatus = req.body.status ? req.body.status.toString().trim().toLowerCase() : null;
  const currentStatus = order.status.toString().trim().toLowerCase();
  const allowed = ['pending', 'confirmed', 'shipped', 'cancelled'];
  if (!newStatus || !allowed.includes(newStatus) || newStatus === currentStatus) {
    logger.warn('Validation PATCH échouée', { 
      id: order.id, 
      recu: newStatus, 
      actuel: currentStatus 
    });
    return res.status(400).json({ 
      error: "Bad Request", 
      message: "Statut invalide, manquant ou identique au statut actuel" 
    });
  }

  order.status = newStatus;
  order.updatedAt = new Date().toISOString();
  
  logger.info('Status updated successfully', { id: order.id, status: newStatus });
  res.json(order);
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message });
  res.status(500).json({ error: 'Internal Server Error' });
});

const PORT = 3003;
const server = app.listen(PORT, () => {
  logger.info('Service started', { port: PORT });
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
