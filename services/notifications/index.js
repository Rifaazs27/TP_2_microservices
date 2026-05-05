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
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

let notifications = [];

app.get('/health', (req, res) => {
  res.json({
    status: "ok",
    service: "notifications",
    uptime: process.uptime(),
    checks: { dataStore: { records: notifications.length } }
  });
});

app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(generateMetrics('notifications', { sent_total: notifications.length }));
});

app.get(['/notifications/stats', '/stats'], (req, res) => {
  const byType = notifications.reduce((acc, n) => {
    acc[n.type] = (acc[n.type] || 0) + 1;
    return acc;
  }, {});
  
  res.json({
    total: notifications.length,
    byType
  });
});

app.get(['/notifications', '/'], (req, res) => {
  const { userId } = req.query;
  const result = userId ? notifications.filter(n => n.userId === userId) : notifications;
  res.json(result);
});

app.post(['/notify', '/'], (req, res) => {
  const { type, userId, orderId } = req.body;
  
  const allowedTypes = ['order_created', 'order_confirmed', 'stock_alert'];
  
  if (!type || !userId || !allowedTypes.includes(type)) {
    logger.warn('Validation failed', { type, userId });
    return res.status(400).json({ 
      error: "Validation failed", 
      message: "Type invalide ou manquant" 
    });
  }

  const notif = { 
    id: `notif-${Date.now()}`, 
    type, 
    userId, 
    orderId, 
    sentAt: new Date().toISOString() 
  };
  
  notifications.push(notif);
  logger.info('Notification created', { type, userId, id: notif.id });
  res.status(201).json(notif);
});


app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message });
  res.status(500).json({ error: 'Internal Server Error' });
});
const PORT = 3004;
const server = app.listen(PORT, () => {
  logger.info('Service started', { port: PORT });
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
