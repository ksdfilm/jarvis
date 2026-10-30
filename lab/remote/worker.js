// KSD LAB proxy — Cloudflare Worker (Free plan: 100,000 requests/day, no credit card).
// Fetches whitelisted public JSON APIs that don't allow browser CORS (flight data) and adds CORS headers.
// If the free daily quota runs out it simply returns errors until the next day — it never bills.
const ALLOW_HOSTS = ['opendata.adsb.fi', 'api.adsb.lol', 'opensky-network.org'];
// only pages from these sites may use the proxy (stops strangers from eating your quota)
const ALLOW_ORIGINS = [/^https:\/\/ksdfilm\.github\.io$/, /^https?:\/\/localhost(:\d+)?$/, /^https?:\/\/192\.168\.\d+\.\d+$/, /^https:\/\/[\w-]+\.[\w-]+\.ts\.net$/];

export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get('Origin') || '';
    const okOrigin = ALLOW_ORIGINS.some(r => r.test(origin));
    const cors = { 'Access-Control-Allow-Origin': okOrigin ? origin : 'null', 'Vary': 'Origin' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: { ...cors, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': '*' } });
    if (!okOrigin) return new Response('origin not allowed', { status: 403, headers: cors });

    let target;
    try { target = new URL(new URL(req.url).searchParams.get('u')); } catch { return new Response('bad url', { status: 400, headers: cors }); }
    if (target.protocol !== 'https:' || !ALLOW_HOSTS.includes(target.hostname)) return new Response('host not allowed', { status: 403, headers: cors });

    // 5-second edge cache: many viewers → one upstream call
    const cache = caches.default, key = new Request(target.toString());
    let res = await cache.match(key);
    if (!res) {
      const up = await fetch(target, { headers: { 'User-Agent': 'ksd-lab/1.0', 'Accept': 'application/json' } });
      res = new Response(up.body, up);
      res.headers.set('Cache-Control', 'public, max-age=5');
      if (up.ok) ctx.waitUntil(cache.put(key, res.clone()));
    }
    res = new Response(res.body, res);
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  },
};
