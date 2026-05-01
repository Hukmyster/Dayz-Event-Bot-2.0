const fs = require("fs");
const path = require("path");

const SHOP_FILE = path.join(__dirname, "../data/shop.json");
const ORDERS_FILE = path.join(__dirname, "../data/orders.json");

let shop = [];
let orders = [];

/* ---------------- FILE SAFETY ---------------- */

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

/* ALWAYS LOAD ON IMPORT */
loadAll();

/* ---------------- SHOP ---------------- */

async function addItem(name, type, price) {
  loadAll();

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

  const before = shop.length;
  shop = shop.filter(i => i.name !== name);

  saveShop();

  return {
    reply: `Deleted ${name} (${before - shop.length} removed)`
  };
}

function getShopList() {
  loadAll();
  return shop;
}

/* ---------------- BUY ---------------- */

async function buyItem(itemName, qty, x, z) {
  loadAll();

  const item = shop.find(i => i.name === itemName);
  if (!item) return { reply: "Item not found in shop" };

  const order = {
    id: Date.now().toString(),
    item: item.name,
    type: item.type,
    qty: Number(qty),
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

function
