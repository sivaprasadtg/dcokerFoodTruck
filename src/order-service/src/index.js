require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

// Config
const MENU_URL = process.env.MENU_URL;

// small helper: require critical envs in non-dev
function reqEnv(name) {
  const v = process.env[name];
  if (!v && process.env.NODE_ENV === 'production') {
    throw new Error(`Missing required env: ${name}`);
  }
  return v;
}

// Generte current date in YYYMMDD format
const pad = (n, width = 4) => String(n).padStart(width, '0');
const todayKey = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
};

// Generate next order ID (YYYYMMDD-####) using DB (atomic UPSERT)
async function nextOrderId(client) {
  const key = todayKey();
  const upsert = await client.query(
    `INSERT INTO order_counters(day_key, last_value)
     VALUES ($1, 1)
     ON CONFLICT (day_key)
     DO UPDATE SET last_value = order_counters.last_value + 1
     RETURNING day_key, last_value`,
    [key]
  );
  const val = upsert.rows[0].last_value;
  return `${key}-${pad(val)}`;
}

// Function to validate order ID format
function isValidOrderId(id) {
  // Matches YYYYMMDD-#### (e.g., 20251112-0001)
  return /^\d{8}-\d{4}$/.test(id);
}

// Shared Postgres pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: reqEnv('DB_USER'), //process.env.DB_USER,
  password: reqEnv('DB_PASSWORD'), //process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'foodtruck'
});

// simple request logger to see incoming method & path
app.use((req, res, next) => {
  console.log(new Date().toISOString(), req.method, req.path, 'body=', req.body);
  next();
});

// health
app.get('/orders/health', (_req, res) => res.sendStatus(200));

// POST /orders (create)
app.post('/orders', async (req, res) => {
  const client = await pool.connect();
  try {
    const { customerId = null, items = [], paymentMethod = 'cash' } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items[] required and must be non-empty' });
    }

    // validate items via menu-service
    const validated = [];
    for (const it of items) {
      if (!it.id || !it.qty) {
        return res.status(400).json({ error: 'Each item needs id and qty.' });
      }
      const restCall = await axios.get(`${MENU_URL}/menu/${it.id}`);
      const menuItem = restCall.data;
      if (menuItem.available !== true) {
        return res.status(400).json({ error: `Item ${it.id} not available.` });
      }
      validated.push({ id: it.id, name: menuItem.name, price: menuItem.price, qty: it.qty });
    }

    const total = validated.reduce((sum, x) => sum + x.price * x.qty, 0);

    await client.query('BEGIN');
    const orderId = await nextOrderId(client);

    await client.query('INSERT INTO orders (id, customer_id, items, payment_method, total, status, created_at) VALUES ($1, $2, $3::jsonb, $4, $5, $6, NOW())',
      [orderId, customerId, JSON.stringify(validated), paymentMethod, total, 'CREATED']
    );
    await client.query('COMMIT');

    const restCall2 = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    const row = restCall2.rows[0];
    return res.status(201).json({
      id: row.id,
      customerId: row.customer_id,
      items: row.items,
      paymentMethod: row.payment_method,
      total: Number(row.total),
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  } catch (err) {
    try { await pool.query('ROLLBACK'); } catch {}
    if (err.response && err.response.status === 404) {
      return res.status(400).json({ error: 'One or more menu items not found.' });
    }
    console.error('Create order error:', err.message);
    return res.status(500).json({ error: 'Internal error' });
  } finally {
    client.release();
  }
});

// Reject POST /orders/:anyId
app.post('/orders/:id', (req, res) => {
  return res.status(405).json({
    error: 'Do not specify an ID when creating orders. Use POST /orders instead.'
  });
});

// GET /orders (list; optional ?customerId=)
app.get('/orders', async (req, res) => {
  try {
    const { customerId } = req.query;
    let query = 'SELECT * FROM orders ORDER BY created_at DESC';
    let params = [];

    if (customerId) {
      query = 'SELECT * FROM orders WHERE customer_id = $1 ORDER BY created_at DESC';
      params = [customerId];
    }

    const restCall3 = await pool.query(query, params);
    const out = restCall3.rows.map(row => ({
      id: row.id,
      customerId: row.customer_id,
      items: row.items,
      paymentMethod: row.payment_method,
      total: Number(row.total),
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
    return res.json(out);
  } catch (err) {
    console.error('List orders error:', err.message);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// GET /orders/:id
app.get('/orders/:id', async (req, res) => {
  const id = req.params.id;
  if (!isValidOrderId(id)) {
    return res.status(400).json({ error: 'Invalid order ID format (must be YYYYMMDD-####)' });
  }
  try {
    const restCall4 = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (restCall4.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    const row = restCall4.rows[0];
    return res.json({
      id: row.id,
      customerId: row.customer_id,
      items: row.items,
      paymentMethod: row.payment_method,
      total: Number(row.total),
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  } catch (err) {
    console.error('Get order error:', err.message);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// PUT /orders/:id (partial update)
app.put('/orders/:id', async (req, res) => {
  const id = req.params.id;
  if (!isValidOrderId(id)) {
    return res.status(400).json({ error: 'Invalid order ID format (must be YYYYMMDD-####)' });
  }
  try {
    const orderId = req.params.id;
    const { items, paymentMethod, status } = req.body;

    const currentOrder = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    if (currentOrder.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    const current = currentOrder.rows[0];

    let newItems = current.items;
    let newPayment = paymentMethod ?? current.payment_method;
    let newStatus = status ?? current.status;
    let newTotal = Number(current.total);

    if (items !== undefined) {
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Items[] must be a non-empty array when provided' });
      }
      const revalidated = [];
      for (const it of items) {
        if (!it.id || !it.qty) {
          return res.status(400).json({ error: 'Each item needs id and qty' });
        }
        const restCall5 = await axios.get(`${MENU_URL}/menu/${it.id}`);
        const menuItem = restCall5.data;
        if (menuItem.available !== true) {
          return res.status(400).json({ error: `Item ${it.id} not available` });
        }
        revalidated.push({ id: it.id, name: menuItem.name, price: menuItem.price, qty: it.qty });
      }
      newItems = revalidated;
      newTotal = revalidated.reduce((s, x) => s + x.price * x.qty, 0);
    }

    await pool.query('UPDATE orders SET items = $2::jsonb, payment_method = $3, total = $4, status = $5 WHERE id = $1',
      [orderId, JSON.stringify(newItems), newPayment, newTotal, newStatus]
    );

    const restCall6 = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    const row = restCall6.rows[0];
    return res.json({
      id: row.id,
      customerId: row.customer_id,
      items: row.items,
      paymentMethod: row.payment_method,
      total: Number(row.total),
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  } catch (err) {
    console.error('Update order error:', err.message);
    return res.status(500).json({ error: 'Internal error' });
  }
});

const PORT = Number(process.env.PORT || 4000);
console.log( `port for order service ${process.env.PORT} `);
app.listen(PORT, () => {
  console.log(
    `Order-service running on port ${PORT}, MENU_URL=${MENU_URL}, DB=${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`
  );
});
