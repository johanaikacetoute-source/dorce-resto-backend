import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import multer from 'multer';

const app = express();

// Render ap bay pò li otomatikman, si w lokal l ap pran 3000
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.resolve('uploads')));

const dataDir = path.resolve('data');
const uploadsDir = path.resolve('uploads');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const dishesPath = path.join(dataDir, 'dishes.json');
const ordersPath = path.join(dataDir, 'orders.json');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'dish-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

const readJSON = (filePath) => {
  if (!fs.existsSync(filePath)) return [];
  const data = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(data || '[]');
};

const writeJSON = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
};

// --- RUTAS PLATOS ---
app.get('/api/dishes', (req, res) => res.json(readJSON(dishesPath)));

app.post('/api/dishes', upload.single('image'), (req, res) => {
  const { name, category, price, description } = req.body;
  let imageUrl = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&auto=format&fit=crop&q=80';
  
  // Sèvi ak URL dinamik Render anplase localhost
  if (req.file) {
    const protocol = req.protocol;
    const host = req.get('host');
    imageUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
  }

  const dishes = readJSON(dishesPath);
  const newDish = { id: Date.now(), name, category, price: Number(price), description: description || '', image: imageUrl, available: true };
  dishes.push(newDish);
  writeJSON(dishesPath, dishes);
  res.status(201).json({ message: 'Plato agregado', dish: newDish });
});

app.put('/api/dishes/:id', upload.single('image'), (req, res) => {
  const { id } = req.params;
  const { name, category, price, description, available } = req.body;
  let dishes = readJSON(dishesPath);
  const index = dishes.findIndex(d => String(d.id) === String(id));
  if (index === -1) return res.status(404).json({ error: 'Plato no encontrado' });

  let imageUrl = dishes[index].image;
  if (req.file) {
    const protocol = req.protocol;
    const host = req.get('host');
    imageUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
  }

  dishes[index] = {
    ...dishes[index],
    name: name || dishes[index].name,
    category: category || dishes[index].category,
    price: price ? Number(price) : dishes[index].price,
    description: description !== undefined ? description : dishes[index].description,
    image: imageUrl,
    available: available !== undefined ? (available === 'true' || available === true) : dishes[index].available
  };
  writeJSON(dishesPath, dishes);
  res.json({ message: 'Plato actualizado', dish: dishes[index] });
});

app.patch('/api/dishes/:id/toggle-available', (req, res) => {
  const { id } = req.params;
  let dishes = readJSON(dishesPath);
  const index = dishes.findIndex(d => String(d.id) === String(id));
  if (index === -1) return res.status(404).json({ error: 'Plato no encontrado' });

  dishes[index].available = !dishes[index].available;
  writeJSON(dishesPath, dishes);
  res.json({ message: 'Estado actualizado', available: dishes[index].available });
});

app.delete('/api/dishes/:id', (req, res) => {
  const { id } = req.params;
  let dishes = readJSON(dishesPath);
  const filtered = dishes.filter(d => String(d.id) !== String(id));
  writeJSON(dishesPath, filtered);
  res.json({ message: 'Plato eliminado' });
});

// --- RUTAS PEDIDOS ---
app.get('/api/orders', (req, res) => res.json(readJSON(ordersPath)));

app.post('/api/orders', (req, res) => {
  const { clientName, address, items, total } = req.body;
  const orders = readJSON(ordersPath);
  const newOrder = {
    id: `ORD-${Date.now()}`,
    clientName,
    address,
    items,
    total,
    status: 'Pending',
    createdAt: new Date().toISOString()
  };
  orders.push(newOrder);
  writeJSON(ordersPath, orders);
  res.status(201).json({ message: 'Pedido registrado', order: newOrder });
});

app.patch('/api/orders/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  let orders = readJSON(ordersPath);
  const index = orders.findIndex(o => String(o.id) === String(id));
  if (index === -1) return res.status(404).json({ error: 'Pedido no encontrado' });

  orders[index].status = status;
  writeJSON(ordersPath, orders);
  res.json({ message: 'Estado del pedido actualizado', order: orders[index] });
});

app.listen(PORT, () => console.log(`🚀 Sèvè Dorce Resto ap mache sou pò: ${PORT}`));
