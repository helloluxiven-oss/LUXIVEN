/**
 * LUXIVEN — Full-Stack Server (NeDB embedded database)
 * No MongoDB install needed — runs entirely in Node.js
 * Data persists in ./data/*.db files
 */
require('dotenv').config({ path: '.env.local' });

const express      = require('express');
const path         = require('path');
const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const Datastore    = require('@seald-io/nedb');

const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'luxiven-dev-secret-2024';

// ── Embedded Databases ──────────────────────────────────────────
const fs = require('fs');
if (!fs.existsSync('./data')) fs.mkdirSync('./data');

const DB = {
  users:      new Datastore({ filename: './data/users.db',      autoload: true }),
  products:   new Datastore({ filename: './data/products.db',   autoload: true }),
  orders:     new Datastore({ filename: './data/orders.db',     autoload: true }),
  carts:      new Datastore({ filename: './data/carts.db',      autoload: true }),
  reviews:    new Datastore({ filename: './data/reviews.db',    autoload: true }),
  newsletter: new Datastore({ filename: './data/newsletter.db', autoload: true }),
};

// Indexes
DB.users.ensureIndex({ fieldName: 'email', unique: true });
DB.products.ensureIndex({ fieldName: 'slug', unique: true });
DB.orders.ensureIndex({ fieldName: 'orderNumber', unique: true });
DB.newsletter.ensureIndex({ fieldName: 'email', unique: true });

// ── DB helpers (promisified) ─────────────────────────────────────
const db = {
  find:    (store, q={}) => new Promise((res,rej) => store.find(q, (e,d) => e?rej(e):res(d))),
  findOne: (store, q)    => new Promise((res,rej) => store.findOne(q, (e,d) => e?rej(e):res(d))),
  insert:  (store, doc)  => new Promise((res,rej) => store.insert(doc, (e,d) => e?rej(e):res(d))),
  update:  (store, q, u, opts={}) => new Promise((res,rej) => store.update(q, u, opts, (e,n,d) => e?rej(e):res(d))),
  remove:  (store, q, opts={}) => new Promise((res,rej) => store.remove(q, opts, (e,n) => e?rej(e):res(n))),
  count:   (store, q={}) => new Promise((res,rej) => store.count(q, (e,n) => e?rej(e):res(n))),
};

// ── Middleware ───────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Request logger
app.use((req, res, next) => {
  console.log(`${new Date().toISOString().slice(11,19)} ${req.method} ${req.path}`);
  next();
});

// ── Auth middleware ──────────────────────────────────────────────
async function protect(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ success: false, message: 'Not authenticated.' });
  try {
    const decoded = jwt.verify(header.split(' ')[1], JWT_SECRET);
    const user    = await db.findOne(DB.users, { _id: decoded.id });
    if (!user) return res.status(401).json({ success: false, message: 'User not found.' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin')
    return res.status(403).json({ success: false, message: 'Admin access required.' });
  next();
}

function signToken(id) {
  return jwt.sign({ id }, JWT_SECRET, { expiresIn: '7d' });
}

function safe(user) {
  const u = { ...user };
  delete u.password;
  return u;
}

// ══════════════════════════════════════════════
//  ROUTES
// ══════════════════════════════════════════════

// ── Health ───────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  const counts = {
    users:    await db.count(DB.users),
    products: await db.count(DB.products),
    orders:   await db.count(DB.orders),
  };
  res.json({ success: true, status: 'Luxiven API running ✓', counts, timestamp: new Date().toISOString() });
});

// ── AUTH ─────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;
    if (!firstName || !lastName || !email || !password)
      return res.status(422).json({ success: false, message: 'All fields required.' });
    if (password.length < 8)
      return res.status(422).json({ success: false, message: 'Password min 8 characters.' });

    const exists = await db.findOne(DB.users, { email: email.toLowerCase() });
    if (exists) return res.status(409).json({ success: false, message: 'Email already registered.' });

    const hashed = await bcrypt.hash(password, 12);
    const user   = await db.insert(DB.users, {
      firstName, lastName, email: email.toLowerCase(),
      password: hashed, role: 'customer',
      isVerified: true, isActive: true,
      wishlist: [], addresses: [],
      createdAt: new Date(), lastLogin: new Date(),
    });

    res.status(201).json({ success: true, token: signToken(user._id), user: safe(user) });
  } catch (err) {
    if (err.errorType === 'uniqueViolated')
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(422).json({ success: false, message: 'Email and password required.' });

    const user = await db.findOne(DB.users, { email: email.toLowerCase() });
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    if (!user.isActive)
      return res.status(403).json({ success: false, message: 'Account suspended.' });

    await db.update(DB.users, { _id: user._id }, { $set: { lastLogin: new Date() } });
    res.json({ success: true, token: signToken(user._id), user: safe(user) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/auth/me', protect, (req, res) => {
  res.json({ success: true, user: safe(req.user) });
});

app.post('/api/auth/change-password', protect, async (req, res) => {
  try {
    const { current, newPassword } = req.body;
    if (!(await bcrypt.compare(current, req.user.password)))
      return res.status(401).json({ success: false, message: 'Current password incorrect.' });
    const hashed = await bcrypt.hash(newPassword, 12);
    await db.update(DB.users, { _id: req.user._id }, { $set: { password: hashed } });
    res.json({ success: true, message: 'Password updated.' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── PRODUCTS ─────────────────────────────────────────────────────
app.get('/api/products', async (req, res) => {
  try {
    const { category, minPrice, maxPrice, featured, badge, search, sort = '-createdAt', page = 1, limit = 12 } = req.query;
    let query = { isActive: true, isDeleted: { $ne: true } };
    if (category) query.category = category;
    if (featured === 'true') query.isFeatured = true;
    if (badge) query.badge = badge;
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    let products = await db.find(DB.products, query);

    // Search filter (in-memory)
    if (search) {
      const s = search.toLowerCase();
      products = products.filter(p =>
        p.name.toLowerCase().includes(s) ||
        (p.description||'').toLowerCase().includes(s) ||
        (p.tags||[]).some(t => t.toLowerCase().includes(s))
      );
    }

    // Sort
    const [sortField, sortDir] = sort.startsWith('-') ? [sort.slice(1), -1] : [sort, 1];
    products.sort((a, b) => ((a[sortField] || 0) > (b[sortField] || 0) ? sortDir : -sortDir));

    // Pagination
    const total = products.length;
    const skip  = (Number(page) - 1) * Number(limit);
    products    = products.slice(skip, skip + Number(limit));

    res.json({ success: true, data: products, pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/products/featured', async (req, res) => {
  try {
    const products = await db.find(DB.products, { isFeatured: true, isActive: true, isDeleted: { $ne: true } });
    res.json({ success: true, data: products.slice(0, 8) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/products/categories', async (req, res) => {
  try {
    const products = await db.find(DB.products, { isActive: true });
    const cats     = {};
    products.forEach(p => { cats[p.category] = (cats[p.category] || 0) + 1; });
    const data     = Object.entries(cats).map(([_id, count]) => ({ _id, count })).sort((a,b) => b.count - a.count);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/products/:slug', async (req, res) => {
  try {
    const product = await db.findOne(DB.products, { slug: req.params.slug, isActive: true });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });
    await db.update(DB.products, { _id: product._id }, { $inc: { viewCount: 1 } });
    const related = (await db.find(DB.products, { category: product.category, isActive: true }))
      .filter(p => p._id !== product._id).slice(0, 4);
    res.json({ success: true, data: product, related });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/products', protect, adminOnly, async (req, res) => {
  try {
    const product = await db.insert(DB.products, {
      ...req.body, isActive: true, isDeleted: false,
      viewCount: 0, soldCount: 0,
      reviewSummary: { average: 0, count: 0 },
      createdAt: new Date(), updatedAt: new Date(),
    });
    res.status(201).json({ success: true, data: product });
  } catch (err) {
    if (err.errorType === 'uniqueViolated')
      return res.status(409).json({ success: false, message: 'Slug already exists.' });
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/products/:id', protect, adminOnly, async (req, res) => {
  try {
    await db.update(DB.products, { _id: req.params.id }, { $set: { ...req.body, updatedAt: new Date() } });
    const product = await db.findOne(DB.products, { _id: req.params.id });
    res.json({ success: true, data: product });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.delete('/api/products/:id', protect, adminOnly, async (req, res) => {
  try {
    await db.update(DB.products, { _id: req.params.id }, { $set: { isDeleted: true, isActive: false } });
    res.json({ success: true, message: 'Product deleted.' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── CART ─────────────────────────────────────────────────────────
async function getCart(req) {
  const query = req.user ? { userId: req.user._id } : { sessionId: req.headers['x-session-id'] || 'guest' };
  let cart    = await db.findOne(DB.carts, query);
  if (!cart)  cart = await db.insert(DB.carts, { ...query, items: [], discount: 0, couponCode: null, createdAt: new Date() });
  return cart;
}

app.get('/api/cart', async (req, res) => {
  try {
    // optional auth
    if (req.headers.authorization?.startsWith('Bearer ')) {
      try { const d=jwt.verify(req.headers.authorization.split(' ')[1], JWT_SECRET); req.user=await db.findOne(DB.users,{_id:d.id}); } catch(_){}
    }
    const cart = await getCart(req);
    // populate product info
    const populated = await Promise.all((cart.items||[]).map(async item => {
      const product = await db.findOne(DB.products, { _id: item.productId });
      return { ...item, product };
    }));
    res.json({ success: true, data: { ...cart, items: populated } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/cart/add', async (req, res) => {
  try {
    if (req.headers.authorization?.startsWith('Bearer ')) {
      try { const d=jwt.verify(req.headers.authorization.split(' ')[1], JWT_SECRET); req.user=await db.findOne(DB.users,{_id:d.id}); } catch(_){}
    }
    const { productId, quantity = 1, variant } = req.body;
    const product = await db.findOne(DB.products, { _id: productId });
    if (!product || !product.isActive)
      return res.status(404).json({ success: false, message: 'Product not found.' });

    const cart  = await getCart(req);
    const items = [...(cart.items || [])];
    const idx   = items.findIndex(i => i.productId === productId && i.variant === (variant||null));

    if (idx > -1) {
      items[idx].quantity = Math.min(items[idx].quantity + quantity, product.stock || 99);
    } else {
      items.push({ _id: uuid(), productId, quantity, variant: variant||null, price: product.price, name: product.name });
    }

    await db.update(DB.carts, { _id: cart._id }, { $set: { items } });
    res.json({ success: true, message: 'Added to cart.', itemCount: items.reduce((s,i)=>s+i.quantity,0) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.put('/api/cart/update', async (req, res) => {
  try {
    if (req.headers.authorization?.startsWith('Bearer ')) {
      try { const d=jwt.verify(req.headers.authorization.split(' ')[1], JWT_SECRET); req.user=await db.findOne(DB.users,{_id:d.id}); } catch(_){}
    }
    const { itemId, quantity } = req.body;
    const cart  = await getCart(req);
    let   items = [...(cart.items||[])];
    if (quantity <= 0) items = items.filter(i => i._id !== itemId);
    else { const idx = items.findIndex(i => i._id === itemId); if (idx>-1) items[idx].quantity = quantity; }
    await db.update(DB.carts, { _id: cart._id }, { $set: { items } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.delete('/api/cart/remove/:itemId', async (req, res) => {
  try {
    if (req.headers.authorization?.startsWith('Bearer ')) {
      try { const d=jwt.verify(req.headers.authorization.split(' ')[1], JWT_SECRET); req.user=await db.findOne(DB.users,{_id:d.id}); } catch(_){}
    }
    const cart  = await getCart(req);
    const items = (cart.items||[]).filter(i => i._id !== req.params.itemId);
    await db.update(DB.carts, { _id: cart._id }, { $set: { items } });
    res.json({ success: true, message: 'Item removed.' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.delete('/api/cart/clear', async (req, res) => {
  try {
    if (req.headers.authorization?.startsWith('Bearer ')) {
      try { const d=jwt.verify(req.headers.authorization.split(' ')[1], JWT_SECRET); req.user=await db.findOne(DB.users,{_id:d.id}); } catch(_){}
    }
    const cart = await getCart(req);
    await db.update(DB.carts, { _id: cart._id }, { $set: { items: [], discount: 0, couponCode: null } });
    res.json({ success: true, message: 'Cart cleared.' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/cart/coupon', async (req, res) => {
  try {
    if (req.headers.authorization?.startsWith('Bearer ')) {
      try { const d=jwt.verify(req.headers.authorization.split(' ')[1], JWT_SECRET); req.user=await db.findOne(DB.users,{_id:d.id}); } catch(_){}
    }
    const COUPONS = { 'LUXIVEN10': 10, 'WELCOME20': 20, 'VIP30': 30 };
    const code    = (req.body.code||'').toUpperCase();
    const discount = COUPONS[code];
    if (!discount) return res.status(400).json({ success: false, message: 'Invalid coupon code.' });
    const cart = await getCart(req);
    await db.update(DB.carts, { _id: cart._id }, { $set: { couponCode: code, discount } });
    res.json({ success: true, message: `${discount}% discount applied!`, discount });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── ORDERS ───────────────────────────────────────────────────────
app.post('/api/orders', async (req, res) => {
  try {
    if (req.headers.authorization?.startsWith('Bearer ')) {
      try { const d=jwt.verify(req.headers.authorization.split(' ')[1], JWT_SECRET); req.user=await db.findOne(DB.users,{_id:d.id}); } catch(_){}
    }
    const { shippingAddress, billingAddress, paymentMethod='cod', notes, guestEmail } = req.body;
    const cart = await getCart(req);
    if (!(cart.items||[]).length)
      return res.status(400).json({ success: false, message: 'Cart is empty.' });

    // Build items + verify products exist
    const items = [];
    let subtotal = 0;
    for (const item of cart.items) {
      const prod = await db.findOne(DB.products, { _id: item.productId });
      if (!prod || !prod.isActive)
        return res.status(400).json({ success: false, message: `"${item.name}" is no longer available.` });
      items.push({ productId: prod._id, name: prod.name, image: prod.images?.[0], price: item.price, quantity: item.quantity, variant: item.variant });
      subtotal += item.price * item.quantity;
    }

    const discAmt  = cart.discount > 0 ? Math.round(subtotal * cart.discount / 100) : 0;
    const shipping  = subtotal >= 200 ? 0 : 15;
    const tax       = Math.round((subtotal - discAmt) * 0.08 * 100) / 100;
    const total     = Math.round((subtotal - discAmt + shipping + tax) * 100) / 100;
    const orderNum  = 'LUX-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2,5).toUpperCase();

    const order = await db.insert(DB.orders, {
      orderNumber: orderNum,
      userId: req.user?._id, guestEmail: guestEmail || req.user?.email,
      items, shippingAddress,
      billingAddress: billingAddress || shippingAddress,
      subtotal, shipping, tax, discount: discAmt, couponCode: cart.couponCode,
      total, paymentMethod,
      paymentStatus: paymentMethod === 'cod' ? 'pending' : 'paid',
      status: 'confirmed', notes,
      timeline: [{ status: 'confirmed', note: 'Order placed and confirmed.', at: new Date() }],
      createdAt: new Date(), updatedAt: new Date(),
    });

    // Decrement stock
    for (const item of items) {
      await db.update(DB.products, { _id: item.productId }, { $inc: { stock: -item.quantity, soldCount: item.quantity } });
    }

    // Clear cart
    await db.update(DB.carts, { _id: cart._id }, { $set: { items: [], discount: 0, couponCode: null } });

    res.status(201).json({ success: true, data: order });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/orders/my', protect, async (req, res) => {
  try {
    const orders = await db.find(DB.orders, { userId: req.user._id });
    orders.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, data: orders });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/orders/track/:orderNumber', async (req, res) => {
  try {
    const order = await db.findOne(DB.orders, { orderNumber: req.params.orderNumber });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    const { email } = req.query;
    if (email && order.guestEmail?.toLowerCase() !== email.toLowerCase())
      return res.status(403).json({ success: false, message: 'Email does not match order.' });
    res.json({ success: true, data: { orderNumber: order.orderNumber, status: order.status, paymentStatus: order.paymentStatus, trackingNumber: order.trackingNumber, items: order.items, total: order.total, timeline: order.timeline, createdAt: order.createdAt } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/orders/:id', protect, async (req, res) => {
  try {
    const order = await db.findOne(DB.orders, { _id: req.params.id, userId: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    res.json({ success: true, data: order });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/orders/:id/cancel', protect, async (req, res) => {
  try {
    const order = await db.findOne(DB.orders, { _id: req.params.id, userId: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    if (!['pending','confirmed'].includes(order.status))
      return res.status(400).json({ success: false, message: 'Cannot cancel at this stage.' });
    const timeline = [...(order.timeline||[]), { status:'cancelled', note:'Cancelled by customer.', at: new Date() }];
    await db.update(DB.orders, { _id: order._id }, { $set: { status:'cancelled', cancelledAt: new Date(), cancelReason: req.body.reason||'Customer request', timeline } });
    for (const item of order.items)
      await db.update(DB.products, { _id: item.productId }, { $inc: { stock: item.quantity, soldCount: -item.quantity } });
    res.json({ success: true, message: 'Order cancelled.' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── REVIEWS ───────────────────────────────────────────────────────
app.get('/api/reviews/product/:productId', async (req, res) => {
  try {
    const reviews = await db.find(DB.reviews, { productId: req.params.productId, isApproved: true });
    reviews.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    // attach user names
    const populated = await Promise.all(reviews.slice(0,20).map(async r => {
      const user = await db.findOne(DB.users, { _id: r.userId });
      return { ...r, user: user ? { firstName: user.firstName, lastName: user.lastName } : null };
    }));
    res.json({ success: true, data: populated });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/reviews', protect, async (req, res) => {
  try {
    const { productId, rating, title, body } = req.body;
    if (!productId || !rating) return res.status(422).json({ success: false, message: 'Product and rating required.' });
    const exists = await db.findOne(DB.reviews, { productId, userId: req.user._id });
    if (exists) return res.status(409).json({ success: false, message: 'You have already reviewed this product.' });
    const review = await db.insert(DB.reviews, { productId, userId: req.user._id, rating: Number(rating), title, body, isApproved: true, verified: false, helpful: 0, createdAt: new Date() });
    // update product average
    const allReviews = await db.find(DB.reviews, { productId, isApproved: true });
    const avg = allReviews.reduce((s,r)=>s+r.rating,0)/allReviews.length;
    await db.update(DB.products, { _id: productId }, { $set: { 'reviewSummary.average': Math.round(avg*10)/10, 'reviewSummary.count': allReviews.length } });
    res.status(201).json({ success: true, data: review });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── WISHLIST ──────────────────────────────────────────────────────
app.get('/api/wishlist', protect, async (req, res) => {
  try {
    const user     = await db.findOne(DB.users, { _id: req.user._id });
    const wishlist = await Promise.all((user.wishlist||[]).map(id => db.findOne(DB.products, { _id: id })));
    res.json({ success: true, data: wishlist.filter(Boolean) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/wishlist/:productId', protect, async (req, res) => {
  try {
    const user = await db.findOne(DB.users, { _id: req.user._id });
    const list = [...(user.wishlist||[])];
    const idx  = list.indexOf(req.params.productId);
    let action;
    if (idx === -1) { list.push(req.params.productId); action='added'; }
    else            { list.splice(idx,1);               action='removed'; }
    await db.update(DB.users, { _id: req.user._id }, { $set: { wishlist: list } });
    res.json({ success: true, action, message: action==='added'?'Added to wishlist.':'Removed from wishlist.' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── USERS ─────────────────────────────────────────────────────────
app.get('/api/users/profile', protect, (req, res) => res.json({ success: true, data: safe(req.user) }));

app.put('/api/users/profile', protect, async (req, res) => {
  try {
    const allowed = ['firstName','lastName','phone','avatar'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    await db.update(DB.users, { _id: req.user._id }, { $set: updates });
    const user = await db.findOne(DB.users, { _id: req.user._id });
    res.json({ success: true, data: safe(user) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/users/addresses', protect, async (req, res) => {
  try {
    const user    = await db.findOne(DB.users, { _id: req.user._id });
    const addresses = [...(user.addresses||[])];
    if (req.body.isDefault) addresses.forEach(a => { a.isDefault = false; });
    addresses.push({ _id: uuid(), ...req.body });
    await db.update(DB.users, { _id: req.user._id }, { $set: { addresses } });
    res.status(201).json({ success: true, data: addresses });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── NEWSLETTER ────────────────────────────────────────────────────
app.post('/api/newsletter/subscribe', async (req, res) => {
  try {
    const email = (req.body.email||'').toLowerCase().trim();
    if (!email) return res.status(422).json({ success: false, message: 'Email required.' });
    const existing = await db.findOne(DB.newsletter, { email });
    if (existing) {
      if (existing.isActive) return res.json({ success: true, message: 'Already subscribed!' });
      await db.update(DB.newsletter, { email }, { $set: { isActive: true } });
      return res.json({ success: true, message: 'Resubscribed successfully.' });
    }
    await db.insert(DB.newsletter, { email, firstName: req.body.firstName, isActive: true, createdAt: new Date() });
    res.status(201).json({ success: true, message: 'Subscribed! Welcome to the Inner Circle.' });
  } catch (err) {
    if (err.errorType === 'uniqueViolated')
      return res.json({ success: true, message: 'Already subscribed!' });
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── ADMIN DASHBOARD ───────────────────────────────────────────────
app.get('/api/admin/dashboard', protect, adminOnly, async (req, res) => {
  try {
    const now        = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [allOrders, allUsers, allProducts, allSubscribers] = await Promise.all([
      db.find(DB.orders, {}),
      db.find(DB.users, { role: 'customer' }),
      db.find(DB.products, { isActive: true }),
      db.find(DB.newsletter, { isActive: true }),
    ]);

    const paidOrders    = allOrders.filter(o => o.paymentStatus === 'paid');
    const monthOrders   = paidOrders.filter(o => new Date(o.createdAt) >= monthStart);
    const totalRevenue  = paidOrders.reduce((s,o) => s+o.total, 0);
    const monthRevenue  = monthOrders.reduce((s,o) => s+o.total, 0);
    const pendingOrders = allOrders.filter(o => o.status === 'pending');
    const lowStock      = allProducts.filter(p => (p.stock||0) <= (p.lowStockAt||5));

    const recentOrders  = allOrders.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,8);
    const topProducts   = [...allProducts].sort((a,b)=>(b.soldCount||0)-(a.soldCount||0)).slice(0,5);

    // Sales by day (last 30 days)
    const since30  = new Date(Date.now() - 30*24*60*60*1000);
    const salesMap = {};
    paidOrders.filter(o=>new Date(o.createdAt)>=since30).forEach(o => {
      const d = new Date(o.createdAt).toISOString().slice(0,10);
      if (!salesMap[d]) salesMap[d] = { revenue:0, orders:0 };
      salesMap[d].revenue += o.total; salesMap[d].orders++;
    });
    const salesByDay = Object.entries(salesMap).sort((a,b)=>a[0]>b[0]?1:-1).map(([_id,v])=>({_id,...v}));

    res.json({
      success: true,
      data: {
        stats: {
          totalOrders: paidOrders.length, monthOrders: monthOrders.length,
          totalRevenue: Math.round(totalRevenue*100)/100, monthRevenue: Math.round(monthRevenue*100)/100,
          totalUsers: allUsers.length, totalProducts: allProducts.length,
          pendingOrders: pendingOrders.length, lowStock: lowStock.length,
          subscribers: allSubscribers.length,
        },
        recentOrders, topProducts, salesByDay,
      },
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/admin/orders', protect, adminOnly, async (req, res) => {
  try {
    const { status, paymentStatus, page=1, limit=20 } = req.query;
    let orders = await db.find(DB.orders, {});
    if (status) orders = orders.filter(o => o.status === status);
    if (paymentStatus) orders = orders.filter(o => o.paymentStatus === paymentStatus);
    orders.sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt));
    const total  = orders.length;
    const paged  = orders.slice((page-1)*limit, page*limit);
    res.json({ success: true, data: paged, pagination: { total, page: Number(page), pages: Math.ceil(total/limit) } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.put('/api/admin/orders/:id', protect, adminOnly, async (req, res) => {
  try {
    const { status, trackingNumber, trackingCarrier, trackingUrl, adminNotes } = req.body;
    const order   = await db.findOne(DB.orders, { _id: req.params.id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    const updates = { updatedAt: new Date() };
    if (status && status !== order.status) {
      updates.status = status;
      const timeline = [...(order.timeline||[]), { status, note:`Updated to ${status} by admin.`, at: new Date() }];
      updates.timeline = timeline;
      if (status === 'shipped')   updates.shippedAt   = new Date();
      if (status === 'delivered') updates.deliveredAt = new Date();
    }
    if (trackingNumber)  updates.trackingNumber  = trackingNumber;
    if (trackingCarrier) updates.trackingCarrier = trackingCarrier;
    if (trackingUrl)     updates.trackingUrl     = trackingUrl;
    if (adminNotes)      updates.adminNotes      = adminNotes;
    await db.update(DB.orders, { _id: req.params.id }, { $set: updates });
    res.json({ success: true, data: await db.findOne(DB.orders, { _id: req.params.id }) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/admin/users', protect, adminOnly, async (req, res) => {
  try {
    const users = await db.find(DB.users, {});
    users.sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt));
    res.json({ success: true, data: users.map(safe), pagination: { total: users.length } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.put('/api/admin/users/:id', protect, adminOnly, async (req, res) => {
  try {
    const { isActive, role } = req.body;
    const updates = {};
    if (isActive !== undefined) updates.isActive = isActive;
    if (role) updates.role = role;
    await db.update(DB.users, { _id: req.params.id }, { $set: updates });
    const user = await db.findOne(DB.users, { _id: req.params.id });
    res.json({ success: true, data: safe(user) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/admin/newsletter', protect, adminOnly, async (req, res) => {
  try {
    const subs = await db.find(DB.newsletter, { isActive: true });
    subs.sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt));
    res.json({ success: true, data: subs, total: subs.length });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── Admin reviews ─────────────────────────────────────────────────
app.get('/api/admin/reviews', protect, adminOnly, async (req, res) => {
  try {
    const reviews = await db.find(DB.reviews, {});
    reviews.sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt));
    // Populate user + product info
    const populated = await Promise.all(reviews.map(async r => {
      const user    = await db.findOne(DB.users, { _id: r.userId });
      const product = await db.findOne(DB.products, { _id: r.productId });
      return {
        ...r,
        user:    user    ? { firstName: user.firstName,    lastName: user.lastName,   email: user.email } : null,
        product: product ? { name: product.name, slug: product.slug } : null,
      };
    }));
    res.json({ success: true, data: populated });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.delete('/api/reviews/:id', protect, adminOnly, async (req, res) => {
  try {
    const review = await db.findOne(DB.reviews, { _id: req.params.id });
    if (!review) return res.status(404).json({ success: false, message: 'Review not found.' });
    await db.remove(DB.reviews, { _id: req.params.id });
    // Recalculate product summary
    const remaining = await db.find(DB.reviews, { productId: review.productId, isApproved: true });
    const avg = remaining.length ? remaining.reduce((s,r)=>s+r.rating,0)/remaining.length : 0;
    await db.update(DB.products, { _id: review.productId }, {
      $set: { 'reviewSummary.average': Math.round(avg*10)/10, 'reviewSummary.count': remaining.length }
    });
    res.json({ success: true, message: 'Review deleted.' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── Named page routes ─────────────────────────────────────────────
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/track', (req, res) => res.sendFile(path.join(__dirname, 'public', 'track.html')));
app.get('/track.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'track.html')));

// ── Catch-all → SPA ──────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Error handler ─────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(err.status||500).json({ success: false, message: err.message||'Internal Server Error' });
});

// ══════════════════════════════════════════════
//  SEED + START
// ══════════════════════════════════════════════
async function seedIfEmpty() {
  const count = await db.count(DB.products);
  if (count > 0) { console.log(`✓ Database has ${count} products — skipping seed`); return; }

  console.log('🌱 Seeding database with products and admin user...');

  const PRODUCTS = [
    { name:'Velvet Meridian Sofa', slug:'velvet-meridian-sofa', shortDesc:'Hand-stitched Italian velvet on solid walnut legs.', description:'Hand-stitched in Italian velvet with a solid walnut frame. Each cushion individually filled with premium goose down. A statement of quiet authority that commands a room without raising its voice.', category:'living-room', tags:['sofa','velvet','walnut','bestseller'], images:['https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&q=80','https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=800&q=80'], price:2490, compareAt:3200, stock:12, badge:'Best Seller', isFeatured:true, materials:['Italian Velvet','Solid Walnut','Goose Down'], features:['Grade-A Italian velvet upholstery','Solid walnut frame','Removable & washable cushion covers','Available in 6 colorways','10-year structural warranty'], reviewSummary:{average:4.9,count:48}, viewCount:0, soldCount:24, isActive:true, isDeleted:false, createdAt:new Date() },
    { name:'Aurel Marble Coffee Table', slug:'aurel-marble-coffee-table', shortDesc:'White Carrara marble top on a brushed brass base.', description:'White Carrara marble top on a hand-formed brushed brass base. Each marble slab is unique — no two tables are identical. Where geology meets artistry.', category:'living-room', tags:['table','marble','brass','new-arrival'], images:['https://images.unsplash.com/photo-1538688525198-9b88f6f53126?w=800&q=80'], price:1890, compareAt:2400, stock:8, badge:'New Arrival', isFeatured:true, materials:['Carrara Marble','Brushed Brass'], features:['Carrara marble surface','Brushed brass base','Waterproof sealant applied','Each piece unique','Made to order 4–6 weeks'], reviewSummary:{average:4.8,count:31}, viewCount:0, soldCount:11, isActive:true, isDeleted:false, createdAt:new Date() },
    { name:'Nordic Arc Floor Lamp', slug:'nordic-arc-floor-lamp', shortDesc:'Sculptural arc in matte black with warm linen shade.', description:'A sculptural arc lamp in matte black with a warm-toned linen shade. The Nordic Arc draws the eye upward and casts a pool of warm light that transforms any room.', category:'lighting', tags:['lamp','floor-lamp','nordic'], images:['https://images.unsplash.com/photo-1507652313519-d4e9174996dd?w=800&q=80'], price:680, compareAt:890, stock:24, badge:'', isFeatured:false, materials:['Matte Black Steel','Linen','Marble'], features:['Matte black powder-coated steel','Handmade linen drum shade','Dimmable LED included (8W, 2700K)','Marble counterweight base','10-minute assembly'], reviewSummary:{average:4.7,count:22}, viewCount:0, soldCount:18, isActive:true, isDeleted:false, createdAt:new Date() },
    { name:'Sable Platform Bed', slug:'sable-platform-bed', shortDesc:'Ultra-low platform bed in hand-smoked solid oak.', description:'Ultra-low profile platform bed in hand-smoked oak. Sits close to the ground with architectural precision. The smoked finish is applied by hand using traditional Japanese Shou Sugi Ban techniques.', category:'bedroom', tags:['bed','oak','platform','japanese','signature'], images:['https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&q=80'], price:3200, compareAt:4100, stock:6, badge:'Signature', isFeatured:true, materials:['Solid Smoked Oak','Steel Joinery'], features:['Hand-smoked solid oak','Japanese Shou Sugi Ban technique','Integrated slatted base','No box spring needed','Custom dimensions available'], reviewSummary:{average:5,count:19}, viewCount:0, soldCount:9, isActive:true, isDeleted:false, createdAt:new Date() },
    { name:'Arco Writing Desk', slug:'arco-writing-desk', shortDesc:'Slim solid ash desk with full-grain leather pull.', description:'A slim, purposeful desk in solid ash with a single full-grain leather drawer pull. Designed for those who work with intention. The wax finish is applied by hand in three coats.', category:'office', tags:['desk','ash','leather','workspace'], images:['https://images.unsplash.com/photo-1593696140826-c58b021acf8b?w=800&q=80'], price:1450, compareAt:null, stock:14, badge:'', isFeatured:false, materials:['Solid Ash','Full-Grain Leather','Solid Brass'], features:['Solid ash with 3-coat hand wax finish','Full-grain leather drawer pull','Cable management slot','Brass hardware','Built to last 50+ years'], reviewSummary:{average:4.8,count:14}, viewCount:0, soldCount:7, isActive:true, isDeleted:false, createdAt:new Date() },
    { name:'Onyx Vessel Vase', slug:'onyx-vessel-vase', shortDesc:'Hand-thrown ceramic in unique onyx reactive glaze.', description:'Hand-thrown ceramic vessel in a deep onyx reactive glaze. Each piece is entirely unique — the glaze reacts differently in every firing. Signed on the base by the artisan.', category:'decor', tags:['vase','ceramic','artisan','limited'], images:['https://images.unsplash.com/photo-1602928298849-e5d4b53f4c6c?w=800&q=80'], price:340, compareAt:460, stock:18, badge:'Limited', isFeatured:true, materials:['Stoneware Ceramic','Onyx Reactive Glaze'], features:['Hand-thrown stoneware','Unique onyx reactive glaze','Artisan-signed base','Waterproof interior','Each piece one-of-a-kind'], reviewSummary:{average:4.9,count:37}, viewCount:0, soldCount:29, isActive:true, isDeleted:false, createdAt:new Date() },
    { name:'Linen Cloud Bedding Set', slug:'linen-cloud-bedding-set', shortDesc:'Pure French linen, stone-washed 12 times for cloud-soft comfort.', description:'Pure French linen bedding in soft stone, washed 12 times for unparalleled softness from the first night. Includes duvet cover, fitted sheet, and two pillowcases. Gets softer with every wash.', category:'bedroom', tags:['bedding','linen','french','sleep'], images:['https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?w=800&q=80'], price:380, compareAt:520, stock:35, badge:'New Arrival', isFeatured:false, materials:['100% French Linen'], features:['100% French linen (Normandy origin)','Stone-washed 12× for instant softness','OEKO-TEX certified','Queen & King available','Machine washable — gets better with age'], reviewSummary:{average:4.9,count:61}, viewCount:0, soldCount:42, isActive:true, isDeleted:false, createdAt:new Date() },
    { name:'Meridian Accent Chair', slug:'meridian-accent-chair', shortDesc:'High-back boucle accent chair on solid brass legs.', description:'A compact accent chair with a high curved back and solid brass legs. Upholstered in boucle fabric that catches the light. Makes a bold statement in a small footprint.', category:'living-room', tags:['chair','boucle','brass','accent'], images:['https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=800&q=80'], price:1290, compareAt:1680, stock:10, badge:'', isFeatured:false, materials:['Boucle Fabric','Solid Brass','Solid Beech'], features:['Boucle upholstery','Solid brass legs','High curved back','Solid beech internal frame','Available in ivory & charcoal'], reviewSummary:{average:4.7,count:25}, viewCount:0, soldCount:13, isActive:true, isDeleted:false, createdAt:new Date() },
  ];

  await Promise.all(PRODUCTS.map(p => db.insert(DB.products, p)));
  console.log(`✓ Seeded ${PRODUCTS.length} products`);

  // Admin user
  const adminExists = await db.findOne(DB.users, { email: 'admin@luxiven.com' });
  if (!adminExists) {
    const password = await bcrypt.hash('Luxiven@2024!', 12);
    await db.insert(DB.users, {
      firstName:'Luxiven', lastName:'Admin', email:'admin@luxiven.com',
      password, role:'admin', isVerified:true, isActive:true,
      wishlist:[], addresses:[], createdAt:new Date(),
    });
    console.log('✓ Admin created: admin@luxiven.com / Luxiven@2024!');
  }
}

seedIfEmpty().then(() => {
  app.listen(PORT, () => {
    console.log('\n' + '═'.repeat(52));
    console.log('  🏛  LUXIVEN  —  Running & Ready');
    console.log('═'.repeat(52));
    console.log(`  URL   : http://localhost:${PORT}`);
    console.log(`  Admin : admin@luxiven.com  /  Luxiven@2024!`);
    console.log(`  API   : http://localhost:${PORT}/api/health`);
    console.log(`  DB    : ./data/*.db  (NeDB — zero config)`);
    console.log('═'.repeat(52) + '\n');
  });
});
