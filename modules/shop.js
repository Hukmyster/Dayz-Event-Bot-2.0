const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { buildAllXML } = require("../xmlBuilder");

const ORDERS_FILE = path.join(__dirname, "../data/orders.json");
const CUSTOM_DIR = path.join(__dirname, "../custom");
const EVENTS_FILE = path.join(CUSTOM_DIR, "shopevents.xml");
const POS_FILE = path.join(CUSTOM_DIR, "eventposdef.xml");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

let orders = [];
let lastXML = { eventsXML: "", posXML: "" };

function ensureOrdersFile() {
  const dir = path.dirname(ORDERS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, "[]");
}

function loadOrders() {
  ensureOrdersFile();
  try {
    orders = JSON.parse(fs.readFileSync(ORDERS_FILE, "utf-8")) || [];
  } catch {
    orders = [];
  }
  if (!Array.isArray(orders)) orders = [];
}

function saveOrders() {
  ensureOrdersFile();
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

function ensureCustomDir() {
  if (!fs.existsSync(CUSTOM_DIR)) fs.mkdirSync(CUSTOM_DIR, { recursive: true });
}

function normalizeText(v) {
  return String(v ?? "").trim();
}

function normalizeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapShopRow(row) {
  return {
    id: row.id,
    name: row.displayName,
    type: row.type,
    price: Number(row.price)
  };
}

async function loadShop() {
  if (!supabase) throw new Error("Supabase client not configured");
  const { data, error } = await supabase.from("shop").select("id,displayName,type,price").order("created_at", { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data.map(mapShopRow) : [];
}

async function findShopItemByName(name) {
  const clean = normalizeText(name);
  const { data, error } = await supabase.from("shop").select("id,displayName,type,price").ilike("displayName", clean).limit(1).maybeSingle();
  if (error && error.code !== "PGRST116") throw error;
  return data ? mapShopRow(data) : null;
}

async function addItem(name, type, price) {
  name = normalizeText(name);
  type = normalizeText(type);
  price = normalizeNumber(price);
  if (!name || !type) return { reply: "Display name and type are required" };
  if (price === null || price < 0) return { reply: "Price must be a valid number" };
  if (!supabase) return { reply: "Supabase is not configured" };

  const existing = await supabase.from("shop").select("id").ilike("displayName", name).limit(1).maybeSingle();
  if (existing.error && existing.error.code !== "PGRST116") return { reply: `Database error: ${existing.error.message}` };
  if (existing.data) return { reply: `Item already exists: ${name}` };

  const { error } = await supabase.from("shop").insert([{ displayName: name, type, price }]);
  if (error) return { reply: `Database error: ${error.message}` };
  return { reply: `Added ${name} (${type})` };
}

async function editPrice(name, price) {
  name = normalizeText(name);
  price = normalizeNumber(price);
  if (!name) return { reply: "Item name is required" };
  if (price === null || price < 0) return { reply: "Price must be a valid number" };
  if (!supabase) return { reply: "Supabase is not configured" };

  const item = await findShopItemByName(name);
  if (!item) return { reply: "Item not found" };
  const { error } = await supabase.from("shop").update({ price }).eq("id", item.id);
  if (error) return { reply: `Database error: ${error.message}` };
  return { reply: `Updated ${item.name} price to ${price}` };
}

async function editName(name, newname) {
  name = normalizeText(name);
  newname = normalizeText(newname);
  if (!name || !newname) return { reply: "Current name and new name are required" };
  if (!supabase) return { reply: "Supabase is not configured" };

  const item = await findShopItemByName(name);
  if (!item) return { reply: "Item not found" };

  const existing = await supabase.from("shop").select("id").ilike("displayName", newname).limit(1).maybeSingle();
  if (existing.error && existing.error.code !== "PGRST116") return { reply: `Database error: ${existing.error.message}` };
  if (existing.data) return { reply: `An item already exists with the name ${newname}` };

  const { error } = await supabase.from("shop").update({ displayName: newname }).eq("id", item.id);
  if (error) return { reply: `Database error: ${error.message}` };
  return { reply: `Renamed item to ${newname}` };
}

async function deleteItem(name) {
  name = normalizeText(name);
  if (!name) return { reply: "Item name is required" };
  if (!supabase) return { reply: "Supabase is not configured" };

  const item = await findShopItemByName(name);
  if (!item) return { reply: "Item not found" };
  const { error } = await supabase.from("shop").delete().eq("id", item.id);
  if (error) return { reply: `Database error: ${error.message}` };
  return { reply: `Deleted ${item.name} (1 removed)` };
}

async function getShopList() {
  try { return await loadShop(); } catch { return []; }
}

async function buyItem(itemName, qty, x, z) {
  loadOrders();
  itemName = normalizeText(itemName);
  qty = normalizeNumber(qty);
  x = normalizeNumber(x);
  z = normalizeNumber(z);
  if (!itemName) return { reply: "Item is required" };
  if (!Number.isInteger(qty) || qty <= 0) return { reply: "Quantity must be a positive integer" };
  if (x === null || z === null) return { reply: "Coordinates must be valid numbers" };

  const items = await getShopList();
  const item = items.find(i => i.name.toLowerCase() === itemName.toLowerCase());
  if (!item) return { reply: "Item not found" };

  orders.push({ id: Date.now().toString(), item: item.name, type: item.type, qty, x, z, status: "queued" });
  saveOrders();
  return { reply: `Queued ${qty}x ${item.name} @ (${x},${z})` };
}

function getOrders() {
  loadOrders();
  return orders;
}

async function buildXML() {
  loadOrders();
  const xml = buildAllXML(orders);
  lastXML = xml;
  ensureCustomDir();
  if (xml.eventsXML) fs.writeFileSync(EVENTS_FILE, xml.eventsXML);
  if (xml.posXML) fs.writeFileSync(POS_FILE, xml.posXML);
  return { reply: `XML built successfully (${orders.length} orders)`, xml };
}

function viewXML() {
  ensureCustomDir();
  if (!fs.existsSync(EVENTS_FILE) || !fs.existsSync(POS_FILE)) return { reply: "No built XML found yet. Run /shopbuildxml first." };
  const eventsXML = fs.readFileSync(EVENTS_FILE, "utf-8");
  const posXML = fs.readFileSync(POS_FILE, "utf-8");
  return { reply: `--- shopevents.xml ---\n${eventsXML.slice(0, 3500)}\n\n--- eventposdef.xml ---\n${posXML.slice(0, 3500)}` };
}

async function pushXML() {
  const res = await buildXML();
  return { reply: `XML pushed to /custom folder. ${res.xml?.eventsFile ? "Files updated." : ""}` };
}

async function reloadData() {
  const items = await getShopList();
  loadOrders();
  return { reply: `Reloaded shop data. Items: ${items.length}, Orders: ${orders.length}` };
}

async function autocomplete(query) {
  const items = await getShopList();
  query = normalizeText(query).toLowerCase();
  if (!query) return [];
  return items.filter(i => i.name.toLowerCase().includes(query)).map(i => ({ name: i.name, value: i.name }));
}

function clearOrders() {
  orders = [];
  saveOrders();
  return { reply: "Cleared queued purchases" };
}

module.exports = { addItem, editPrice, editName, deleteItem, buyItem, getShopList, getOrders, buildXML, viewXML, pushXML, reloadData, autocomplete, clearOrders };
