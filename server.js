const express = require("express");
const fs      = require("fs");
const path    = require("path");

const app      = express();
const PORT     = process.env.PORT || 3000;
const DATA_FILE = fs.existsSync("/data") ? "/data/data.json" : path.join(__dirname, "data.json");

// Passwords set via environment variables on Render (ADMIN_PASSWORD, STAFF_PASSWORD)
const DEFAULT_DATA = {
    contacts: [],
    interests: [],
    members: [],
    users: [
        { id: "u1", username: "mamda006.310", password: process.env.ADMIN_PASSWORD || "", name: "Abbas M",  role: "admin" },
        { id: "u2", username: "zjets988",     password: process.env.STAFF_PASSWORD  || "", name: "Zahra J",  role: "staff" },
    ],
    inventory: [
        { id: "p1", name: "Shia Deal Standard Pack",      sku: "SD-001", price: 12.99, qty: 48, threshold: 10, notes: "" },
        { id: "p2", name: "Shia Deal Deluxe Pack",        sku: "SD-002", price: 19.99, qty: 22, threshold:  8, notes: "" },
        { id: "p3", name: "Shia Deal Expansion Pack",     sku: "SD-EXP", price:  8.99, qty:  7, threshold: 10, notes: "Running low -- reorder soon" },
        { id: "p4", name: "Shia Deal Bundle (Std + Exp)", sku: "SD-BUN", price: 19.99, qty:  3, threshold:  5, notes: "" },
    ],
    orders: [],
};

if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_DATA, null, 2));
    console.log("Created data.json with default data");
}

function readData()        { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }
function writeData(d)      { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); }
function stripPw(users)    { return users.map(function(u) { var c = Object.assign({}, u); delete c.password; return c; }); }

app.use(express.json());
app.use(express.static(__dirname));

app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.sendStatus(200);
    next();
});

app.get("/api/health",    function(req, res) { res.json({ ok: true }); });
app.get("/api/orders",    function(req, res) { res.json(readData().orders); });
app.get("/api/inventory", function(req, res) { res.json(readData().inventory); });

// Never expose passwords to the client
app.get("/api/users", function(req, res) { res.json(stripPw(readData().users)); });

// Server-side login -- returns user without password on success
app.post("/api/login", function(req, res) {
    var body = req.body || {};
    var username = body.username; var password = body.password;
    if (!username || !password) return res.status(400).json({ error: "Missing credentials" });
    var user = readData().users.find(function(u) { return u.username === username && u.password === password; });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    var safe = Object.assign({}, user); delete safe.password;
    res.json(safe);
});

app.put("/api/orders",    function(req, res) { var d = readData(); d.orders    = req.body; writeData(d); res.json(d.orders);    });
app.put("/api/inventory", function(req, res) { var d = readData(); d.inventory = req.body; writeData(d); res.json(d.inventory); });

// Preserve existing passwords -- client never holds them so cannot send them back
app.put("/api/users", function(req, res) {
    var d = readData();
    var byId = {};
    d.users.forEach(function(u) { byId[u.id] = u; });
    d.users = req.body.map(function(nu) {
        return Object.assign({}, nu, { password: nu.password || (byId[nu.id] && byId[nu.id].password) || "" });
    });
    writeData(d);
    res.json(stripPw(d.users));
});

app.get("/api/contacts", function(req, res) { res.json(readData().contacts || []); });

app.post("/api/contact", function(req, res) {
    var b = req.body || {};
    if (!b.name || !b.email || !b.subject || !b.message) return res.status(400).json({ error: "Missing fields" });
    var d = readData();
    if (!d.contacts) d.contacts = [];
    d.contacts.unshift({ id: "c" + Date.now(), name: b.name, email: b.email, subject: b.subject, message: b.message, date: new Date().toISOString(), status: "received" });
    writeData(d);
    res.json({ ok: true });
});

app.put("/api/contacts/:id", function(req, res) {
    var d = readData();
    var contact = (d.contacts || []).find(function(c) { return c.id === req.params.id; });
    if (!contact) return res.status(404).json({ error: "Not found" });
    Object.assign(contact, req.body);
    writeData(d);
    res.json({ ok: true });
});

app.delete("/api/contacts/:id", function(req, res) {
    var d = readData();
    d.contacts = (d.contacts || []).filter(function(c) { return c.id !== req.params.id; });
    writeData(d);
    res.json({ ok: true });
});

app.get("/api/interests", function(req, res) { res.json(readData().interests || []); });

app.post("/api/interest", function(req, res) {
    var b = req.body || {};
    if (!b.parentName || !b.email || !b.childName || !b.childAge) return res.status(400).json({ error: "Missing fields" });
    var d = readData();
    if (!d.interests) d.interests = [];
    d.interests.unshift({ id: "i" + Date.now(), parentName: b.parentName, email: b.email, phone: b.phone || "", childName: b.childName, childAge: b.childAge, message: b.message || "", date: new Date().toISOString(), status: "new" });
    writeData(d);
    res.json({ ok: true });
});

app.put("/api/interests/:id", function(req, res) {
    var d = readData();
    var item = (d.interests || []).find(function(i) { return i.id === req.params.id; });
    if (!item) return res.status(404).json({ error: "Not found" });
    Object.assign(item, req.body);
    writeData(d);
    res.json({ ok: true });
});

app.delete("/api/interests/:id", function(req, res) {
    var d = readData();
    d.interests = (d.interests || []).filter(function(i) { return i.id !== req.params.id; });
    writeData(d);
    res.json({ ok: true });
});

// POST /api/member-login
app.post("/api/member-login", function(req, res) {
    var body = req.body || {};
    if (!body.login || !body.password) return res.status(400).json({ error: "Missing credentials" });
    var login = body.login.toLowerCase().trim();
    var d = readData();
    var member = (d.members || []).find(function(m) {
        return m.active !== false &&
            m.password === body.password &&
            ((m.email || "").toLowerCase() === login || (m.username || "").toLowerCase() === login);
    });
    if (!member) return res.status(401).json({ error: "Invalid credentials or account not found" });
    if (member.expiryDate && new Date(member.expiryDate) < new Date()) {
        return res.status(403).json({ error: "Your membership has expired. Please contact us to renew." });
    }
    var safe = Object.assign({}, member); delete safe.password;
    res.json({ member: safe });
});

// GET /api/members (never expose passwords)
app.get("/api/members", function(req, res) {
    var d = readData();
    res.json((d.members || []).map(function(m) { var c = Object.assign({}, m); delete c.password; return c; }));
});

// PUT /api/members — preserve passwords
app.put("/api/members", function(req, res) {
    var d = readData();
    var byId = {};
    (d.members || []).forEach(function(m) { byId[m.id] = m; });
    d.members = req.body.map(function(nm) {
        return Object.assign({}, nm, { password: nm.password || (byId[nm.id] && byId[nm.id].password) || "" });
    });
    writeData(d);
    res.json(d.members.map(function(m) { var c = Object.assign({}, m); delete c.password; return c; }));
});

app.post("/api/reset", function(req, res) { writeData(DEFAULT_DATA); res.json({ ok: true }); });

app.listen(PORT, function() { console.log("QD Admin running -> http://localhost:" + PORT); });
