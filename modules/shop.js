const fs = require("fs");
const path = require("path");

const SHOP_FILE = path.join(__dirname, "../data/shop.json");
const ORDERS_FILE = path.join(__dirname, "../data/orders.json");

let shop = [];
let orders = [];

/* ---------------- FILE SAFETY ---------------- */

function ensureFiles() {
  const dir = path.dirname(SHOP_FILE);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(SHOP_FILE)) {
    fs.writeFileSync(SHOP_FILE, JSON.stringify([]));
  }

  if (!fs.existsSync(ORDERS_FILE)) {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify([]));
  }
}

/* ---------------- LOAD / SAVE ---------------- */

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

/* auto-load on startup */
loadAll();

/* ---------------- SHOP ---------------- */

function addItem(name, type, price) {
  const item = {
    id: Date.now().toString(),
    name: name.trim(),
    type: type.trim(),
    price: Number(price)
  };

  shop.push(item);
  saveShop();

  return `Added ${item.name} (${item.type})`;
}

function deleteItem(name) {
  const before = shop.length;

  shop = shop.filter(
    i => i.name.toLowerCase() !== name.toLowerCase()
  );

  saveShop();

  return before === shop.length
    ? `Item not found`
    : `Deleted ${name}`;
}

function getShopList() {
  loadAll();
  return shop;
}

/* ---------------- ORDERS ---------------- */

function createOrder(itemName, qty, x, z) {
  loadAll();

  const item = shop.find(
    i => i.name.toLowerCase() === itemName.toLowerCase()
  );

  if (!item) return { error: "Item not found" };

  const quantity = Math.max(1, Number(qty || 1));

  const order = {
    id: Date.now().toString(),
    item: item.name,
    type: item.type,
    qty: quantity,
    x,
    z,
    status: "queued",
    created: Date.now()
  };

  orders.push(order);
  saveOrders();

  return {
    message: `Queued ${quantity}x ${item.name} @ (${x},${z})`
  };
}

function getOrders() {
  loadAll();
  return orders;
}

function clearOrders() {
  orders = [];
  saveOrders();
}

/* ---------------- XML ---------------- */

function buildXML() {
  loadAll();

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
    eventsXML: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<events>${events}
</events>`,

    positionsXML: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<eventposdef>${positions}
</eventposdef>`
  };
}

/* ---------------- AUTOCOMPLETE ---------------- */

function autocomplete(query = "") {
  loadAll();

  return shop
    .filter(i =>
      i.name.toLowerCase().includes(query.toLowerCase())
    )
    .map(i => ({
      name: `${i.name} ($${i.price})`,
      value: i.name
    }));
}

/* ---------------- EXPORT ---------------- */

module.exports = {
  addItem,
  deleteItem,
  createOrder,
  getShopList,
  getOrders,
  buildXML,
  autocomplete,
  clearOrders
};
