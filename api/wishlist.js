const sb   = require('../lib/supabase');
const cors = require('../lib/cors');
const { getUser } = require('../lib/auth');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Login required' });

  // GET — fetch wishlist
  if (req.method === 'GET') {
    const { data } = await sb.from('wishlist')
      .select('product_id, products(id,name,slug,price,images,avg_rating)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    return res.json(data || []);
  }

  // POST — toggle
  if (req.method === 'POST') {
    const { productId } = req.body;
    if (!productId) return res.status(422).json({ error: 'productId required' });

    const { data: existing } = await sb.from('wishlist')
      .select('id').eq('user_id', user.id).eq('product_id', productId).single();

    if (existing) {
      await sb.from('wishlist').delete().eq('id', existing.id);
      return res.json({ action: 'removed', message: 'Removed from wishlist' });
    }
    await sb.from('wishlist').insert({ user_id: user.id, product_id: productId });
    return res.json({ action: 'added', message: 'Saved to wishlist ♥' });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
