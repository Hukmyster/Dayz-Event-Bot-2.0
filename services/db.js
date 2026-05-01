const fs = require("fs");

const DATA_DIR = "./data";
const SHOP_FILE = `${DATA_DIR}/shop.json`;
const ORDER_FILE = `${DATA_DIR}/orders.json`;

// =========================
// SAFE INIT (NEVER WIPE DATA)
// =========================
function init() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (!fs.existsSync(SHOP_FILE)) {
        fs.writeFileSync(SHOP_FILE, JSON.stringify([], null, 2));
    }

    if (!fs.existsSync(ORDER_FILE)) {
        fs.writeFileSync(ORDER_FILE, JSON.stringify([], null, 2));
    }
}

init();

// =========================
// SAFE READ/WRITE
// =========================
function read(file) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (err) {
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
// SAFE CLEAR FUNCTIONS ONLY
// =========================
function clearShop() {
    write(SHOP_FILE, []);
}

function clearOrders() {
    write(ORDER_FILE, []);
}

module.exports = {
    getShop,
    saveShop,
    getOrders,
    saveOrders,
    clearShop,
    clearOrders
};
