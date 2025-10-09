// backend/server.js
// no longer in use, prolly gonna delete it later

/*
const express = require('express');
const cors = require('cors');
const db = require('./db'); // <-- your pg Client

const app = express();
const PORT = 3000;

app.use(cors({ origin: 'http://localhost:4200' }));
app.use(express.json());

// Already working:
app.get('/api/db-check', async (_req, res) => {
  try {
    const r = await db.query('SELECT NOW() AS now');
    res.json({ connected: true, time: r.rows[0].now });
  } catch (e) {
    res.status(500).json({ connected: false, error: e.message });
  }
});

// ✅ New: users endpoint
app.get('/api/users', async (_req, res) => {
  try {
    const r = await db.query('SELECT id, name, email FROM users ORDER BY id');
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 API listening on http://localhost:${PORT}`);
});*/
