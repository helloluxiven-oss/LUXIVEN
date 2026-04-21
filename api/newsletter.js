const sb   = require('../lib/supabase');
const cors = require('../lib/cors');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).end();

  const email = (req.body.email || '').toLowerCase().trim();
  if (!email) return res.status(422).json({ error: 'Email required' });

  const { error } = await sb.from('newsletter').insert({ email });
  if (error) {
    if (error.code === '23505') return res.json({ message: 'Already subscribed!' });
    return res.status(400).json({ error: error.message });
  }
  res.status(201).json({ message: 'Welcome to the Inner Circle ✦' });
};
