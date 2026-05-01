const fs = require("fs");

const shopFile = "./data/shop.json";
const orderFile = "./data/orders.json";

// =========================
// SAFE LOAD
// =========================
function load(file) {
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function save(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// =========================
// SHOP
// =========================
function getShop() {
    return load(shopFile);
}

function saveShop(data) {
    save(shopFile, data);
}

// =========================
// ORDERS
// =========================
function getOrders() {
    return load(orderFile);
}

function saveOrders(data) {
    save(orderFile, data);
}

module.exports = {
    getShop,
    saveShop,
    getOrders,
    saveOrders
};
