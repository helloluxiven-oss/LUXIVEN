// /api/cj.js — CJDropshipping API bridge
// Key lives ONLY in process.env.CJ_API_KEY (Vercel env var). Never in client code.
// Endpoints (CJ API v2.0):
//   auth:   POST /authentication/getAccessToken  { apiKey }
//   search: GET  /product/list?pageNum&pageSize&productNameEn   header: CJ-Access-Token

let _tok = null, _tokTime = 0;

async function getToken() {
  // CJ caches tokens 24h server-side; reuse within a warm instance
  if (_tok && (Date.now() - _tokTime) < 23 * 60 * 60 * 1000) return _tok;
  const r = await fetch('https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: process.env.CJ_API_KEY })
  });
  const d = await r.json();
  if (!d || !d.data || !d.data.accessToken) {
    throw new Error(d && d.message ? d.message : 'CJ auth failed');
  }
  _tok = d.data.accessToken; _tokTime = Date.now();
  return _tok;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!process.env.CJ_API_KEY) {
    return res.status(500).json({ error: 'CJ_API_KEY env var not set in Vercel' });
  }

  const action = (req.query && req.query.action) || 'search';

  try {
    const token = await getToken();

    // Diagnostic: confirms auth works WITHOUT exposing the key
    if (action === 'token') {
      return res.json({ ok: true, auth: 'success', token_present: !!token });
    }

    if (action === 'search') {
      const q    = (req.query.q) || '';
      const page = (req.query.page) || 1;
      const size = (req.query.size) || 20;
      const url = 'https://developers.cjdropshipping.com/api2.0/v1/product/list'
        + '?pageNum=' + encodeURIComponent(page)
        + '&pageSize=' + encodeURIComponent(size)
        + (q ? '&productNameEn=' + encodeURIComponent(q) : '');
      const r = await fetch(url, { headers: { 'CJ-Access-Token': token } });
      const d = await r.json();
      const list = (d && d.data && (d.data.list || d.data.content)) || [];
      // Normalize to clean rows. Field names are best-guess; raw_keys exposes
      // CJ's actual fields so we can correct the mapping after first test.
      const products = list.map(p => ({
        pid:      p.pid || p.productId || p.id || '',
        name:     p.productNameEn || p.productName || p.nameEn || '',
        sku:      p.productSku || p.sku || '',
        cost:     p.sellPrice || p.price || null,
        image:    p.productImage || p.bigImage || (p.productImageSet && p.productImageSet[0]) || '',
        category: p.categoryName || ''
      }));
      return res.json({
        ok: true,
        count: products.length,
        cj_code: d && d.code,
        cj_message: d && d.message,
        raw_keys: list[0] ? Object.keys(list[0]) : [],
        products
      });
    }

    return res.status(400).json({ error: 'unknown action (use token | search)' });
  } catch (e) {
    return res.status(502).json({ error: String((e && e.message) || e) });
  }
};
