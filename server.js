const express = require("express");
const fs      = require("fs");
const path    = require("path");

const app      = express();
const PORT     = process.env.PORT || 3000;
const DATA_FILE = fs.existsSync("/data") ? "/data/data.json" : path.join(__dirname, "data.json");

// Passwords set via environment variables on Render (ADMIN_PASSWORD, STAFF_PASSWORD)
const DEFAULT_DATA = {
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

if (\!fs.existsSync(DATA_FILE)) {
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
    if (\!username || \!password) return res.status(400).json({ error: "Missing credentials" });
    var user = readData().users.find(function(u) { return u.username === username && u.password === password; });
    if (\!user) return res.status(401).json({ error: "Invalid credentials" });
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

app.post("/api/reset", function(req, res) { writeData(DEFAULT_DATA); res.json({ ok: true }); });

app.listen(PORT, function() { console.log("QD Admin running -> http://localhost:" + PORT); });
