// ═══════════════════════════════════════════════════════════════
//  LUXIVEN — Server Entry Point
//  Express + MongoDB + JWT + Stripe
// ═══════════════════════════════════════════════════════════════
require('dotenv').config();
const express      = require('express');
const mongoose     = require('mongoose');
const helmet       = require('helmet');
const cors         = require('cors');
const morgan       = require('morgan');
const session      = require('express-session');
const MongoStore   = require('connect-mongo');
const path         = require('path');
const rateLimit    = require('express-rate-limit');

const app = express();

// ── Database Connection ─────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/luxiven')
  .then(() => console.log('✓ MongoDB connected'))
  .catch(err => { console.error('✗ MongoDB error:', err.message); process.exit(1); });

// ── Security Middleware ─────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'", "https://js.stripe.com", "https://fonts.googleapis.com", "https://images.unsplash.com"],
      styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:    ["'self'", "https://fonts.gstatic.com"],
      imgSrc:     ["'self'", "data:", "https://images.unsplash.com", "https://*.stripe.com"],
      connectSrc: ["'self'", "https://api.stripe.com"],
      frameSrc:   ["https://js.stripe.com"],
    },
  },
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// ── Rate Limiting ───────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 min
  max: 100,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many auth attempts.' },
});

// ── General Middleware ──────────────────────────────────────────
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Session ─────────────────────────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || 'luxiven-secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/luxiven',
    ttl: 7 * 24 * 60 * 60, // 7 days
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

// ── Static Files ────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── API Routes ──────────────────────────────────────────────────
app.use('/api',         apiLimiter);
app.use('/api/auth',    authLimiter, require('./routes/auth'));
app.use('/api/products',             require('./routes/products'));
app.use('/api/orders',               require('./routes/orders'));
app.use('/api/cart',                 require('./routes/cart'));
app.use('/api/users',                require('./routes/users'));
app.use('/api/reviews',              require('./routes/reviews'));
app.use('/api/wishlist',             require('./routes/wishlist'));
app.use('/api/payments',             require('./routes/payments'));
app.use('/api/admin',                require('./routes/admin'));
app.use('/api/newsletter',           require('./routes/newsletter'));

// ── Serve Frontend (SPA catch-all) ──────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Global Error Handler ────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  const status = err.statusCode || err.status || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ── Start ───────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🏛  Luxiven running on http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}\n`);
});

module.exports = app;
