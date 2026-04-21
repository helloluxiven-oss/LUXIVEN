const sb   = require('../lib/supabase');
const cors = require('../lib/cors');
const { getUser } = require('../lib/auth');

async function buildCart(userId) {
  const { data } = await sb.from('cart_items')
    .select('*, products(id,name,slug,price,compare_price,images,category)')
    .eq('user_id', userId);
  const items = (data || []).map(i => ({
    id: i.id, qty: i.qty,
    pid: i.product_id,
    price: i.products?.price,
    name:  i.products?.name,
    image: i.products?.images?.[0],
    cat:   i.products?.category,
    product: i.products
  }));
  const sub = items.reduce((s, i) => s + i.price * i.qty, 0);
  const sh  = sub >= 200 ? 0 : 15;
  const tx  = Math.round(sub * 0.08 * 100) / 100;
  return { items, subtotal: sub, shipping: sh, tax: tx, total: Math.round((sub + sh + tx) * 100) / 100 };
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Login required' });

  const { id } = req.query;

  // Item operations: PUT/DELETE /api/cart?id=xxx
  if (id) {
    if (req.method === 'PUT') {
      const { qty } = req.body;
      if (qty <= 0) {
        await sb.from('cart_items').delete().eq('id', id).eq('user_id', user.id);
      } else {
        await sb.from('cart_items').update({ qty }).eq('id', id).eq('user_id', user.id);
      }
      return res.json({ success: true });
    }
    if (req.method === 'DELETE') {
      await sb.from('cart_items').delete().eq('id', id).eq('user_id', user.id);
      return res.json({ success: true });
    }
  }

  // Cart operations: GET/POST/DELETE /api/cart
  if (req.method === 'GET') {
    return res.json(await buildCart(user.id));
  }

  if (req.method === 'POST') {
    const { productId, qty = 1 } = req.body;
    const { data: prod } = await sb.from('products').select('id,stock,price').eq('id', productId).single();
    if (!prod) return res.status(404).json({ error: 'Product not found' });
    if (prod.stock < qty) return res.status(400).json({ error: 'Insufficient stock' });
    const { data: existing } = await sb.from('cart_items')
      .select('id,qty').eq('user_id', user.id).eq('product_id', productId).single();
    if (existing) {
      await sb.from('cart_items').update({ qty: existing.qty + qty }).eq('id', existing.id);
    } else {
      await sb.from('cart_items').insert({ user_id: user.id, product_id: productId, qty });
    }
    return res.json({ success: true, cart: await buildCart(user.id) });
  }

  if (req.method === 'DELETE') {
    await sb.from('cart_items').delete().eq('user_id', user.id);
    return res.json({ success: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
