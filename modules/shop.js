const fs = require("fs");
const path = require("path");
const { buildAllXML } = require("../xmlBuilder");

const SHOP_FILE = path.join(__dirname, "../data/shop.json");
const ORDERS_FILE = path.join(__dirname, "../data/orders.json");
const CUSTOM_DIR = path.join(__dirname, "../custom");
const EVENTS_FILE = path.join(CUSTOM_DIR, "shopevents.xml");
const POS_FILE = path.join(CUSTOM_DIR, "eventposdef.xml");

let shop = [];
let orders = [];
let lastXML = { eventsXML: "", posXML: "" };

function ensureFiles() {
  const dir = path.dirname(SHOP_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(SHOP_FILE)) fs.writeFileSync(SHOP_FILE, "[]");
  if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, "[]");
}

function loadAll() {
  ensureFiles();
  try { shop = JSON.parse(fs.readFileSync(SHOP_FILE, "utf-8")); } catch { shop = []; }
  try { orders = JSON.parse(fs.readFileSync(ORDERS_FILE, "utf-8")); } catch { orders = []; }
}

function saveShop() {
  fs.writeFileSync(SHOP_FILE, JSON.stringify(shop, null, 2));
}

function saveOrders() {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

function ensureCustomDir() {
  if (!fs.existsSync(CUSTOM_DIR)) fs.mkdirSync(CUSTOM_DIR, { recursive: true });
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
  if (shop.some(i => i.name.toLowerCase() === name.toLowerCase())) return { reply: `Item already exists: ${name}` };
  shop.push({ id: Date.now().toString(), name, type, price });
  saveShop();
  return { reply: `Added ${name} (${type})` };
}

async function editPrice(name, price) {
  loadAll();
  name = normalizeText(name);
  price = normalizeNumber(price);
  if (!name) return { reply: "Item name is required" };
  if (price === null || price < 0) return { reply: "Price must be a valid number" };
  const item = shop.find(i => i.name.toLowerCase() === name.toLowerCase());
  if (!item) return { reply: "Item not found" };
  item.price = price;
  saveShop();
  return { reply: `Updated ${item.name} price to ${price}` };
}

async function editName(name, newname) {
  loadAll();
  name = normalizeText(name);
  newname = normalizeText(newname);
  if (!name || !newname) return { reply: "Current name and new name are required" };
  const item = shop.find(i => i.name.toLowerCase() === name.toLowerCase());
  if (!item) return { reply: "Item not found" };
  if (shop.some(i => i.name.toLowerCase() === newname.toLowerCase())) return { reply: `An item already exists with the name ${newname}` };
  item.name = newname;
  saveShop();
  return { reply: `Renamed item to ${newname}` };
}

async function deleteItem(name) {
  loadAll();
  name = normalizeText(name);
  const before = shop.length;
  shop = shop.filter(i => i.name.toLowerCase() !== name.toLowerCase());
  saveShop();
  return { reply: `Deleted ${name} (${before - shop.length} removed)` };
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
  orders.push({ id: Date.now().toString(), item: item.name, type: item.type, qty, x, z, status: "queued" });
  saveOrders();
  return { reply: `Queued ${qty}x ${item.name} @ (${x},${z})` };
}

function getOrders() {
  loadAll();
  return orders;
}

async function buildXML() {
  loadAll();
  const xml = await buildAllXML(orders);
  lastXML = xml;
  ensureCustomDir();
  if (xml.eventsXML) fs.writeFileSync(EVENTS_FILE, xml.eventsXML);
  if (xml.posXML) fs.writeFileSync(POS_FILE, xml.posXML);
  return { reply: `XML built successfully (${orders.length} orders)`, xml };
}

function viewXML() {
  ensureCustomDir();
  if (!fs.existsSync(EVENTS_FILE) || !fs.existsSync(POS_FILE)) {
    return { reply: "No built XML found yet. Run /shopbuildxml first." };
  }
  const eventsXML = fs.readFileSync(EVENTS_FILE, "utf-8");
  const posXML = fs.readFileSync(POS_FILE, "utf-8");
  const content = `--- shopevents.xml ---\n${eventsXML.slice(0, 3500)}\n\n--- eventposdef.xml ---\n${posXML.slice(0, 3500)}`;
  return { reply: content };
}

async function pushXML() {
  const res = await buildXML();
  return { reply: `XML pushed to /custom folder. ${res.xml?.eventsFile ? "Files updated." : ""}` };
}

async function reloadData() {
  loadAll();
  return { reply: `Reloaded shop data. Items: ${shop.length}, Orders: ${orders.length}` };
}

function autocomplete(query) {
  loadAll();
  query = normalizeText(query).toLowerCase();
  if (!query) return [];
  return shop.filter(i => i.name.toLowerCase().includes(query)).map(i => ({ name: i.name, value: i.name }));
}

function clearOrders() {
  orders = [];
  saveOrders();
  return { reply: "Cleared queued purchases" };
}

module.exports = {
  addItem,
  editPrice,
  editName,
  deleteItem,
  buyItem,
  getShopList,
  getOrders,
  buildXML,
  viewXML,
  pushXML,
  reloadData,
  autocomplete,
  clearOrders
};
