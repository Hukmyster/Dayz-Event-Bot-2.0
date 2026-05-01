const fs = require("fs");

const DATA_DIR = "./data";
const SHOP_FILE = `${DATA_DIR}/shop.json`;
const ORDER_FILE = `${DATA_DIR}/orders.json`;

function init() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

    if (!fs.existsSync(SHOP_FILE))
        fs.writeFileSync(SHOP_FILE, JSON.stringify([], null, 2));

    if (!fs.existsSync(ORDER_FILE))
        fs.writeFileSync(ORDER_FILE, JSON.stringify([], null, 2));
}

init();

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

module.exports = {
    getShop: () => read(SHOP_FILE),
    saveShop: (d) => write(SHOP_FILE, d),

    getOrders: () => read(ORDER_FILE),
    saveOrders: (d) => write(ORDER_FILE, d)
};
