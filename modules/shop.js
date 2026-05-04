const fs = require("fs");
const path = require("path");
const debug = require("../utils/debug");
const { createClient } = require("@supabase/supabase-js");
const { buildAllXML } = require("../xmlBuilder");
const economy = require("./economy");

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
  } catch (err) {
    debug.fail("shop.loadOrders", err, { file: ORDERS_FILE });
    orders = [];
  }
  if (!Array.isArray(orders)) orders = [];
}

function saveOrders() {
  ensureOrdersFile();
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
  debug.ok("shop.saveOrders", { count: orders.length, file: ORDERS_FILE });
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
    name: row.displayname,
    displayname: row.displayname,
    type: row.type,
    price: Number(row.price)
  };
}

async function loadShop() {
  if (!supabase) {
    debug.fail("shop.loadShop", new Error("Supabase client not configured"), {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseKey
    });
    throw new Error("Supabase client not configured");
  }

  const { data, error } = await supabase
    .from("shop")
    .select("id,displayname,type,price");

  if (error) {
    debug.supabaseError("shop.loadShop", "select", error, { table: "shop" });
    throw error;
  }

  debug.ok("shop.loadShop", { rows: data?.length || 0 });
  return Array.isArray(data) ? data.map(mapShopRow) : [];
}

async function findShopItemByName(name) {
  const clean = normalizeText(name).toLowerCase();
  const items = await loadShop();

  const exact = items.find(i => i.name.toLowerCase() === clean);
  if (exact) return exact;

  return items.find(i => i.name.toLowerCase().includes(clean)) || null;
}

async function addItem(name, type, price) {
  name = normalizeText(name);
  type = normalizeText(type);
  price = normalizeNumber(price);

  debug.step("shop.addItem", { name, type, price });

  if (!name || !type) return { reply: "Display name and type are required" };
  if (price === null || price < 0) return { reply: "Price must be a valid number" };
  if (!supabase) return { reply: "Supabase is not configured" };

  const existing = await loadShop();
  if (existing.some(i => i.name.toLowerCase() === name.toLowerCase())) {
    return { reply: `Item already exists: ${name}` };
  }

  const { data, error } = await supabase
    .from("shop")
    .insert([{ displayname: name, type, price }])
    .select("id,displayname,type,price");

  if (error) {
    debug.supabaseError("shop.addItem", "insert", error, {
      values: { displayname: name, type, price }
    });
    return { reply: `Database error: ${error.message}` };
  }

  debug.ok("shop.addItem", { inserted: data?.[0] || null });
  return { reply: `Added ${name}` };
}

async function editPrice(name, price) {
  name = normalizeText(name);
  price = normalizeNumber(price);

  debug.step("shop.editPrice", { name, price });

  if (!name) return { reply: "Item name is required" };
  if (price === null || price < 0) return { reply: "Price must be a valid number" };
  if (!supabase) return { reply: "Supabase is not configured" };

  const item = await findShopItemByName(name);
  if (!item) return { reply: "Item not found" };

  const { data, error } = await supabase
    .from("shop")
    .update({ price })
    .eq("id", item.id)
    .select("id,displayname,type,price");

  if (error) {
    debug.supabaseError("shop.editPrice", "update", error, {
      id: item.id,
      values: { price }
    });
    return { reply: `Database error: ${error.message}` };
  }

  debug.ok("shop.editPrice", { updated: data?.[0] || null });
  return { reply: `Updated ${item.name} price to ${price}` };
}

async function editName(name, newname) {
  name = normalizeText(name);
  newname = normalizeText(newname);

  debug.step("shop.editName", { name, newname });

  if (!name || !newname) return { reply: "Current name and new name are required" };
  if (!supabase) return { reply: "Supabase is not configured" };

  const item = await findShopItemByName(name);
  if (!item) return { reply: "Item not found" };

  const existing = await loadShop();
  if (existing.some(i => i.name.toLowerCase() === newname.toLowerCase())) {
    return { reply: `An item already exists with the name ${newname}` };
  }

  const { data, error } = await supabase
    .from("shop")
    .update({ displayname: newname })
    .eq("id", item.id)
    .select("id,displayname,type,price");

  if (error) {
    debug.supabaseError("shop.editName", "update", error, {
      id: item.id,
      values: { displayname: newname }
    });
    return { reply: `Database error: ${error.message}` };
  }

  debug.ok("shop.editName", { updated: data?.[0] || null });
  return { reply: `Renamed item to ${newname}` };
}

async function deleteItem(name) {
  name = normalizeText(name);

  debug.step("shop.deleteItem", { name });

  if (!name) return { reply: "Item name is required" };
  if (!supabase) return { reply: "Supabase is not configured" };

  const item = await findShopItemByName(name);
  if (!item) return { reply: "Item not found" };

  const { error } = await supabase.from("shop").delete().eq("id", item.id);

  if (error) {
    debug.supabaseError("shop.deleteItem", "delete", error, { id: item.id });
    return { reply: `Database error: ${error.message}` };
  }

  debug.ok("shop.deleteItem", { deletedId: item.id, deletedName: item.name });
  return { reply: `Deleted ${item.name} (1 removed)` };
}

async function getShopList() {
  try {
    return await loadShop();
  } catch (err) {
    debug.fail("shop.getShopList", err);
    return [];
  }
}

async function savePurchaseSnippets(purchase) {
  if (!supabase) throw new Error("Supabase client not configured");

  const record = {
    purchase_id: purchase.id,
    player_id: purchase.playerId,
    purchase_price: purchase.totalCost,
    shopevents_snippet: purchase.shopevents_snippet || "",
    cfgeventspawns_snippet: purchase.cfgeventspawns_snippet || ""
  };

  const { data, error } = await supabase
    .from("purchase_snippets")
    .insert([record])
    .select();

  if (error) {
    debug.supabaseError("shop.savePurchaseSnippets", "insert", error, {
      table: "purchase_snippets",
      record
    });
    throw error;
  }

  debug.ok("shop.savePurchaseSnippets", {
    saved: true,
    inserted: data?.[0] || null
  });

  return { saved: true, record, data };
}

async function buyItem(itemName, qty, x, z, method = "wallet", balance = null, playerId = null, guildId = null) {
  loadOrders();
  itemName = normalizeText(itemName);
  qty = normalizeNumber(qty);
  x = normalizeNumber(x);
  z = normalizeNumber(z);
  method = normalizeText(method).toLowerCase() || "wallet";
  balance = normalizeNumber(balance);
  playerId = normalizeText(playerId);
  guildId = normalizeText(guildId);

  debug.step("shop.buyItem", { itemName, qty, x, z, method, balance, playerId, guildId });

  if (!itemName) return { reply: "Item is required" };
  if (!Number.isInteger(qty) || qty <= 0) return { reply: "Quantity must be a positive integer" };
  if (x === null || z === null) return { reply: "Coordinates must be valid numbers" };

  const items = await getShopList();
  const item = items.find(i => i.name.toLowerCase() === itemName.toLowerCase() || i.name.toLowerCase().includes(itemName.toLowerCase()));
  if (!item) return { reply: "Item not found" };

  const price = Number(item.price || 0);
  if (!Number.isFinite(price) || price <= 0) {
    return { reply: "This item cannot be purchased because its price is invalid." };
  }

  const totalCost = price * qty;

  if (balance !== null && balance < totalCost) {
    return { reply: `You cannot afford this purchase. Cost: ${totalCost}. Available: ${balance}.` };
  }

  try {
    if (playerId && guildId) {
      if (method === "bank") {
        await economy.deductFromBank(playerId, guildId, totalCost, playerId, {
          notes: `Shop purchase: ${item.name}`
        });
      } else {
        await economy.deductFromWallet(playerId, guildId, totalCost, playerId, {
          notes: `Shop purchase: ${item.name}`
        });
      }
    }
  } catch (err) {
    debug.fail("shop.buyItem.deduct", err, {
      itemName,
      qty,
      method,
      balance,
      playerId,
      guildId
    });
    return { reply: err.message || "Failed to charge player." };
  }

  const order = {
    id: Date.now().toString(),
    item: item.name,
    type: item.type,
    qty,
    x,
    z,
    method,
    price,
    totalCost,
    playerId,
    guildId,
    status: "queued"
  };

  orders.push(order);
  saveOrders();

  let xmlResult = null;
  try {
    if (typeof buildAllXML === "function") {
      xmlResult = await buildAllXML(orders, order);
      lastXML = xmlResult || lastXML;
    }
  } catch (err) {
    debug.fail("shop.buyItem.buildAllXML", err, { orderId: order.id });
  }

  try {
    await savePurchaseSnippets({
      id: order.id,
      playerId: order.playerId,
      totalCost: order.totalCost,
      type: order.type,
      x: order.x,
      z: order.z,
      shopevents_snippet: xmlResult?.eventsXML || "",
      cfgeventspawns_snippet: xmlResult?.posXML || ""
    });
  } catch (err) {
    debug.fail("shop.buyItem.savePurchaseSnippets", err, { orderId: order.id });
  }

  debug.ok("shop.buyItem", { order, xmlSaved: !!xmlResult });

  return { reply: `Purchase successful: ${qty}x ${item.name} @ (${x},${z})` };
}

function getOrders() {
  loadOrders();
  debug.step("shop.getOrders", { count: orders.length });
  return orders;
}

async function buildXML() {
  loadOrders();
  debug.step("shop.buildXML", { orderCount: orders.length });

  const xml = typeof buildAllXML === "function" ? await buildAllXML(orders) : { eventsXML: "", posXML: "" };
  lastXML = xml;
  ensureCustomDir();
  if (xml.eventsXML) fs.writeFileSync(EVENTS_FILE, xml.eventsXML);
  if (xml.posXML) fs.writeFileSync(POS_FILE, xml.posXML);

  debug.ok("shop.buildXML", {
    eventsFile: EVENTS_FILE,
    posFile: POS_FILE,
    orders: orders.length
  });

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
  debug.step("shop.pushXML", {});
  const res = await buildXML();
  return { reply: `XML pushed to /custom folder. ${res.xml?.eventsFile ? "Files updated." : ""}` };
}

async function reloadData() {
  const items = await getShopList();
  loadOrders();
  debug.ok("shop.reloadData", { items: items.length, orders: orders.length });
  return { reply: `Reloaded shop data. Items: ${items.length}, Orders: ${orders.length}` };
}

async function autocomplete(query) {
  const items = await getShopList();
  const q = normalizeText(query).toLowerCase();
  debug.step("shop.autocomplete", { query: q, items: items.length });

  if (!q) return [];
  return items
    .filter(i => i.name.toLowerCase().includes(q))
    .slice(0, 25)
    .map(i => ({ name: i.name, value: i.name }));
}

function clearOrders() {
  orders = [];
  saveOrders();
  debug.ok("shop.clearOrders", { cleared: true });
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
