const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

// config: where is menu-service?
const MENU_URL = process.env.MENU_URL || 'http://localhost:3000';

const orders = {}; // in-memory

// ---- helpers for date-based order numbers ----
const pad = (n, width = 4) => String(n).padStart(width, '0');
const todayKey = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
};

// in-memory per-day counters
const orderCounters = {}; // e.g. { '20251029': 12 }

// create order (customerId is OPTIONAL for now)
app.post('/orders', async (req, res) => {
  try {
    const { customerId = null, items = [], paymentMethod = 'cash' } = req.body;

    // validation: items must be a non-empty array
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items[] required and must be non-empty' });
    }

    // validate items against menu-service
    const validated = [];
    for (const it of items) {
      if (!it.id || !it.qty) {
        return res.status(400).json({ error: 'Each item needs id and qty.' });
      }
      const r = await axios.get(`${MENU_URL}/menu/${it.id}`);
      const menuItem = r.data;
      if (menuItem.available !== true) {
        return res.status(400).json({ error: 'Item ${it.id} not available.' });
      }
      validated.push({ id: it.id, name: menuItem.name, price: menuItem.price, qty: it.qty });
    }

    // compute total
    const total = validated.reduce((sum, x) => sum + x.price * x.qty, 0);

    // generate date-based order number
    const key = todayKey();
    orderCounters[key] = (orderCounters[key] || 0) + 1;
    const orderId = `${key}-${pad(orderCounters[key])}`;

    const order = {
      id: orderId,            // human-friendly date-based id
      customerId,                  // may be null
      items: validated,
      paymentMethod,
      total,
      status: 'CREATED',
      createdAt: new Date().toISOString()
    };

    orders[order.id] = order;
    return res.status(201).json(order);
  } catch (err) {
    if (err.response && err.response.status === 404) {
      return res.status(400).json({ error: 'One or more menu items not found.' });
    }
    console.error(err.message);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// list orders (filter by customerId only if provided)
app.get('/orders', (req, res) => {
  const all = Object.values(orders);
  const { customerId } = req.query;
  const filtered = customerId ? all.filter(o => o.customerId === customerId) : all;
  res.json(filtered);
});

// get order by id
app.get('/orders/:id', (req, res) => {
  const o = orders[req.params.id];
  if (!o) return res.status(404).json({ error: 'not found' });
  res.json(o);
});

// health
app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`order-service running on port ${PORT}, MENU_URL=${MENU_URL}`));
