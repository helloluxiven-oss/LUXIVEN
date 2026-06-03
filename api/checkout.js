const sb   = require('../lib/supabase');
const cors = require('../lib/cors');
const { getUser } = require('../lib/auth');
const https = require('https');
const crypto = require('crypto');

/* =========================================================================
   CURRENCY CONFIG  — READ BEFORE DEPLOYING
   -------------------------------------------------------------------------
   1) BASE_CURRENCY = the currency your products.price column is stored in.
      Your $ UI + "$200 free shipping" logic implies USD. CONFIRM THIS.
      If your prices are actually in INR, set BASE_CURRENCY = 'INR'
      and set RATES.INR = 1 (and express the others relative to INR).

   2) RATES = how BASE converts to each currency you charge in.
      These are EDITABLE price multipliers, not live FX. Tune them to
      clean price points if you want (luxury pricing), or keep ~FX.
      Razorpay supports (from India): USD SGD AUD CAD EUR GBP HKD INR MYR.
      AED / others are NOT supported -> we coerce to USD.
   ========================================================================= */
const BASE_CURRENCY = 'USD';
const SUPPORTED = ['USD','GBP','EUR','AUD','CAD','SGD','HKD','MYR','INR'];
const RATES = { USD:1, GBP:0.80, EUR:0.92, AUD:1.52, CAD:1.36, SGD:1.34, HKD:7.80, MYR:4.70, INR:83 };

function pickCurrency(requested) {
  const c = String(requested || BASE_CURRENCY).toUpperCase();
  return SUPPORTED.includes(c) ? c : 'USD';   // unsupported -> USD
}

// Razorpay — create order (currency-aware)
async function createRazorpayOrder(amountMinor, currency, receipt) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
    const body = JSON.stringify({ amount: amountMinor, currency, receipt });
    const options = {
      hostname: 'api.razorpay.com', path: '/v1/orders', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}`, 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Razorpay — verify signature
function verifySignature(orderId, paymentId, signature) {
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(orderId + '|' + paymentId).digest('hex');
  return expected === signature;
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  // POST /api/checkout?action=create
  if (req.method === 'POST' && req.query.action === 'create') {
    const { items, shipping_address, guest_email, coupon_code, currency: reqCurrency } = req.body;
    if (!items?.length) return res.status(422).json({ error: 'No items' });

    // Currency the buyer will be charged in (validated server-side; never trust blindly)
    const currency = pickCurrency(reqCurrency);
    const rate = RATES[currency] || 1;

    const ids = items.map(i => i.id);
    const { data: products } = await sb.from('products').select('id,name,price,stock,images').in('id', ids);
    if (!products?.length) return res.status(422).json({ error: 'Products not found' });

    // ---- All math in BASE_CURRENCY (server is source of truth for price) ----
    let subtotal = 0;
    const orderItems = items.map(item => {
      const p = products.find(x => x.id === item.id);
      if (!p) return null;
      const qty = parseInt(item.qty) || 1;
      subtotal += p.price * qty;
      return { id: p.id, name: p.name, price: p.price, qty, image: p.images?.[0] || '' };
    }).filter(Boolean);

    let discount = 0;
    if (coupon_code) {
      const { data: coupon } = await sb.from('coupons').select('*')
        .eq('code', coupon_code.toUpperCase()).eq('is_active', true).single();
      if (coupon) discount = coupon.type === 'percentage' ? subtotal * coupon.value / 100 : coupon.value;
    }

    const shipping = subtotal >= 200 ? 0 : 15;             // BASE_CURRENCY thresholds
    const totalBase = Math.max(0, subtotal - discount + shipping);

    // ---- Convert to charge currency ----
    const totalCharged = currency === BASE_CURRENCY ? totalBase : totalBase * rate;
    const amountMinor  = Math.round(totalCharged * 100);   // paise/cents (all supported currencies use 2 decimals)

    const order_number = 'LUX-' + Date.now().toString(36).toUpperCase();

    const rzpOrder = await createRazorpayOrder(amountMinor, currency, order_number);
    if (rzpOrder.error) return res.status(400).json({ error: rzpOrder.error.description });

    const user = await getUser(req);
    const { data: order, error } = await sb.from('orders').insert({
      order_number, user_id: user?.id || null, guest_email: guest_email || null,
      status: 'pending', payment_status: 'pending', payment_method: 'razorpay',
      razorpay_order_id: rzpOrder.id, subtotal, discount, shipping, total: totalBase,
      currency, charged_total: totalCharged,                // <-- needs DB columns (SQL below)
      shipping_address, order_items: orderItems, created_at: new Date().toISOString()
    }).select().single();

    if (error) return res.status(400).json({ error: error.message });

    return res.json({
      success: true, order_id: order.id, order_number,
      razorpay_order_id: rzpOrder.id,
      razorpay_key: process.env.RAZORPAY_KEY_ID,
      amount: rzpOrder.amount, currency,                    // <-- send real currency to checkout
      total: totalBase, subtotal, discount, shipping
    });
  }

  // POST /api/checkout?action=verify
  if (req.method === 'POST' && req.query.action === 'verify') {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, order_id } = req.body;

    if (!verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    const { data: order, error } = await sb.from('orders').update({
      payment_status: 'paid', status: 'processing',
      razorpay_payment_id, razorpay_signature,
      paid_at: new Date().toISOString()
    }).eq('id', order_id).select().single();

    if (error) return res.status(400).json({ error: error.message });

    for (const item of (order.order_items || [])) {
      await sb.rpc('decrement_stock', { product_id: item.id, qty: item.qty }).catch(() => {});
    }

    if (order.user_id) {
      await sb.from('cart_items').delete().eq('user_id', order.user_id);
    }

    return res.json({ success: true, order_number: order.order_number, order });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
