// Cloudflare Pages Function — handles all /api/* routes
// Data is stored in Cloudflare KV (bound as QD_DATA)

const DEFAULT_DATA = {
    contacts: [],
    interests: [],
    members: [],
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
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
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
        if (!d.members) d.members = [];
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
            d.inventory = await request.json();
            await writeData(d);
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

        // GET /api/contacts
        if (route === 'contacts' && method === 'GET') return json((await readData()).contacts || []);

        // POST /api/contact
        if (route === 'contact' && method === 'POST') {
            const b = await request.json();
            if (!b.name || !b.email || !b.subject || !b.message) return json({ error: 'Missing fields' }, 400);
            const d = await readData();
            if (!d.contacts) d.contacts = [];
            d.contacts.unshift({ id: 'c' + Date.now(), name: b.name, email: b.email, subject: b.subject, message: b.message, date: new Date().toISOString(), status: 'received' });
            await writeData(d);
            return json({ ok: true });
        }

        // PUT /api/contacts/:id
        if (route.startsWith('contacts/') && method === 'PUT') {
            const id = route.slice('contacts/'.length);
            const b = await request.json();
            const d = await readData();
            const contact = (d.contacts || []).find(c => c.id === id);
            if (!contact) return json({ error: 'Not found' }, 404);
            Object.assign(contact, b);
            await writeData(d);
            return json({ ok: true });
        }

        // DELETE /api/contacts/:id
        if (route.startsWith('contacts/') && method === 'DELETE') {
            const id = route.slice('contacts/'.length);
            const d = await readData();
            d.contacts = (d.contacts || []).filter(c => c.id !== id);
            await writeData(d);
            return json({ ok: true });
        }

        // GET /api/interests
        if (route === 'interests' && method === 'GET') return json((await readData()).interests || []);

        // POST /api/interest
        if (route === 'interest' && method === 'POST') {
            const b = await request.json();
            if (!b.parentName || !b.email || !b.childName || !b.childAge) return json({ error: 'Missing fields' }, 400);
            const d = await readData();
            if (!d.interests) d.interests = [];
            d.interests.unshift({ id: 'i' + Date.now(), parentName: b.parentName, email: b.email, phone: b.phone || '', childName: b.childName, childAge: b.childAge, programme: b.programme || '', format: b.format || '', message: b.message || '', date: new Date().toISOString(), status: 'new' });
            await writeData(d);
            return json({ ok: true });
        }

        // PUT /api/interests/:id
        if (route.startsWith('interests/') && method === 'PUT') {
            const id = route.slice('interests/'.length);
            const b = await request.json();
            const d = await readData();
            const item = (d.interests || []).find(i => i.id === id);
            if (!item) return json({ error: 'Not found' }, 404);
            Object.assign(item, b);
            await writeData(d);
            return json({ ok: true });
        }

        // DELETE /api/interests/:id
        if (route.startsWith('interests/') && method === 'DELETE') {
            const id = route.slice('interests/'.length);
            const d = await readData();
            d.interests = (d.interests || []).filter(i => i.id !== id);
            await writeData(d);
            return json({ ok: true });
        }

        // POST /api/member-google-login
        if (route === 'member-google-login' && method === 'POST') {
            const { idToken } = await request.json();
            if (!idToken) return json({ error: 'Missing id_token' }, 400);

            const verifyRes = await fetch(
                `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
            );
            const tokenData = await verifyRes.json();
            if (!verifyRes.ok || tokenData.error) {
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

            // Staff users get automatic member access
            const staffUser = (d.users || []).find(u =>
                u.googleEmail && u.googleEmail.toLowerCase() === email
            );
            if (staffUser) {
                return json({ member: {
                    id: 'staff-' + staffUser.id,
                    name: staffUser.name,
                    email: staffUser.googleEmail,
                    plan: 'Staff',
                    active: true,
                    isStaff: true,
                    memberSince: null,
                    expiryDate: null,
                }});
            }

            // Check members (match by email or googleEmail field)
            const member = (d.members || []).find(m =>
                m.active !== false &&
                ((m.email || '').toLowerCase() === email || (m.googleEmail || '').toLowerCase() === email)
            );
            if (!member) {
                return json({ error: 'No member account found for this Google address. Contact us to get access.' }, 403);
            }
            if (member.expiryDate && new Date(member.expiryDate) < new Date()) {
                return json({ error: 'Your membership has expired. Please contact us to renew.' }, 403);
            }
            const safeMember = Object.assign({}, member); delete safeMember.password;
            return json({ member: safeMember });
        }

        // POST /api/member-login
        if (route === 'member-login' && method === 'POST') {
            const body = await request.json();
            if (!body.login || !body.password) return json({ error: 'Missing credentials' }, 400);
            const d = await readData();
            const login = body.login.toLowerCase().trim();
            const member = (d.members || []).find(m =>
                m.active !== false &&
                m.password === body.password &&
                ((m.email || '').toLowerCase() === login || (m.username || '').toLowerCase() === login)
            );
            if (!member) return json({ error: 'Invalid credentials or account not found' }, 401);
            if (member.expiryDate && new Date(member.expiryDate) < new Date()) {
                return json({ error: 'Your membership has expired. Please contact us to renew.' }, 403);
            }
            const safe = Object.assign({}, member); delete safe.password;
            return json({ member: safe });
        }

        // GET /api/members (never expose passwords)
        if (route === 'members' && method === 'GET') {
            const d = await readData();
            const safe = (d.members || []).map(function(m) { var c = Object.assign({}, m); delete c.password; return c; });
            return json(safe);
        }

        // PUT /api/members — preserve passwords since client never holds them
        if (route === 'members' && method === 'PUT') {
            const d = await readData();
            const byId = {};
            (d.members || []).forEach(m => { byId[m.id] = m; });
            const incoming = await request.json();
            d.members = incoming.map(nm => ({ ...nm, password: nm.password || (byId[nm.id] && byId[nm.id].password) || '' }));
            await writeData(d);
            const safe = d.members.map(function(m) { var c = Object.assign({}, m); delete c.password; return c; });
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
