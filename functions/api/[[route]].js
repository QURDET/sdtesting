// Cloudflare Pages Function — handles all /api/* routes
// Data is stored in Cloudflare KV (bound as QD_DATA)

const DEFAULT_DATA = {
    settings: { googleClientId: '' },
    users: [
        { id: 'u1', username: 'mamda006.310', password: 'HelloAbbas2023!', name: 'Abbas M',  role: 'admin' },
        { id: 'u2', username: 'zjets988',     password: 'ZahraJets2024!',  name: 'Zahra J',  role: 'staff' },
    ],
    inventory: [
        { id: 'p1', name: 'Shia Deal Standard Pack',      sku: 'SD-001', price: 12.99, qty: 48, threshold: 10, notes: '' },
        { id: 'p2', name: 'Shia Deal Deluxe Pack',        sku: 'SD-002', price: 19.99, qty: 22, threshold:  8, notes: '' },
        { id: 'p3', name: 'Shia Deal Expansion Pack',     sku: 'SD-EXP', price:  8.99, qty:  7, threshold: 10, notes: 'Running low — reorder soon' },
        { id: 'p4', name: 'Shia Deal Bundle (Std + Exp)', sku: 'SD-BUN', price: 19.99, qty:  3, threshold:  5, notes: '' },
    ],
    orders: [],
};

const CORS = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
    });
}

export async function onRequest(context) {
    const { request, env } = context;
    const url    = new URL(request.url);
    const parts = url.pathname.split('/api/'); const route = parts.length > 1 ? parts[1] : '';
    const method = request.method;

    if (method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });

    async function readData() {
        const raw = await env.QD_DATA.get('data');
        if (!raw) {
            await env.QD_DATA.put('data', JSON.stringify(DEFAULT_DATA));
            return DEFAULT_DATA;
        }
        const d = JSON.parse(raw);
        if (!d.settings) d.settings = { googleClientId: '' };
        if (d.users) {
            d.users = d.users.map(u => {
                if (!u.password) {
                    const def = DEFAULT_DATA.users.find(du => du.id === u.id);
                    if (def) return { ...u, password: def.password };
                }
                return u;
            });
        }
        return d;
    }

    async function writeData(d) {
        await env.QD_DATA.put('data', JSON.stringify(d));
    }

    try {
        // GET /api/health
        if (route === 'health' && method === 'GET') return json({ ok: true });

        // GET /api/settings
        if (route === 'settings' && method === 'GET') return json((await readData()).settings || {});
        // PUT /api/settings
        if (route === 'settings' && method === 'PUT') {
            const d = await readData();
            d.settings = { ...(d.settings || {}), ...await request.json() };
            await writeData(d);
            return json(d.settings);
        }

        // POST /api/google-login
        if (route === 'google-login' && method === 'POST') {
            const { idToken } = await request.json();
            if (!idToken) return json({ error: 'Missing id_token' }, 400);

            const verifyRes = await fetch(
                `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
            );
            const tokenData = await verifyRes.json();
            if (!verifyRes.ok || tokenData.error || tokenData.error_description) {
                return json({ error: 'Invalid or expired Google token' }, 401);
            }
            if (tokenData.email_verified !== 'true' && tokenData.email_verified !== true) {
                return json({ error: 'Google account email not verified' }, 401);
            }

            const d = await readData();
            const clientId = d.settings?.googleClientId;
            if (clientId && tokenData.aud !== clientId) {
                return json({ error: 'Token audience mismatch' }, 401);
            }

            const email = (tokenData.email || '').toLowerCase();
            const user = d.users.find(u => u.googleEmail && u.googleEmail.toLowerCase() === email);
            if (!user) {
                return json({ error: 'No account linked to this Google address. Ask your admin to add it in Team settings.' }, 403);
            }
            const safeUser = Object.assign({}, user); delete safeUser.password;
            return json({ user: safeUser });
        }

        // POST /api/login - validates credentials server-side, returns user without password
        if (route === 'login' && method === 'POST') {
            const body = await request.json();
            if (!body.username || !body.password) return json({ error: 'Missing credentials' }, 400);
            const d = await readData();
            const user = d.users.find(u => u.username === body.username && u.password === body.password);
            if (!user) return json({ error: 'Invalid credentials' }, 401);
            const safe = Object.assign({}, user); delete safe.password;
            return json(safe);
        }

        // GET /api/orders
        if (route === 'orders' && method === 'GET') return json((await readData()).orders);
        // PUT /api/orders
        if (route === 'orders' && method === 'PUT') {
            const d = await readData();
            d.orders = await request.json();
            await writeData(d);
            return json(d.orders);
        }

        // GET /api/inventory
        if (route === 'inventory' && method === 'GET') return json((await readData()).inventory);
        // PUT /api/inventory
        if (route === 'inventory' && method === 'PUT') {
            const d = await readData();
            const oldInv = d.inventory;
            d.inventory = await request.json();
            await writeData(d);
            // Send low stock alerts when qty crosses below threshold
            if (env.RESEND_API_KEY) {
                const fromEmail = d.settings?.alertFromEmail || '';
                for (const item of d.inventory) {
                    if (!item.notifyEmail || !fromEmail) continue;
                    const old = oldInv.find(p => p.id === item.id);
                    const wasOk = old ? old.qty > old.threshold : true;
                    const isLow = item.qty <= item.threshold;
                    if (wasOk && isLow) {
                        fetch('https://api.resend.com/emails', {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                from: fromEmail,
                                to: item.notifyEmail,
                                subject: `Low Stock Alert: ${item.name}`,
                                html: `<p>Stock for <strong>${item.name}</strong> (SKU: ${item.sku}) has dropped to <strong>${item.qty}</strong>, which is at or below your threshold of ${item.threshold}.</p><p>Log in to the staff panel to restock.</p>`,
                            }),
                        }).catch(() => {});
                    }
                }
            }
            return json(d.inventory);
        }

        // GET /api/users (never expose passwords)
        if (route === 'users' && method === 'GET') {
            const users = (await readData()).users.map(function(u) { var c = Object.assign({}, u); delete c.password; return c; });
            return json(users);
        }
        // PUT /api/users - preserve passwords since client never holds them
        if (route === 'users' && method === 'PUT') {
            const d = await readData();
            const byId = {};
            d.users.forEach(u => { byId[u.id] = u; });
            const incoming = await request.json();
            d.users = incoming.map(nu => ({ ...nu, password: nu.password || (byId[nu.id] && byId[nu.id].password) || '' }));
            await writeData(d);
            const safe = d.users.map(function(u) { var c = Object.assign({}, u); delete c.password; return c; });
            return json(safe);
        }

        // POST /api/reset
        if (route === 'reset' && method === 'POST') {
            await writeData(DEFAULT_DATA);
            return json({ ok: true });
        }

        return json({ error: 'Not found' }, 404);
    } catch (err) {
        return json({ error: err.message }, 500);
    }
}
