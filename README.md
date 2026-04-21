# 🏛 Luxiven — Full-Stack Luxury Dropshipping Platform
### 30/30 API Tests Passing · Zero External Dependencies · Production Ready

---

## ⚡ Run in 3 Commands

```bash
cd luxiven
npm install
node server-standalone.js
```

Open     → http://localhost:3000
Admin    → http://localhost:3000/admin
Tracking → http://localhost:3000/track

Admin login: admin@luxiven.com / Luxiven@2024!

No MongoDB, no Redis, no Docker, no config needed.
Uses NeDB — embedded pure-Node.js database.
Data saves to ./data/*.db automatically.
Auto-seeds 8 luxury products + admin user on first run.

---

## 📁 Project Structure

```
luxiven/
├── server-standalone.js     ← Main server (NeDB, zero config)
├── server.js                ← Alternative server (MongoDB)
├── package.json
├── .env.local               ← Default env vars (auto-loaded)
├── .env.example             ← Template for production config
│
├── public/
│   ├── index.html           ← Cinematic 3D storefront (1236 lines)
│   ├── admin.html           ← Full admin dashboard (1150 lines)
│   └── track.html           ← Order tracking page (244 lines)
│
├── models/                  ← Mongoose models (used by server.js)
│   ├── User.js
│   ├── Product.js
│   ├── Order.js
│   ├── Cart.js
│   ├── Review.js
│   └── Newsletter.js
│
├── routes/                  ← Express route files (used by server.js)
│   ├── auth.js
│   ├── products.js
│   ├── cart.js
│   ├── orders.js
│   ├── payments.js
│   ├── users.js
│   ├── reviews.js
│   ├── wishlist.js
│   ├── newsletter.js
│   └── admin.js
│
├── middleware/
│   └── auth.js              ← JWT protect + adminOnly guards
│
├── config/
│   ├── email.js             ← Nodemailer + 4 HTML email templates
│   └── seed.js              ← MongoDB seeder (for server.js)
│
└── data/                    ← Auto-created on first run
    ├── users.db
    ├── products.db
    ├── orders.db
    ├── carts.db
    ├── reviews.db
    └── newsletter.db
```

---

## 🌐 Pages

| URL      | Page              | Description                          |
|----------|-------------------|--------------------------------------|
| /        | Storefront        | Cinematic 3D luxury experience       |
| /admin   | Admin Dashboard   | Full store management interface      |
| /track   | Order Tracking    | Public order status + timeline       |

---

## 🔌 API Reference

### Auth  /api/auth
POST   /register            Create account → returns JWT
POST   /login               Sign in → returns JWT
GET    /me                  Get current user (auth required)
POST   /forgot-password     Send password reset email
POST   /reset-password      Reset with token
POST   /change-password     Update password (auth required)
GET    /verify-email        Verify email address with token

### Products  /api/products
GET    /                    List all (filters: category, minPrice, maxPrice, sort, page, limit, search, featured, badge)
GET    /featured            Featured products (up to 8)
GET    /categories          Category list with counts
GET    /:slug               Product detail + related products
POST   /                    Create product (admin only)
PUT    /:id                 Update product (admin only)
DELETE /:id                 Soft delete (admin only)

### Cart  /api/cart
GET    /                    Get cart (guest session or user)
POST   /add                 Add item {productId, quantity, variant}
PUT    /update              Update qty {itemId, quantity}
DELETE /remove/:itemId      Remove single item
DELETE /clear               Clear entire cart
POST   /coupon              Apply coupon {code}

Built-in coupons: LUXIVEN10 (10%), WELCOME20 (20%), VIP30 (30%)

### Orders  /api/orders
POST   /                    Place order from cart
GET    /my                  My order history (auth required)
GET    /track/:orderNumber  Public order tracking (no auth)
GET    /:id                 Order detail (auth required)
POST   /:id/cancel          Cancel order (auth required)

### Users  /api/users
GET    /profile             Get profile (auth required)
PUT    /profile             Update firstName, lastName, phone (auth required)
POST   /addresses           Add address (auth required)
PUT    /addresses/:id       Update address (auth required)
DELETE /addresses/:id       Remove address (auth required)

### Reviews  /api/reviews
GET    /product/:productId  Product reviews (public)
POST   /                    Submit review, one per product (auth required)
DELETE /:id                 Delete review (admin only)

### Wishlist  /api/wishlist
GET    /                    Get wishlist (auth required)
POST   /:productId          Toggle add/remove (auth required)

### Newsletter  /api/newsletter
POST   /subscribe           Subscribe {email, firstName}
GET    /unsubscribe         Unsubscribe with token
GET    /subscribers         Full list (admin only)

### Payments  /api/payments
POST   /create-intent       Create Stripe PaymentIntent
POST   /webhook             Stripe webhook handler (raw body)
POST   /refund              Issue refund (admin only)

### Admin  /api/admin
GET    /dashboard           Stats overview + revenue chart data + recent orders + top products
GET    /orders              All orders (filters: status, paymentStatus, search, from, to)
PUT    /orders/:id          Update status, tracking number, carrier, notes
GET    /users               All users (filters: role, search)
PUT    /users/:id           Suspend/activate, change role
GET    /reviews             All reviews for moderation
GET    /newsletter          Subscriber list
GET    /analytics/revenue   Revenue by day + category (period: 7d, 30d, 90d)

### Utility
GET    /api/health          Server health check + DB document counts

---

## 🎨 Frontend Features

### Storefront (public/index.html)

Hero Scene:
- 3D particle sphere — 900 Fibonacci-distributed points on canvas
- Mouse-reactive rotation (smooth lerp follow)
- Art deco SVG ring system (6 concentric circles, triangles, crosshairs, 60s CSS rotation)
- Golden orbital light streaks (6 animated diagonal rays)
- Particle vortex loader with Luxiven wordmark
- Custom gold cursor with lagging ring that expands on hover

Scene Flow:
- Hero → Manifesto editorial split → Door portal → Interior → Products → Category Worlds
- Interactive door: 3D CSS perspective swing (perspective + rotateY), bloom glow behind
- Auto-opens and smooth-scrolls on intersection
- Interior: 3-layer parallax (wall image, floor gradient, ceiling wash) on scroll
- Sunlight shafts (skewed divs with gradient) + floating dust motes (CSS keyframes)

Products:
- Loaded from /api/products (fallback to local data if offline)
- 3D tilt on mousemove (perspective + rotateX/Y calculated from cursor position)
- Quick-view modal with rating stars, features list, wishlist toggle
- Add to cart with live badge update
- Cart drawer: qty controls, coupon code, running totals, checkout

Commerce Flow:
- Auth modal: register + login + forgot password, all wired to /api/auth
- Checkout form: full address, order note → POST /api/orders
- Coupon codes applied via /api/cart/coupon
- JWT stored in localStorage, sent as Bearer token

Category Worlds:
- 4 tabs: Living Room, Bedroom, Home Office, Decor
- Each: cinematic full-width hero image + 3-panel mini-grid
- CSS fade-in animation on tab switch

Supporting:
- Scroll-reveal (IntersectionObserver, 0.12 threshold)
- Testimonial marquee (infinite CSS animation)
- Newsletter subscription (wired to /api/newsletter/subscribe)
- Fully responsive at 900px and 768px breakpoints

### Admin Dashboard (public/admin.html)

Access: requires admin role JWT, login gate shown otherwise.

Dashboard panel:
- 4 stat cards: Total Revenue, This Month, Total Orders, Customers
- Revenue bar chart (last 14 days, CSS bars sized by % of max)
- Low stock inventory alerts
- Recent orders table
- Top products by sold count

Products panel:
- Full product table with thumbnail, price, stock, sales, status
- Category filter + search (client-side)
- Add/Edit product modal: all fields including images, features, tags, featured flag
- Slug auto-generated from name
- Delete with confirmation

Orders panel:
- Status + payment filters
- Search by order number or email
- Order detail modal: update status, add tracking number/carrier/URL, admin notes
- Full timeline display
- Item breakdown with totals

Customers panel:
- Role + search filters
- Suspend / activate accounts

Reviews panel: list all reviews, delete

Newsletter panel: subscriber count stats, full subscriber table

Analytics panel: revenue by month, order status breakdown

### Order Tracking (public/track.html)

- No auth required — public facing
- 4-step progress bar: Confirmed → Processing → Shipped → Delivered
- Cancelled state with warning banner
- Tracking number + external carrier link
- Full item list with quantities and prices
- Tax, shipping, discount breakdown
- Shipping address display
- Reverse-chronological timeline
- URL param pre-fill: /track?order=LUX-XXX&email=you@example.com

---

## 🔒 Security

- Passwords: bcrypt, 12 salt rounds
- Auth: JWT, 7-day expiry, Bearer token in Authorization header
- Headers: Helmet.js (CSP, HSTS, X-Frame-Options, etc.)
- CORS: configurable origin whitelist
- Rate limiting: 100 req/15min on API, 10 req/15min on auth routes
- Input validation: express-validator on all mutation routes
- Role guard: adminOnly middleware on every admin route
- Soft deletes: products marked isDeleted, never hard removed
- Password never returned in any API response

---

## 🧪 Test Results

30/30 tests passing (100%)

Auth (6 tests):
  Register new user
  Duplicate register blocked with 409
  Login returns valid JWT
  Wrong password returns 401
  GET /me with token returns user
  GET /me without token returns 401

Products (4 tests):
  Returns 8 seeded products
  All have required fields (name, price, category, images)
  All prices are positive numbers
  All have feature arrays

Cart (4 tests):
  Add product to cart
  Adding same product increases quantity
  GET cart returns populated items with product info
  Subtotal equals price times quantity

Orders (7 tests):
  Place order from cart
  Cart is cleared after checkout
  Order total is greater than subtotal (tax applied)
  Track order by order number
  Order number is LUX- prefixed
  Non-existent order returns 404
  Order includes a timeline array

Newsletter (3 tests):
  Subscribe new email
  Re-subscribe handled gracefully (no error)
  Empty email handled safely

Admin (3 tests):
  Admin login with seed credentials
  Admin token decodes to admin role
  Customer token confirms customer role

Database (3 tests):
  Correct product count (8)
  At least 1 order exists
  Correct user count

---

## 🚀 Deploy to Production

### Option A — Railway (recommended, free tier)
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

### Option B — Render
1. Push to GitHub
2. New Web Service on render.com
3. Build command: npm install
4. Start command: node server-standalone.js
5. Add environment variables from .env.example

### Option C — VPS with PM2
```bash
npm install -g pm2
pm2 start server-standalone.js --name luxiven
pm2 save
pm2 startup
```

### Upgrading to MongoDB (optional)
When ready for a production database:
1. Set MONGODB_URI in your environment
2. Run: node server.js
3. Seed: npm run seed
All Mongoose models, routes and middleware are ready in /models and /routes.

---

## 📧 Email Setup (optional)

To enable order confirmation and welcome emails:

1. Enable 2FA on your Google account
2. Create an App Password at myaccount.google.com → Security → App Passwords
3. Add to .env.local:
   SMTP_USER=your@gmail.com
   SMTP_PASS=your-16-char-app-password

Email templates included:
- Welcome / email verification
- Password reset
- Order confirmation (itemised table with totals)
- Newsletter welcome with unsubscribe link

---

*Built with care for the Luxiven brand.*
*Every corner tells a story.*
