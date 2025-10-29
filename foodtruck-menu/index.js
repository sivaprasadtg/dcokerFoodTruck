// index.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');

const app = express();

// parse JSON bodies
app.use(express.json());

// simple request logger to see incoming method & path
app.use((req, res, next) => {
  console.log(new Date().toISOString(), req.method, req.path, 'body=', req.body);
  next();
});

const db = {};

// List menu
app.get('/menu', (req, res) => {
  res.json(Object.values(db));
});

// Get single item
app.get('/menu/:id', (req, res) => {
  const item = db[req.params.id];
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  res.json(item);
});

// Create item
app.post('/menu', (req, res) => {
  const { name, price, available = true } = req.body;
  if (!name || price == null) return res.status(400).json({ error: 'Name and price required.' });
  const id = uuidv4();
  const item = { id, name, price, available };
  db[id] = item;
  res.status(201).json(item);
});

// Update existing item
app.put('/menu/:id', (req, res) => {
  const id = req.params.id;
  const item = db[id];
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const { name, price, available } = req.body;

  if (name !== undefined) item.name = name;
  if (price !== undefined) item.price = price;
  if (available !== undefined) item.available = available;

  db[id] = item;
  res.json(item);
});

// Delete an existing item
app.delete('/menu/:id', (req, res) => {
  const id = req.params.id;
  if (!db[id]) return res.status(404).json({ error: 'Item not found' });

  delete db[id];
  res.status(204).send();
});


// health
app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`menu-service running on port ${PORT}`));
