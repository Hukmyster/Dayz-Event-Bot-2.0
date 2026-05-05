const { createClient } = require("@supabase/supabase-js");
const ws = require("ws");
const debug = require("../utils/debug");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey, { realtime: { transport: ws } }) : null;

function assertSupabase() {
  if (!supabase) throw new Error("Supabase client not configured");
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

function buildAttachmentWhitelist() {
  return new Set([
    "M4A1",
    "AKM",
    "AK74",
    "SG5K",
    "VSD",
    "VSS",
    "M16A2",
    "CR-527"
  ]);
}

function supportsAttachments(itemName) {
  const clean = normalizeText(itemName).toUpperCase();
  return buildAttachmentWhitelist().has(clean);
}

async function loadShop() {
  assertSupabase();

  debug.debug("shop.loadShop", { table: "shop" });

  const { data, error } = await supabase
    .from("shop")
    .select("id,displayname,type,price")
    .order("displayname", { ascending: true });

  if (error) {
    debug.supabaseError("shop.loadShop", "select", error, { table: "shop" });
    throw error;
  }

  const items = Array.isArray(data) ? data.map(mapShopRow) : [];
  debug.ok("shop.loadShop", { rows: items.length });
  return items;
}

async function getShopList() {
  try {
    return await loadShop();
  } catch (err) {
    debug.fail("shop.getShopList", err);
    return [];
  }
}

async function findShopItemByName(name) {
  const clean = normalizeText(name).toLowerCase();
  const items = await getShopList();
  const exact = items.find(i => i.name.toLowerCase() === clean);
  if (exact) return exact;
  return items.find(i => i.name.toLowerCase().includes(clean)) || null;
}

async function addItem(name, type, price) {
  assertSupabase();

  name = normalizeText(name);
  type = normalizeText(type);
  price = normalizeNumber(price);

  debug.debug("shop.addItem", { name, type, price });

  if (!name || !type) return { reply: "Display name and type are required" };
  if (price === null || price < 0) return { reply: "Price must be a valid number" };

  const existing = await getShopList();
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
  assertSupabase();

  name = normalizeText(name);
  price = normalizeNumber(price);

  debug.debug("shop.editPrice", { name, price });

  if (!name) return { reply: "Item name is required" };
  if (price === null || price < 0) return { reply: "Price must be a valid number" };

  const item = await findShopItemByName(name);
  if (!item) return { reply: "Item not found" };

  const { data, error } = await supabase
    .from("shop")
    .update({ price })
    .eq("id", item.id)
    .select("id,displayname,type,price");

  if (error) {
    debug.supabaseError("shop.editPrice", "update", error, { id: item.id, values: { price } });
    return { reply: `Database error: ${error.message}` };
  }

  debug.ok("shop.editPrice", { updated: data?.[0] || null });
  return { reply: `Updated ${item.name} price to ${price}` };
}

async function editName(name, newname) {
  assertSupabase();

  name = normalizeText(name);
  newname = normalizeText(newname);

  debug.debug("shop.editName", { name, newname });

  if (!name || !newname) return { reply: "Current name and new name are required" };

  const item = await findShopItemByName(name);
  if (!item) return { reply: "Item not found" };

  const existing = await getShopList();
  if (existing.some(i => i.name.toLowerCase() === newname.toLowerCase())) {
    return { reply: `An item already exists with the name ${newname}` };
  }

  const { data, error } = await supabase
    .from("shop")
    .update({ displayname: newname })
    .eq("id", item.id)
    .select("id,displayname,type,price");

  if (error) {
    debug.supabaseError("shop.editName", "update", error, { id: item.id, values: { displayname: newname } });
    return { reply: `Database error: ${error.message}` };
  }

  debug.ok("shop.editName", { updated: data?.[0] || null });
  return { reply: `Renamed item to ${newname}` };
}

async function deleteItem(name) {
  assertSupabase();

  name = normalizeText(name);

  debug.debug("shop.deleteItem", { name });

  if (!name) return { reply: "Item name is required" };

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

async function autocomplete(query) {
  const items = await getShopList();
  const q = normalizeText(query).toLowerCase();

  debug.debug("shop.autocomplete", { query: q, items: items.length });

  if (!q) return [];
  return items
    .filter(i => i.name.toLowerCase().includes(q))
    .slice(0, 25)
    .map(i => ({ name: i.name, value: i.name }));
}

module.exports = {
  supabase,
  getShopList,
  findShopItemByName,
  addItem,
  editPrice,
  editName,
  deleteItem,
  autocomplete,
  supportsAttachments,
  buildAttachmentWhitelist
};
