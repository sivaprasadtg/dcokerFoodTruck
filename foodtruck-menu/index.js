// index.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');

const app = express();

// parse JSON bodies
app.use(express.json());

// ---- Configuration ----
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://food:foodpw@localhost:5432/foodtruck';
const pool = new Pool({ connectionString: DATABASE_URL });

// simple request logger to see incoming method & path
app.use((req, res, next) => {
  console.log(new Date().toISOString(), req.method, req.path, 'body=', req.body);
  next();
});

// List menu
app.get('/menu', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM menu ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('List menu error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Get single item
app.get('/menu/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM menu WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Item not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get menu item error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Create item
app.post('/menu', async (req, res) => {
  try {
    const { name, price, available = true } = req.body;

    if (!name || price == null) {
      return res.status(400).json({ error: 'Name and price required.' });
    }

    const id = uuidv4();
    await pool.query('INSERT INTO menu (id, name, price, available, created_at) VALUES ($1, $2, $3, $4, NOW())',
      [id, name, price, available]
    );

    const result = await pool.query('SELECT * FROM menu WHERE id = $1', [id]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create menu item error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Update existing item
app.put('/menu/:id', async (req, res) => {
  try {
    const { name, price, available } = req.body;
    const id = req.params.id;

    const result = await pool.query('SELECT * FROM menu WHERE id = $1', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Item not found.' });

    const current = result.rows[0];
    const newName = name ?? current.name;
    const newPrice = price ?? current.price;
    const newAvailable = available ?? current.available;

    await pool.query('UPDATE menu SET name = $2, price = $3, available = $4 WHERE id = $1',
      [id, newName, newPrice, newAvailable]
    );

    const updated = await pool.query('SELECT * FROM menu WHERE id = $1', [id]);
    res.json(updated.rows[0]);
  } catch (err) {
    console.error('Update menu item error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Delete an existing item
app.delete('/menu/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const result = await pool.query('DELETE FROM menu WHERE id = $1', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Item not found.' });
    res.status(204).send();
  } catch (err) {
    console.error('Delete menu item error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});


// health
app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Menu-service running on port ${PORT}`));
);