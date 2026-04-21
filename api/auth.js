const sb   = require('../lib/supabase');
const cors = require('../lib/cors');
const { signToken, getUser } = require('../lib/auth');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  const { action } = req.query;

  // POST /api/auth?action=register
  if (action === 'register') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { firstName, lastName, email, password } = req.body;
    if (!email || !password) return res.status(422).json({ error: 'Email and password required' });
    if (password.length < 8) return res.status(422).json({ error: 'Password must be 8+ characters' });
    const { data, error } = await sb.auth.admin.createUser({
      email, password,
      user_metadata: { first_name: firstName, last_name: lastName },
      email_confirm: true
    });
    if (error) {
      if (error.message.includes('already')) return res.status(409).json({ error: 'Email already registered' });
      return res.status(400).json({ error: error.message });
    }
    const token = signToken(data.user.id);
    return res.status(201).json({ token, user: { id: data.user.id, email, firstName, lastName, role: 'customer' } });
  }

  // POST /api/auth?action=login
  if (action === 'login') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { email, password } = req.body;
    if (!email || !password) return res.status(422).json({ error: 'Email and password required' });
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: 'Invalid credentials' });
    const { data: profile } = await sb.from('profiles').select('*').eq('id', data.user.id).single();
    const token = signToken(data.user.id);
    return res.json({
      token,
      user: {
        id: data.user.id,
        email: data.user.email,
        firstName: profile?.first_name,
        lastName:  profile?.last_name,
        role:      profile?.role || 'customer'
      }
    });
  }

  // GET /api/auth?action=me
  if (action === 'me') {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { data: auth } = await sb.auth.admin.getUserById(user.id);
    return res.json({
      id: user.id, email: auth.user?.email,
      firstName: user.first_name, lastName: user.last_name, role: user.role
    });
  }

  res.status(400).json({ error: 'Unknown action' });
};
