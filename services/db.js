const fs = require("fs");

const DATA_DIR = "./data";
const SHOP_FILE = `${DATA_DIR}/shop.json`;
const ORDERS_FILE = `${DATA_DIR}/orders.json`;

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
  if (!fs.existsSync(SHOP_FILE)) fs.writeFileSync(SHOP_FILE, "[]");
  if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, "[]");
}

function load(file) {
  ensure();
  return JSON.parse(fs.readFileSync(file));
}

function save(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

module.exports = {
  getShop: () => load(SHOP_FILE),
  saveShop: (d) => save(SHOP_FILE, d),
  getOrders: () => load(ORDERS_FILE),
  saveOrders: (d) => save(ORDERS_FILE, d)
};
