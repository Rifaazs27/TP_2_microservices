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

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

let notifications = [];

const templates = {
  order_created:   { subject: "Votre commande a été reçue",       message: (d) => `Votre commande #${d.orderId} a bien été enregistrée.` },
  order_confirmed: { subject: "Commande confirmée",               message: (d) => `Votre commande #${d.orderId} est confirmée et en préparation.` },
  order_shipped:   { subject: "Votre commande est en route",      message: (d) => `Votre commande #${d.orderId} a été expédiée !` },
  order_delivered: { subject: "Commande livrée — Merci !",        message: (d) => `Votre commande #${d.orderId} a été livrée. Merci pour votre achat !` },
  order_cancelled: { subject: "Commande annulée",                 message: (d) => `Votre commande #${d.orderId} a été annulée.` },
  low_stock:       { subject: "Alerte stock faible",              message: (d) => `Alerte : le stock de ${d.productName} est faible (${d.stock} unités restantes).` },
};


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
      memory: { status: used_mb > threshold_mb ? "degraded" : "ok", used_mb, threshold_mb },
      dataStore: { status: "ok", records: notifications.length }
    }
  });
});

app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(generateMetrics('notifications', {
    notifications_sent_total: notifications.length
  }));
});


app.post('/notify', (req, res) => {
  const { type, userId, orderId, productName, stock } = req.body;
  const template = templates[type];

  if (!template) {
    logger.warn('Validation failed', { errors: [`Unknown notification type: ${type}`] });
    return res.status(400).json({ 
        error: "Unknown notification type", 
        validTypes: Object.keys(templates) 
    });
  }

  const notif = {
    id: `notif-${Date.now()}`,
    type,
    userId,
    orderId,
    subject: template.subject,
    message: template.message({ orderId, productName, stock }),
    channel: 'email',
    status: 'sent',
    sentAt: new Date().toISOString(),
    metadata: req.body.metadata || {}
  };

  notifications.push(notif);

  logger.info('Email sent', {
    type,
    userId,
    subject: notif.subject
  });

  res.status(201).json(notif);
});

app.get(['/notifications', '/'], (req, res) => {
  let filtered = [...notifications];
  if (req.query.userId) filtered = filtered.filter(n => n.userId === req.query.userId);
  if (req.query.type) filtered = filtered.filter(n => n.type === req.query.type);
  
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;
  
  res.json(filtered.slice(offset, offset + limit));
});

app.get('/notifications/stats', (req, res) => {
  const now = Date.now();
  const oneHourAgo = now - (3600 * 1000);
  const twentyFourHoursAgo = now - (24 * 3600 * 1000);

  const stats = {
    total: notifications.length,
    byType: {},
    byStatus: { sent: notifications.filter(n => n.status === 'sent').length, failed: 0 },
    recentActivity: {
      last1h: notifications.filter(n => new Date(n.sentAt).getTime() > oneHourAgo).length,
      last24h: notifications.filter(n => new Date(n.sentAt).getTime() > twentyFourHoursAgo).length
    }
  };

  Object.keys(templates).forEach(t => {
    stats.byType[t] = notifications.filter(n => n.type === t).length;
  });

  res.json(stats);
});

app.delete('/notifications', (req, res) => {
  notifications = [];
  logger.info('Data store purged');
  res.sendStatus(204);
});

const PORT = 3004;
app.listen(PORT, () => {
  logger.info('Service started', { port: PORT });
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down');
  process.exit(0);
});
