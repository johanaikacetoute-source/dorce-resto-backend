import express from 'express';
import cors from 'cors';
import path from 'path';
import multer from 'multer';
import pkg from 'pg';
const { Pool } = pkg;

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.resolve('uploads')));

// Configuración de la conexión a PostgreSQL con la variable de entorno de Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Función para inicializar las tablas en la base de datos automáticamente al encender
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dishes (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        price NUMERIC NOT NULL,
        description TEXT,
        image TEXT,
        available BOOLEAN DEFAULT TRUE
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id VARCHAR(100) PRIMARY KEY,
        client_name VARCHAR(255) NOT NULL,
        address TEXT NOT NULL,
        items JSONB NOT NULL,
        total NUMERIC NOT NULL,
        status VARCHAR(50) DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("📦 Tablas de PostgreSQL creadas o verificadas con éxito.");
  } catch (err) {
    console.error("Error al inicializar la base de datos:", err);
  }
}
initDB();

const uploadsDir = path.resolve('uploads');
import fs from 'fs';
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'dish-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// --- RUTAS PLATOS ---
app.get('/api/dishes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM dishes ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/dishes', upload.single('image'), async (req, res) => {
  try {
    const { name, category, price, description } = req.body;
    let imageUrl = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&auto=format&fit=crop&q=80';
    
    if (req.file) {
      imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    }

    const query = `
      INSERT INTO dishes (name, category, price, description, image, available) 
      VALUES ($1, $2, $3, $4, $5, true) RETURNING *;
    `;
    const values = [name, category, Number(price), description || '', imageUrl];
    const newDish = await pool.query(query, values);

    res.status(201).json({ message: 'Plato agregado', dish: newDish.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/dishes/:id', upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, price, description, available } = req.body;

    const current = await pool.query('SELECT * FROM dishes WHERE id = \$1', [id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Plato no encontrado' });
    const dish = current.rows[0];

    let imageUrl = dish.image;
    if (req.file) {
      imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    }

    const query = `
      UPDATE dishes 
      SET name = $1, category = $2, price = $3, description = $4, image = $5, available = $6 
      WHERE id = $7 RETURNING *;
    `;
    const values = [
      name || dish.name,
      category || dish.category,
      price ? Number(price) : dish.price,
      description !== undefined ? description : dish.description,
      imageUrl,
      available !== undefined ? (available === 'true' || available === true) : dish.available,
      id
    ];

    const updated = await pool.query(query, values);
    res.json({ message: 'Plato actualizado', dish: updated.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/dishes/:id/toggle-available', async (req, res) => {
  try {
    const { id } = req.params;
    const current = await pool.query('SELECT available FROM dishes WHERE id = \$1', [id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Plato no encontrado' });

    const newStatus = !current.rows[0].available;
    await pool.query('UPDATE dishes SET available = \$1 WHERE id = \$2', [newStatus, id]);

    res.json({ message: 'Estado actualizado', available: newStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/dishes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM dishes WHERE id = \$1', [id]);
    res.json({ message: 'Plato eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- RUTAS PEDIDOS ---
app.get('/api/orders', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const { clientName, address, items, total } = req.body;
    const orderId = `ORD-${Date.now()}`;
    const query = `
      INSERT INTO orders (id, client_name, address, items, total, status) 
      VALUES ($1, $2, $3, $4, $5, 'Pending') RETURNING *;
    `;
    const values = [orderId, clientName, address, JSON.stringify(items), Number(total)];
    const newOrder = await pool.query(query, values);

    res.status(201).json({ message: 'Pedido registrado', order: newOrder.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/orders/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const updated = await pool.query('UPDATE orders SET status = \$1 WHERE id = \$2 RETURNING *;', [status, id]);
    if (updated.rows.length === 0) return res.status(404).json({ error: 'Pedido no encontrado' });

    res.json({ message: 'Estado del pedido actualizado', order: updated.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Sèvè Dorce Resto ap mache sou pò: ${PORT}`));
