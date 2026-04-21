const sb   = require('../lib/supabase');
const cors = require('../lib/cors');

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  const { category, limit = 20, page = 1 } = req.query;
  let q = sb.from('products').select('*').eq('is_active', true);
  if (category) q = q.eq('category', category);
  const from = (page - 1) * limit;
  q = q.order('created_at', { ascending: false }).range(from, from + parseInt(limit) - 1);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data, count: data.length });
};
