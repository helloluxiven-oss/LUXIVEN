# Luxiven — Deploy to Vercel + Supabase

Complete guide. Takes ~15 minutes.

---

## Step 1 — Supabase Setup

1. Go to [supabase.com](https://supabase.com) → **New project**
2. Name: `luxiven` | Choose a strong database password | Pick closest region
3. Wait ~2 minutes for provisioning

### Run the schema
4. **SQL Editor → New Query**
5. Paste the contents of `supabase/schema.sql` → **Run**
6. Paste the contents of `supabase/functions.sql` → **Run**

### Get your keys
7. **Settings → API**
   - Copy **URL** → `SUPABASE_URL`
   - Copy **anon public** → `SUPABASE_ANON_KEY`  
   - Copy **service_role** → `SUPABASE_SERVICE_KEY` ⚠️ keep secret

---

## Step 2 — Stripe Setup

1. Go to [dashboard.stripe.com](https://dashboard.stripe.com)
2. **Developers → API keys**
   - Copy **Secret key** → `STRIPE_SECRET_KEY`

### Webhook (for payment confirmation)
3. **Developers → Webhooks → Add endpoint**
   - URL: `https://YOUR-VERCEL-URL.vercel.app/api/webhook`
   - Events: `checkout.session.completed`, `charge.refunded`
4. After creating, click **Reveal** under Signing secret → `STRIPE_WEBHOOK_SECRET`

> 💡 For testing locally: `stripe listen --forward-to localhost:3000/api/webhook`

---

## Step 3 — Generate JWT Secret

Run this in your terminal:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
Copy the output → `JWT_SECRET`

---

## Step 4 — Deploy to Vercel

### Option A: Vercel CLI (fastest)
```bash
npm install -g vercel
cd luxiven
vercel

# When prompted:
# Set up and deploy? Y
# Which scope? (your account)
# Link to existing project? N
# Project name: luxiven
# Directory: ./
# Override settings? N
```

After first deploy, add environment variables:
```bash
vercel env add SUPABASE_URL
vercel env add SUPABASE_SERVICE_KEY
vercel env add JWT_SECRET
vercel env add STRIPE_SECRET_KEY
vercel env add STRIPE_WEBHOOK_SECRET
# Optional email:
vercel env add SMTP_HOST
vercel env add SMTP_USER
vercel env add SMTP_PASS
vercel env add EMAIL_FROM

# Deploy with env vars
vercel --prod
```

### Option B: Vercel Dashboard (no CLI)
1. Push this folder to GitHub
2. [vercel.com](https://vercel.com) → **New Project → Import Git Repository**
3. Select your repo → **Deploy**
4. After deploy: **Project Settings → Environment Variables**
5. Add all variables from `.env.example`
6. **Redeploy** (Deployments → ⋯ → Redeploy)

---

## Step 5 — Make Yourself Admin

After creating an account on the live site:

1. Supabase Dashboard → **Table Editor → profiles**
2. Find your row → edit `role` column → change to `admin`

Or via SQL:
```sql
UPDATE profiles SET role = 'admin' WHERE id = 'your-user-uuid';
```

---

## Step 6 — Update Stripe Webhook URL

1. Stripe Dashboard → **Developers → Webhooks**
2. Edit your webhook endpoint URL to your Vercel production URL:
   `https://luxiven.vercel.app/api/webhook`

---

## What You Get

| Feature | Status |
|---------|--------|
| Products loaded from Supabase | ✅ |
| User register + login (JWT) | ✅ |
| Server-side cart (logged-in users) | ✅ |
| Guest cart (localStorage) | ✅ |
| Coupon validation | ✅ |
| Stripe Checkout (real payments) | ✅ |
| Webhook → order confirmed + email | ✅ |
| Wishlist | ✅ |
| Newsletter subscribe | ✅ |
| Order history + tracking | ✅ |
| Admin dashboard API | ✅ |

---

## Coupon Codes (seeded in DB)

| Code | Discount | Min Order |
|------|----------|-----------|
| `LUXIVEN10` | 10% | None |
| `WELCOME20` | 20% | None |
| `VIP30` | 30% | $500 |

---

## Checkout Flow

```
User clicks "Place Order"
  → POST /api/checkout (validates prices from DB, never trust client)
  → Creates order in Supabase (status: pending, unpaid)
  → Creates Stripe Checkout session
  → Redirects to Stripe hosted payment page
  → User pays
  → Stripe fires webhook → POST /api/webhook
  → Order marked paid + confirmed
  → Stock decremented
  → Confirmation email sent
  → Cart cleared
  → User redirected to site with ?order=LUX-XXX&status=success
```

---

## Troubleshooting

**Products not loading** — Check `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` in Vercel env vars. Make sure schema.sql ran successfully.

**Login fails** — Verify `JWT_SECRET` is set. Check Supabase Auth settings (Email confirmations might be on — disable for testing: Auth → Settings → Disable email confirmations).

**Stripe redirect fails** — Check `STRIPE_SECRET_KEY`. Make sure the webhook URL is correct.

**Webhook not firing** — Verify `STRIPE_WEBHOOK_SECRET` matches what Stripe shows. Webhook events must include `checkout.session.completed`.

**Disable email confirmation in Supabase** (important for testing):
- Supabase → Authentication → Settings → Disable "Enable email confirmations"
