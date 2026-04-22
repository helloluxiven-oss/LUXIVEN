const sb   = require('../lib/supabase');
const cors = require('../lib/cors');
const { getUser } = require('../lib/auth');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  const user = await getUser(req);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  const { action } = req.query;

  // GET /api/admin?action=dashboard
  if (req.method === 'GET' && action === 'dashboard') {
    const [
      { count: totalOrders },
      { count: totalUsers },
      { count: totalProducts },
      { count: subscribers },
      { data: recentOrders },
    ] = await Promise.all([
      sb.from('orders').select('*', { count: 'exact', head: true }).eq('payment_status', 'paid'),
      sb.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer'),
      sb.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true),
      sb.from('newsletter').select('*', { count: 'exact', head: true }).eq('is_active', true),
      sb.from('orders').select('order_number,total,status,created_at,guest_email')
        .eq('payment_status', 'paid').order('created_at', { ascending: false }).limit(10),
    ]);

    const { data: revenueData } = await sb.from('orders').select('total').eq('payment_status', 'paid');
    const revenue = (revenueData || []).reduce((s, o) => s + parseFloat(o.total || 0), 0);

    return res.json({ totalOrders, totalUsers, totalProducts, subscribers, revenue: Math.round(revenue * 100) / 100, recentOrders });
  }

  // GET /api/admin?action=orders
  if (req.method === 'GET' && action === 'orders') {
    const { status, page = 1, limit = 20 } = req.query;
    let q = sb.from('orders').select('*, order_items(name,qty,price)', { count: 'exact' });
    if (status) q = q.eq('status', status);
    const from = (page - 1) * limit;
    q = q.order('created_at', { ascending: false }).range(from, from + parseInt(limit) - 1);
    const { data, count } = await q;
    return res.json({ data, total: count });
  }

  // PUT /api/admin?action=order&id=xxx — update order status
  if (req.method === 'PUT' && action === 'order') {
    const { id } = req.query;
    const { status, trackingNumber } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (status) updates.status = status;
    if (trackingNumber) updates.tracking_number = trackingNumber;
    const { data, error } = await sb.from('orders').update(updates).eq('id', id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  }

  // GET /api/admin?action=newsletter
  if (req.method === 'GET' && action === 'newsletter') {
    const { data, count } = await sb.from('newsletter')
      .select('*', { count: 'exact' }).eq('is_active', true).order('created_at', { ascending: false });
    return res.json({ data, total: count });
  }

  // POST /api/admin?action=add-product
  if (req.method === 'POST' && action === 'add-product') {
    const { name, price, compare_price, short_desc, description, category, images, badge, stock, slug } = req.body;
    if (!name || !price) return res.status(422).json({ error: 'Name and price required' });
    const { data, error } = await sb.from('products').insert({
      name, price, compare_price, short_desc, description,
      category, images, badge, stock: stock || 50,
      slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      is_active: true, avg_rating: 0, review_count: 0,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ success: true, product: data });
  }

  // PUT /api/admin?action=update-product&slug=xxx
  if (req.method === 'PUT' && action === 'update-product') {
    const { slug } = req.query;
    const updates = req.body;
    const allowed = ['images','price','compare_price','name','short_desc','description','badge','stock','is_active'];
    const filtered = Object.fromEntries(Object.entries(updates).filter(([k]) => allowed.includes(k)));
    const { data, error } = await sb.from('products').update(filtered).eq('slug', slug).select().single();
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ success: true, product: data });
  }

  // PUT /api/admin?action=toggle-product&id=xxx
  if (req.method === 'PUT' && action === 'toggle-product') {
    const { id } = req.query;
    const { is_active } = req.body;
    const { data, error } = await sb.from('products').update({ is_active, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ success: true, product: data });
  }

  res.status(400).json({ error: 'Unknown action' });
};
