const sb     = require('../lib/supabase');
const Stripe = require('stripe');
const nodemailer = require('nodemailer');

// Vercel needs raw body for Stripe signature verification
export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });
  const raw    = await getRawBody(req);
  const sig    = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    console.error('Webhook sig failed:', e.message);
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    if (session.payment_status !== 'paid') return res.json({ received: true });

    const { orderNumber } = session.metadata;

    // Mark order paid
    const { data: order } = await sb.from('orders')
      .update({
        payment_status: 'paid',
        status: 'confirmed',
        stripe_payment_intent: session.payment_intent,
        updated_at: new Date().toISOString()
      })
      .eq('order_number', orderNumber)
      .select('*, order_items(*)')
      .single();

    // Decrement stock
    for (const item of (order?.order_items || [])) {
      await sb.rpc('decrement_stock', { p_id: item.product_id, qty: item.qty });
    }

    // Increment coupon uses
    if (order?.coupon_code) {
      await sb.from('coupons').update({ uses: sb.rpc('increment', { x: 1 }) }).eq('code', order.coupon_code);
    }

    // Send confirmation email
    const email = order?.guest_email || session.customer_email;
    if (email && process.env.SMTP_USER) {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: 587, secure: false,
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        });
        await transporter.sendMail({
          from: process.env.EMAIL_FROM || 'Luxiven <hello@luxiven.com>',
          to: email,
          subject: `Order Confirmed — ${orderNumber}`,
          html: `<div style="background:#030202;color:#F5ECD7;padding:40px;font-family:Georgia,serif;max-width:600px;margin:0 auto">
            <h1 style="letter-spacing:.3em;font-size:24px;font-weight:400;color:#C49628">LUXIVEN</h1>
            <h2 style="font-weight:300;font-size:28px;margin:24px 0 8px">Your order is confirmed.</h2>
            <p style="color:#9A8878;font-size:14px;margin-bottom:32px">${orderNumber}</p>
            <p style="color:#9A8878;font-size:13px;line-height:1.8">Total: <strong style="color:#F5ECD7">$${order.total?.toLocaleString()}</strong></p>
            <p style="margin-top:40px;color:#6E5C48;font-size:11px;letter-spacing:.2em">© LUXIVEN · CONSIDERED LIVING</p>
          </div>`
        });
      } catch (e) { console.error('Email error:', e.message); }
    }

    // Clear server cart
    if (order?.user_id) {
      await sb.from('cart_items').delete().eq('user_id', order.user_id);
    }

    console.log(`✓ Order ${orderNumber} paid`);
  }

  if (event.type === 'charge.refunded') {
    const pi = event.data.object.payment_intent;
    await sb.from('orders').update({ payment_status: 'refunded', status: 'refunded' })
      .eq('stripe_payment_intent', pi);
  }

  res.json({ received: true });
};
