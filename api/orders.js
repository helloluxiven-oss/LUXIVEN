const sb   = require('../lib/supabase');
const cors = require('../lib/cors');
const { getUser } = require('../lib/auth');
const nodemailer = require('nodemailer');

// Email helper
async function sendEmail(to, subject, html) {
  try {
    if (!process.env.SMTP_EMAIL || !process.env.SMTP_PASS) return;
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.SMTP_EMAIL, pass: process.env.SMTP_PASS }
    });
    await transporter.sendMail({ from: `"Luxiven" <${process.env.SMTP_EMAIL}>`, to, subject, html });
  } catch(e) { console.error('Email error:', e.message); }
}

// Order confirmation email to customer
function customerEmailHTML(order) {
  const items = (order.order_items || []).map(i =>
    `<tr><td style="padding:8px 0;border-bottom:1px solid #f0e8d8">${i.name} × ${i.qty}</td><td style="padding:8px 0;border-bottom:1px solid #f0e8d8;text-align:right">$${(i.price * i.qty).toLocaleString()}</td></tr>`
  ).join('');
  return `
  <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#030202;color:#F5ECD7;padding:48px 40px">
    <div style="font-size:28px;font-style:italic;color:#C49628;margin-bottom:8px">Luxiven</div>
    <div style="font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:rgba(196,150,40,.5);margin-bottom:40px">Objects of Consequence</div>
    <h1 style="font-size:22px;font-weight:300;margin-bottom:8px">Order Confirmed</h1>
    <p style="color:rgba(245,236,215,.6);font-size:14px;margin-bottom:32px">Thank you for your order. We will be in touch shortly with shipping details.</p>
    <div style="background:#0C0908;padding:24px;margin-bottom:24px">
      <div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:rgba(196,150,40,.5);margin-bottom:16px">Order ${order.order_number}</div>
      <table style="width:100%;border-collapse:collapse">${items}</table>
      <div style="margin-top:16px;padding-top:16px;border-top:1px solid rgba(196,150,40,.2)">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="color:rgba(245,236,215,.5)">Subtotal</span><span>$${order.subtotal?.toLocaleString()}</span></div>
        ${order.shipping > 0 ? `<div style="margin-bottom:6px"><span style="color:rgba(245,236,215,.5)">Shipping</span><span style="float:right">$${order.shipping}</span></div>` : '<div style="margin-bottom:6px"><span style="color:rgba(245,236,215,.5)">Shipping</span><span style="float:right;color:#C49628">Free</span></div>'}
        <div style="font-size:16px;margin-top:12px;padding-top:12px;border-top:1px solid rgba(196,150,40,.2)"><strong>Total $${order.total?.toLocaleString()}</strong></div>
      </div>
    </div>
    <div style="background:#0C0908;padding:24px;margin-bottom:32px">
      <div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:rgba(196,150,40,.5);margin-bottom:12px">Shipping To</div>
      <div style="font-size:14px;line-height:1.6;color:rgba(245,236,215,.7)">
        ${order.shipping_address?.firstName} ${order.shipping_address?.lastName}<br>
        ${order.shipping_address?.address}<br>
        ${order.shipping_address?.city}, ${order.shipping_address?.zip}
      </div>
    </div>
    <p style="font-size:13px;color:rgba(245,236,215,.4);line-height:1.7">Questions? Reply to this email or WhatsApp us at +91 94137 37872</p>
    <div style="margin-top:32px;padding-top:24px;border-top:1px solid rgba(196,150,40,.1);font-size:11px;color:rgba(245,236,215,.3)">© 2026 Luxiven. Objects chosen with uncommon care.</div>
  </div>`;
}

// Admin notification email
function adminEmailHTML(order) {
  const items = (order.order_items || []).map(i =>
    `<li>${i.name} × ${i.qty} — $${(i.price * i.qty).toLocaleString()}</li>`
  ).join('');
  const addr = order.shipping_address || {};
  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#f9f9f9">
    <h2 style="color:#C49628">🛍️ New Luxiven Order!</h2>
    <p><strong>Order:</strong> ${order.order_number}</p>
    <p><strong>Total:</strong> $${order.total?.toLocaleString()}</p>
    <p><strong>Customer:</strong> ${order.guest_email || 'Registered user'}</p>
    <p><strong>Ship to:</strong> ${addr.firstName} ${addr.lastName}, ${addr.address}, ${addr.city}, ${addr.zip}</p>
    <h3>Items:</h3><ul>${items}</ul>
    <p><a href="https://luxiven.vercel.app/admin.html" style="background:#C49628;color:#000;padding:10px 20px;text-decoration:none;font-weight:bold">View in Admin Panel →</a></p>
  </div>`;
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  // GET /api/orders?number=LUX-XXX — public order tracking
  if (req.method === 'GET' && req.query.number) {
    const { data } = await sb.from('orders')
      .select('order_number,status,payment_status,total,shipping_address,created_at,order_items(name,image,price,qty)')
      .eq('order_number', req.query.number).single();
    if (!data) return res.status(404).json({ error: 'Order not found' });
    return res.json(data);
  }

  // GET /api/orders — user's own orders
  if (req.method === 'GET') {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: 'Login required' });
    const { data } = await sb.from('orders')
      .select('*, order_items(name,image,price,qty)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    return res.json(data || []);
  }

  // POST /api/orders?action=notify — send order notification emails
  if (req.method === 'POST' && req.query.action === 'notify') {
    const { orderId } = req.body;
    const { data: order } = await sb.from('orders')
      .select('*, order_items(name,image,price,qty)')
      .eq('id', orderId).single();
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Send to customer
    const customerEmail = order.guest_email;
    if (customerEmail) {
      await sendEmail(customerEmail, `Your Luxiven Order ${order.order_number} is Confirmed`, customerEmailHTML(order));
    }

    // Send to admin
    const adminEmail = process.env.SMTP_EMAIL || 'helloluxiven@gmail.com';
    await sendEmail(adminEmail, `🛍️ New Order ${order.order_number} — $${order.total}`, adminEmailHTML(order));

    return res.json({ success: true });
  }

  // PUT /api/orders?action=status&id=xxx — update order status + tracking
  if (req.method === 'PUT' && req.query.action === 'status') {
    const user = await getUser(req);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { id } = req.query;
    const { status, tracking_number, supplier } = req.body;
    const { data, error } = await sb.from('orders')
      .update({ status, tracking_number, supplier, updated_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) return res.status(400).json({ error: error.message });

    // Send shipping notification to customer
    if (status === 'shipped' && tracking_number) {
      const { data: fullOrder } = await sb.from('orders')
        .select('*, order_items(name,image,price,qty)').eq('id', id).single();
      const customerEmail = fullOrder?.guest_email;
      if (customerEmail) {
        await sendEmail(customerEmail,
          `Your Luxiven order ${fullOrder.order_number} has shipped! 📦`,
          `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#030202;color:#F5ECD7;padding:48px 40px">
            <div style="font-size:28px;font-style:italic;color:#C49628;margin-bottom:32px">Luxiven</div>
            <h1 style="font-size:22px;font-weight:300;margin-bottom:12px">Your order has shipped 📦</h1>
            <p style="color:rgba(245,236,215,.6)">Order ${fullOrder.order_number} is on its way to you.</p>
            <div style="background:#0C0908;padding:24px;margin:24px 0">
              <div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:rgba(196,150,40,.5);margin-bottom:8px">Tracking Number</div>
              <div style="font-size:20px;color:#C49628">${tracking_number}</div>
            </div>
            <p style="font-size:13px;color:rgba(245,236,215,.4)">Questions? WhatsApp us at +91 94137 37872</p>
          </div>`
        );
      }
    }

    return res.json({ success: true, order: data });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
