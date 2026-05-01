const fs = require("fs");
const path = require("path");

/* ---------------- FILE PATHS ---------------- */

const SHOP_FILE = path.join(__dirname, "../data/shop.json");
const ORDERS_FILE = path.join(__dirname, "../data/orders.json");

/* ---------------- MEMORY ---------------- */

let shop = [];
let orders = [];

/* ---------------- FILE HELPERS ---------------- */

function ensureFiles() {
  const dir = path.dirname(SHOP_FILE);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(SHOP_FILE)) {
    fs.writeFileSync(SHOP_FILE, "[]");
  }

  if (!fs.existsSync(ORDERS_FILE)) {
    fs.writeFileSync(ORDERS_FILE, "[]");
  }
}

function loadData() {
  ensureFiles();

  try {
    shop = JSON.parse(fs.readFileSync(SHOP_FILE, "utf-8") || "[]");
  } catch {
    shop = [];
  }

  try {
    orders = JSON.parse(fs.readFileSync(ORDERS_FILE, "utf-8") || "[]");
  } catch {
    orders = [];
  }
}

function saveShop() {
  ensureFiles();
  fs.writeFileSync(SHOP_FILE, JSON.stringify(shop, null, 2));
}

function saveOrders() {
  ensureFiles();
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

/* INIT LOAD */
loadData();

/* ---------------- SHOP FUNCTIONS ---------------- */

async function addItem(name, type, price) {
  if (!name || !type || price === undefined || price === null) {
    return { reply: "Invalid item data" };
  }

  const item = {
    id: Date.now().toString(),
    name: String(name),
    type: String(type),
    price: Number(price)
  };

  shop.push(item);
  saveShop();

  return { reply: `Added ${item.name} (${item.type}) - $${item.price}` };
}

async function deleteItem(name) {
  if (!name) return { reply: "Invalid item name" };

  const before = shop.length;
  shop = shop.filter(i => i.name !== name);
  const removed = before - shop.length;

  saveShop();

  return { reply: `Deleted ${removed} item(s) named ${name}` };
}

function getShopList() {
  return shop;
}

/* ---------------- BUY SYSTEM ---------------- */

async function buyItem(itemName, qty, x, z) {
  if (!itemName) return { reply: "Item not found" };

  const item = shop.find(i => i.name === itemName);

  if (!item) {
    return { reply: "Item not found in shop" };
  }

  const quantity = Number(qty) || 1;

  const order = {
    id: Date.now().toString(),
    item: item.name,
    type: item.type,
    price: item.price,
    qty: quantity,
    x: Number(x) || 0,
    z: Number(z) || 0,
    status: "queued",
    timestamp: Date.now()
  };

  orders.push(order);
  saveOrders();

  return {
    reply: `Queued ${quantity}x ${item.name} @ (${order.x},${order.z})`
  };
}

function getOrders() {
  return orders;
}

/* ---------------- AUTOCOMPLETE ---------------- */

function autocomplete(query) {
  if (!query) query = "";

  const q = query.toLowerCase();

  return shop
    .filter(i => (i.name || "").toLowerCase().includes(q))
    .slice(0, 25)
    .map(i => ({
      name: `${i.name} ($${i.price})`,
      value: i.name
    }));
}

/* ---------------- CLEAR ORDERS ---------------- */

function clearOrders() {
  orders = [];
  saveOrders();
}

/* ---------------- XML BUILD ---------------- */

function buildXML() {
  let events = "";
  let positions = "";

  for (const o of orders) {
    const id = `ShopEvent_${o.id}`;

    events += `
<event name="${id}">
  <nominal>1</nominal>
  <min>${o.qty}</min>
  <max>${o.qty}</max>
  <lifetime>3000</lifetime>
  <restock>3888000</restock>
  <saferadius>0</saferadius>
  <distanceradius>0</distanceradius>
  <cleanupradius>0</cleanupradius>
  <flags deletable="0" init_random="0" remove_damaged="1"/>
  <position>fixed</position>
  <limit>child</limit>
  <active>1</active>
  <children>
    <child lootmax="0" lootmin="0" max="${o.qty}" min="${o.qty}" type="${o.type}"/>
  </children>
</event>`;

    positions += `
<event name="${id}">
  <pos x="${o.x}" z="${o.z}" a="0"/>
</event>`;
  }

  return {
    eventsXML: `<events>${events}</events>`,
    positionsXML: `<eventposdef>${positions}</eventposdef>`
  };
}

/* ---------------- EXPORTS ---------------- */

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
