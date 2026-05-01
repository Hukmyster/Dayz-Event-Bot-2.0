const fs = require("fs");

// =========================
// FILE PATHS
// =========================
const DATA_DIR = "./data";
const SHOP_FILE = `${DATA_DIR}/shop.json`;
const ORDER_FILE = `${DATA_DIR}/orders.json`;

// =========================
// INIT STORAGE (CRITICAL FIX)
// =========================
function init() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (!fs.existsSync(SHOP_FILE)) {
        fs.writeFileSync(SHOP_FILE, "[]");
    }

    if (!fs.existsSync(ORDER_FILE)) {
        fs.writeFileSync(ORDER_FILE, "[]");
    }
}

// run immediately on load
init();

// =========================
// HELPERS
// =========================
function read(file) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return [];
    }
}

function write(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// =========================
// SHOP
// =========================
function getShop() {
    return read(SHOP_FILE);
}

function saveShop(data) {
    write(SHOP_FILE, data);
}

// =========================
// ORDERS
// =========================
function getOrders() {
    return read(ORDER_FILE);
}

function saveOrders(data) {
    write(ORDER_FILE, data);
}

// =========================
// CLEAR ALL DATA (SAFE RESET)
// =========================
function resetAll() {
    write(SHOP_FILE, []);
    write(ORDER_FILE, []);
}

module.exports = {
    getShop,
    saveShop,
    getOrders,
    saveOrders,
    resetAll
};
