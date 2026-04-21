const sb   = require('../lib/supabase');
const cors = require('../lib/cors');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).end();

  const code = (req.body.code || '').trim().toUpperCase();
  const { data, error } = await sb.from('coupons')
    .select('*').eq('code', code).eq('is_active', true).single();

  if (error || !data) return res.status(400).json({ error: 'Invalid coupon code' });
  if (data.expires_at && new Date(data.expires_at) < new Date())
    return res.status(400).json({ error: 'Coupon has expired' });
  if (data.max_uses && data.uses >= data.max_uses)
    return res.status(400).json({ error: 'Coupon usage limit reached' });

  res.json({
    code:     data.code,
    type:     data.type,
    value:    data.value,
    minOrder: data.min_order,
    message:  `${data.type === 'percent' ? data.value + '%' : '$' + data.value} discount applied!`
  });
};
