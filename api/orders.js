const sb   = require('../lib/supabase');
const cors = require('../lib/cors');
const { getUser } = require('../lib/auth');

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

  res.status(405).json({ error: 'Method not allowed' });
};
