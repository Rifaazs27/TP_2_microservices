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

let notifications = [];

app.get('/health', (req, res) => {
  const used_mb = Math.round(process.memoryUsage().rss / 1024 / 1024 * 100) / 100;
  const threshold_mb = 400;
  const status = used_mb > threshold_mb ? "degraded" : "ok";

  res.status(status === "ok" ? 200 : 503).json({
    status,
    service: "notifications",
    version: "1.0.0",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    checks: {
      memory: { status, used_mb, threshold_mb },
      dataStore: { status: "ok", records: notifications.length }
    }
  });
});

app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(generateMetrics('notifications', { sent_total: notifications.length }));
});

app.post('/notify', (req, res) => {
  const { type, userId, orderId } = req.body;
  
  if (!type || !userId) {
    logger.warn('Validation failed', { errors: ['type and userId are required'] });
    return res.status(400).json({ error: "Validation failed" });
  }

  const notif = { 
    id: `notif-${Date.now()}`, 
    type, 
    userId, 
    orderId, 
    sentAt: new Date().toISOString() 
  };
  notifications.push(notif);
  
  logger.info('Email sent', { type, userId, id: notif.id });
  res.status(201).json(notif);
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


const PORT = 3004;
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
