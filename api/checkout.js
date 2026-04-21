const sb     = require('../lib/supabase');
const cors   = require('../lib/cors');
const { getUser } = require('../lib/auth');
const Stripe = require('stripe');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).end();

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });
  const user   = await getUser(req);

  const { items, couponCode, shippingAddress, guestEmail } = req.body;
  if (!items?.length) return res.status(400).json({ error: 'Cart is empty' });

  const email = guestEmail || (user ? (await sb.auth.admin.getUserById(user.id)).data.user?.email : null);

  // Validate prices from DB — never trust client
  const ids = items.map(i => i.productId);
  const { data: products } = await sb.from('products')
    .select('id,name,price,images,stock').in('id', ids).eq('is_active', true);

  let subtotal = 0;
  const lineItems = [];

  for (const item of items) {
    const prod = products?.find(p => p.id === item.productId);
    if (!prod) return res.status(400).json({ error: `Product not found: ${item.productId}` });
    if (prod.stock < item.qty) return res.status(400).json({ error: `${prod.name} out of stock` });
    subtotal += prod.price * item.qty;
    lineItems.push({
      price_data: {
        currency: 'usd',
        unit_amount: Math.round(prod.price * 100),
        product_data: { name: prod.name, images: prod.images?.slice(0, 1).filter(Boolean) }
      },
      quantity: item.qty
    });
  }

  // Apply coupon
  let discountAmt = 0;
  let stripeDiscounts = [];
  if (couponCode) {
    const { data: cpn } = await sb.from('coupons')
      .select('*').eq('code', couponCode.toUpperCase()).eq('is_active', true).single();
    if (cpn && subtotal >= cpn.min_order) {
      discountAmt = cpn.type === 'percent'
        ? Math.round(subtotal * cpn.value / 100)
        : Math.min(cpn.value, subtotal);
      const sc = await stripe.coupons.create({ amount_off: Math.round(discountAmt * 100), currency: 'usd', duration: 'once' });
      stripeDiscounts = [{ coupon: sc.id }];
    }
  }

  const shipping = subtotal >= 200 ? 0 : 15;
  const tax      = Math.round((subtotal - discountAmt) * 0.08 * 100) / 100;
  const total    = Math.round((subtotal - discountAmt + shipping + tax) * 100) / 100;

  if (shipping > 0) lineItems.push({
    price_data: { currency: 'usd', unit_amount: Math.round(shipping * 100), product_data: { name: 'Shipping' } },
    quantity: 1
  });
  if (tax > 0) lineItems.push({
    price_data: { currency: 'usd', unit_amount: Math.round(tax * 100), product_data: { name: 'Tax (8%)' } },
    quantity: 1
  });

  // Create order in DB before Stripe session
  const orderNum = `LUX-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
  const { data: order } = await sb.from('orders').insert({
    order_number: orderNum,
    user_id:      user?.id || null,
    guest_email:  email,
    status:       'pending',
    payment_status: 'unpaid',
    subtotal, discount: discountAmt, shipping, tax, total,
    coupon_code:      couponCode || null,
    shipping_address: shippingAddress
  }).select().single();

  await sb.from('order_items').insert(
    items.map(item => {
      const prod = products.find(p => p.id === item.productId);
      return { order_id: order.id, product_id: prod.id, name: prod.name, image: prod.images?.[0], price: prod.price, qty: item.qty };
    })
  );

  const SITE = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: email,
    line_items: lineItems,
    discounts:  stripeDiscounts,
    metadata:   { orderId: order.id, orderNumber: orderNum },
    success_url: `${SITE}/?order=${orderNum}&status=success`,
    cancel_url:  `${SITE}/?status=cancelled`,
  });

  await sb.from('orders').update({ stripe_session_id: session.id }).eq('id', order.id);

  res.json({ url: session.url, orderNumber: orderNum });
};
