// Cloudflare Pages Function — handles all /api/* routes
// Data is stored in Cloudflare KV (bound as QD_DATA)

const DEFAULT_DATA = {
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
    orders: [
        { id: 'QD-001', customer: 'Fatima Al-Hassan', date: '2026-03-01', items: '2x Standard Pack',               total: 25.98, status: 'delivered',  notes: '' },
        { id: 'QD-002', customer: 'Mohammed Reza',    date: '2026-03-03', items: '1x Deluxe Pack',                 total: 19.99, status: 'shipped',    notes: 'Gift wrap requested' },
        { id: 'QD-003', customer: 'Zainab Karimi',    date: '2026-03-05', items: '1x Bundle',                     total: 19.99, status: 'processing', notes: '' },
        { id: 'QD-004', customer: 'Hassan Al-Amin',   date: '2026-03-06', items: '3x Standard Pack',               total: 38.97, status: 'pending',    notes: '' },
        { id: 'QD-005', customer: 'Mariam Sadiq',     date: '2026-03-07', items: '1x Standard Pack, 1x Expansion', total: 21.98, status: 'pending',    notes: 'Urgent' },
        { id: 'QD-006', customer: 'Ali Hussain',      date: '2026-03-02', items: '1x Deluxe Pack',                 total: 19.99, status: 'cancelled',  notes: 'Customer requested cancellation' },
    ],
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
            // First boot — seed KV with defaults
            await env.QD_DATA.put('data', JSON.stringify(DEFAULT_DATA));
            return DEFAULT_DATA;
        }
        return JSON.parse(raw);
    }

    async function writeData(d) {
        await env.QD_DATA.put('data', JSON.stringify(d));
    }

    try {
        // GET /api/health
        if (route === 'health' && method === 'GET') return json({ ok: true });

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

        // GET /api/users
        if (route === 'users' && method === 'GET') return json((await readData()).users);
        // PUT /api/users
        if (route === 'users' && method === 'PUT') {
            const d = await readData();
            d.users = await request.json();
            await writeData(d);
            return json(d.users);
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
