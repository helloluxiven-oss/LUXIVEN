const jwt = require('jsonwebtoken');
const sb  = require('./supabase');

async function getUser(req) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return null;
  try {
    const { id } = jwt.verify(h.split(' ')[1], process.env.JWT_SECRET);
    const { data } = await sb.from('profiles').select('id,first_name,last_name,role').eq('id', id).single();
    return data;
  } catch { return null; }
}

function signToken(id) {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

module.exports = { getUser, signToken };
