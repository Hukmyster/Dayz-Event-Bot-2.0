const fs = require("fs");
const path = require("path");
const { buildAllXML } = require("../xmlBuilder");

const SHOP_FILE = path.join(__dirname, "../data/shop.json");
const ORDERS_FILE = path.join(__dirname, "../data/orders.json");

let shop = [];
let orders = [];

function ensureFiles() {
  const dir = path.dirname(SHOP_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(SHOP_FILE)) fs.writeFileSync(SHOP_FILE, "[]");
  if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, "[]");
}

function loadAll() {
  ensureFiles();
  try {
    shop = JSON.parse(fs.readFileSync(SHOP_FILE, "utf-8"));
  } catch {
    shop = [];
  }

  try {
    orders = JSON.parse(fs.readFileSync(ORDERS_FILE, "utf-8"));
  } catch {
    orders = [];
  }
}

function saveShop() {
  fs.writeFileSync(SHOP_FILE, JSON.stringify(shop, null, 2));
}

function saveOrders() {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

loadAll();

function normalizeText(v) {
  return String(v ?? "").trim();
}

function normalizeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function addItem(name, type, price) {
  loadAll();

  name = normalizeText(name);
  type = normalizeText(type);
  price = normalizeNumber(price);

  if (!name || !type) return { reply: "Item name and type are required" };
  if (price === null || price < 0) return { reply: "Price must be a valid number" };

  if (shop.some(i => i.name.toLowerCase() === name.toLowerCase())) {
    return { reply: `Item already exists: ${name}` };
  }

  const item = {
    id: Date.now().toString(),
    name,
    type,
    price
  };

  shop.push(item);
  saveShop();

  return { reply: `Added ${name} (${type})` };
}

async function deleteItem(name) {
  loadAll();

  name = normalizeText(name);

  const before = shop.length;
  shop = shop.filter(i => i.name.toLowerCase() !== name.toLowerCase());

  saveShop();

  return {
    reply: `Deleted ${name} (${before - shop.length} removed)`
  };
}

function getShopList() {
  loadAll();
  return shop;
}

async function buyItem(itemName, qty, x, z) {
  loadAll();

  itemName = normalizeText(itemName);
  qty = normalizeNumber(qty);
  x = normalizeNumber(x);
  z = normalizeNumber(z);

  if (!itemName) return { reply: "Item is required" };
  if (!Number.isInteger(qty) || qty <= 0) return { reply: "Quantity must be a positive integer" };
  if (x === null || z === null) return { reply: "Coordinates must be valid numbers" };

  const item = shop.find(i => i.name.toLowerCase() === itemName.toLowerCase());
  if (!item) return { reply: "Item not found" };

  const order = {
    id: Date.now().toString(),
    item: item.name,
    type: item.type,
    qty,
    x,
    z,
    status: "queued"
  };

  orders.push(order);
  saveOrders();

  return {
    reply: `Queued ${qty}x ${item.name} @ (${x},${z})`
  };
}

function getOrders() {
  loadAll();
  return orders;
}

async function buildXML() {
  loadAll();
  const xml = await buildAllXML(orders);
  return { reply: "XML built successfully", xml };
}

function autocomplete(query) {
  loadAll();

  query = normalizeText(query).toLowerCase();
  if (!query) return [];

  return shop
    .filter(i => i.name.toLowerCase().includes(query))
    .map(i => ({
      name: i.name,
      value: i.name
    }));
}

function clearOrders() {
  orders = [];
  saveOrders();
}

module.exports = {
  addItem,
  deleteItem,
  buyItem,
  getShopList,
  getOrders,
  buildXML,
  autocomplete,
  clearOrders
};
