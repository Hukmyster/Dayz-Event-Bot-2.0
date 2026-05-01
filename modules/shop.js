const fs = require("fs");
const path = require("path");

const SHOP_FILE = path.join(__dirname, "../data/shop.json");

let shop = loadShop();
let orders = [];

function ensureFile() {
  const dir = path.dirname(SHOP_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(SHOP_FILE)) fs.writeFileSync(SHOP_FILE, JSON.stringify([]));
}

function loadShop() {
  ensureFile();
  return JSON.parse(fs.readFileSync(SHOP_FILE, "utf-8"));
}

function saveShop() {
  ensureFile();
  fs.writeFileSync(SHOP_FILE, JSON.stringify(shop, null, 2));
}

/* ---------------- SHOP ACTIONS ---------------- */

async function addItem(name, type, price) {
  const item = { id: Date.now().toString(), name, type, price };
  shop.push(item);
  saveShop();

  return {
    reply: `Added ${name} (${type})`,
  };
}

async function deleteItem(name) {
  shop = shop.filter(i => i.name !== name);
  saveShop();

  return {
    reply: `Deleted ${name} from shop`,
  };
}

async function getShopList() {
  return shop;
}

/* ---------------- BUY SYSTEM ---------------- */

async function buyItem(itemName, qty, x, z) {
  const item = shop.find(i => i.name === itemName);
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

  return {
    reply: `Queued ${qty}x ${item.name} @ (${x},${z})`
  };
}

function getOrders() {
  return orders;
}

/* ---------------- XML GENERATION ---------------- */

function buildXML() {
  let events = "";
  let positions = "";

  for (const o of orders) {
    const id = `ShopEvent_${o.id}`;

    const eventXML = `
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

    const posXML = `
<event name="${id}">
  <pos x="${o.x}" z="${o.z}" a="0"/>
</event>`;

    events += eventXML;
    positions += posXML;
  }

  return {
    eventsXML: `<events>${events}</events>`,
    positionsXML: `<eventposdef>${positions}</eventposdef>`
  };
}

/* ---------------- AUTOCOMPLETE ---------------- */

function autocomplete(query) {
  return shop
    .filter(i => i.name.toLowerCase().includes(query.toLowerCase()))
    .map(i => ({ name: i.name, value: i.name }));
}

/* ---------------- RESET ---------------- */

function clearOrders() {
  orders = [];
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
