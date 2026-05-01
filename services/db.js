const fs = require("fs");

const SHOP_FILE = "./shop.json";
const ORDER_FILE = "./orders.json";

function load(file, fallback) {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file));
}

function save(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

module.exports = {

    loadData() {},

    getShop() {
        return load(SHOP_FILE, []);
    },

    saveShop(data) {
        save(SHOP_FILE, data);
    },

    getOrders() {
        return load(ORDER_FILE, []);
    },

    saveOrders(data) {
        save(ORDER_FILE, data);
    }
};
