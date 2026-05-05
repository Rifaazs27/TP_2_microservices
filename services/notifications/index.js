const express = require('express');
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

let notifications = [];

// ── TODO ETUDIANT : instrumenter avec prom-client ──────────────────────────
// const client = require('prom-client');
// Idée : counter de notifications envoyées par type

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'notifications', sent: notifications.length }));

app.post('/notify', (req, res) => {
  const { orderId, total } = req.body;
  if (!orderId) return res.status(400).json({ error: 'orderId requis' });

  const notif = {
    id: notifications.length + 1,
    orderId,
    message: `Commande #${orderId} confirmée — Total : ${total} €`,
    sentAt: new Date().toISOString(),
  };
  notifications.push(notif);
  console.log('[notifications] 📧', notif.message);
  res.status(201).json(notif);
});

app.get('/notifications', (req, res) => res.json(notifications));

// TODO ETUDIANT : exposer GET /metrics

const PORT = 3004;
app.listen(PORT, () => console.log(`[notifications] http://localhost:${PORT}`));
