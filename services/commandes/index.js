const express = require('express');
const logger = require('./logger');
const { validateOrder } = require('./validators');
const { withRetry } = require('./retry');
const { metricsMiddleware, generateMetrics } = require('./metrics');
const app = express();

app.use(express.json());
app.use(metricsMiddleware);

let orders = [];

app.post('/orders', async (req, res, next) => {
  try {
    const errors = validateOrder(req.body);
    if (errors.length > 0) {
      logger.warn('Validation failed', { errors });
      return res.status(400).json({ error: "Validation failed", details: errors });
    }

    const order = { id: `order-${Date.now()}`, ...req.body, status: 'pending' };
    orders.push(order);

    await withRetry(
      async () => {
        const resp = await fetch('http://notifications:3004/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'order_created', userId: order.userId, orderId: order.id })
        });
        if (!resp.ok) throw new Error(`Status ${resp.status}`);
      },
      { onRetry: (attempt, delay) => logger.warn('Retrying notification', { attempt, delay }) }
    ).catch(err => logger.error('External service call failed', { service: 'notifications', error: err.message }));

    res.status(201).json(order);
  } catch (err) { next(err); }
});

app.use((req, res) => {
  logger.warn('Route not found', { method: req.method, path: req.path });
  res.status(404).json({ error: 'Not Found', message: `La route ${req.method} ${req.path} n'existe pas` });
});

app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, path: req.path });
  res.status(500).json({ error: 'Internal Server Error', requestId: Date.now().toString() });
});

const PORT = 3003;
const server = app.listen(PORT, () => logger.info('Service started', { port: PORT }));

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => { process.exit(0); });
  setTimeout(() => { process.exit(1); }, 10000);
});
