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
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
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
        
        if (!response.ok) {
          throw new Error(`Notification service returned ${response.status}`);
        }
        
        logger.info('Notification sent', { orderId, userId });
      },
      {
        maxAttempts: 3,
        baseDelayMs: 200,
        onRetry: (attempt, delay, error) => 
          logger.warn('Retrying notification', { attempt, delay_ms: Math.round(delay), error })
      }
    );
  } catch (err) {
    logger.error('External service call failed', { 
      service: 'notifications', 
      url: url, 
      error: err.message 
    });
  }
}

app.get('/health', (req, res) => {
  const used_mb = Math.round(process.memoryUsage().rss / 1024 / 1024 * 100) / 100;
  const threshold_mb = 400;
  const status = used_mb > threshold_mb ? "degraded" : "ok";

  res.status(status === "ok" ? 200 : 503).json({
    status,
    service: "commandes",
    version: "1.0.0",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    checks: {
      memory: { status, used_mb, threshold_mb },
      dataStore: { status: "ok", records: orders.length }
    }
  });
});

app.get('/metrics', (req, res) => {
  const activeOrders = orders.filter(o => o.status !== 'cancelled');
  const revenue = activeOrders.reduce((sum, o) => sum + o.total, 0);

  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(generateMetrics('commandes', {
    orders_total_count: orders.length,
    revenue_total: Math.round(revenue * 100) / 100
  }));
});


app.get(['/orders', '/'], (req, res) => {
  const { userId } = req.query;
  if (userId) {
    return res.json(orders.filter(o => o.userId === userId));
  }
  res.json(orders);
});

app.post(['/orders', '/'], async (req, res, next) => {
  try {
    const errors = validateOrder(req.body);

    if (errors.length > 0) {
      logger.warn('Validation failed', { errors });
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const { userId, items, shippingAddress } = req.body;
    const orderId = `order-${Date.now()}`;
    const total = items.reduce((sum, i) => sum + (i.unitPrice * i.quantity || 0), 0);

    const order = {
      id: orderId,
      userId,
      items: items.map(i => ({ ...i, subtotal: Math.round((i.unitPrice * i.quantity) * 100) / 100 })),
      total: Math.round(total * 100) / 100,
      status: 'pending',
      statusHistory: [{ status: 'pending', timestamp: new Date().toISOString() }],
      shippingAddress,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    orders.push(order);
    logger.info('Resource created', { id: orderId }); 

    sendNotification('order_created', order.userId, order.id);

    res.status(201).json(order);
  } catch (err) {
    next(err); 
  }
});


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


const PORT = 3003;
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
