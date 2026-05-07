const debug = require("../utils/debug");
const { buildSingleEntry } = require("./shopSnippetBuilder");
const economy = require("./economy");
const { loadTable, saveTable } = require("../services/storage");

const SHOP_KEY = "shop";
const PURCHASE_KEY = "purchase_json_snippets";

function normalizeText(v) {
  return String(v ?? "").trim();
}

function normalizeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapShopRow(row = {}) {
  return {
    id: row.id || row.item_id || "",
    name: row.displayname ?? row.name ?? "",
    displayname: row.displayname ?? row.name ?? "",
    type: row.type ?? "",
    price: Number(row.price || 0)
  };
}

function mapPurchaseRow(row = {}) {
  return {
    purchase_id: row.purchase_id || "",
    user_id: row.user_id || "",
    guild_id: row.guild_id || "",
    username: row.username || "",
    item_name: row.item_name || "",
    item_type: row.item_type || "",
    qty: Number(row.qty || 1),
    method: row.method || "wallet",
    total: Number(row.total || 0),
    json_snippet: row.json_snippet || "",
    created_at: row.created_at || ""
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
  debug.debug("shop.loadShop", { table: "shop" });
  const rows = await loadTable(SHOP_KEY, ["displayname", "type", "price", "id"]);
  const items = Array.isArray(rows) ? rows.map(mapShopRow).filter(i => i.name) : [];
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

async function saveShop(items) {
  const rows = items.map((i, idx) => ({
    id: i.id || String(idx + 1),
    displayname: i.displayname ?? i.name,
    type: i.type,
    price: Number(i.price || 0)
  }));
  await saveTable(SHOP_KEY, rows, ["id", "displayname", "type", "price"]);
}

async function addItem(name, type, price) {
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

  const next = [
    ...existing,
    {
      id: `${Date.now()}`,
      displayname: name,
      type,
      price
    }
  ];

  await saveShop(next);
  debug.ok("shop.addItem", { inserted: { displayname: name, type, price } });
  return { reply: `Added ${name}` };
}

async function editPrice(name, price) {
  name = normalizeText(name);
  price = normalizeNumber(price);

  debug.debug("shop.editPrice", { name, price });

  if (!name) return { reply: "Item name is required" };
  if (price === null || price < 0) return { reply: "Price must be a valid number" };

  const items = await loadShop();
  const idx = items.findIndex(i => i.name.toLowerCase() === name.toLowerCase());
  if (idx === -1) return { reply: "Item not found" };

  items[idx] = {
    ...items[idx],
    displayname: items[idx].displayname ?? items[idx].name,
    type: items[idx].type,
    price
  };

  await saveShop(items);
  debug.ok("shop.editPrice", { updated: items[idx] || null });
  return { reply: `Updated ${items[idx].name} price to ${price}` };
}

async function editName(name, newname) {
  name = normalizeText(name);
  newname = normalizeText(newname);

  debug.debug("shop.editName", { name, newname });

  if (!name || !newname) return { reply: "Current name and new name are required" };

  const items = await loadShop();
  const idx = items.findIndex(i => i.name.toLowerCase() === name.toLowerCase());
  if (idx === -1) return { reply: "Item not found" };

  if (items.some(i => i.name.toLowerCase() === newname.toLowerCase())) {
    return { reply: `An item already exists with the name ${newname}` };
  }

  items[idx] = {
    ...items[idx],
    displayname: newname
  };

  await saveShop(items);
  debug.ok("shop.editName", { updated: items[idx] || null });
  return { reply: `Renamed item to ${newname}` };
}

async function deleteItem(name) {
  name = normalizeText(name);

  debug.debug("shop.deleteItem", { name });

  if (!name) return { reply: "Item name is required" };

  const items = await loadShop();
  const item = items.find(i => i.name.toLowerCase() === name.toLowerCase());
  if (!item) return { reply: "Item not found" };

  const next = items.filter(i => i.name.toLowerCase() !== name.toLowerCase());
  await saveShop(next);

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

async function savePurchaseRows(rows) {
  const current = await loadTable(PURCHASE_KEY, [
    "purchase_id",
    "user_id",
    "guild_id",
    "username",
    "item_name",
    "item_type",
    "qty",
    "method",
    "total",
    "json_snippet",
    "created_at"
  ]);

  const next = [
    ...(Array.isArray(current) ? current.map(mapPurchaseRow) : []),
    ...rows
  ];

  await saveTable(PURCHASE_KEY, next, [
    "purchase_id",
    "user_id",
    "guild_id",
    "username",
    "item_name",
    "item_type",
    "qty",
    "method",
    "total",
    "json_snippet",
    "created_at"
  ]);
}

async function buyItem(itemName, quantity, x, z, method, available, userId, guildId, username) {
  const item = await findShopItemByName(itemName);
  if (!item) return { reply: "Item not found" };

  const qty = Math.max(1, Number(quantity || 1));
  const total = Number(item.price || 0) * qty;
  const funds = Number(available || 0);

  debug.debug("shop.buyItem", { itemName, quantity: qty, x, z, method, available: funds, userId, guildId, total });

  if (funds < total) return { reply: `Not enough funds. Need ${total} dollars.` };

  if (userId && guildId) {
    debug.step("shop.buyItem.charge", { userId, guildId, method, total });

    if (String(method || "wallet").toLowerCase() === "bank") {
      await economy.deductFromBank(userId, guildId, total, username || userId, {
        notes: `Shop purchase: ${item.name}`
      });
    } else {
      await economy.deductFromWallet(userId, guildId, total, username || userId, {
        notes: `Shop purchase: ${item.name}`
      });
    }

    const after = await economy.getOrCreateAccount(userId, guildId, username || userId);
    debug.ok("shop.buyItem.charge", {
      userId,
      guildId,
      method,
      total,
      wallet: after.wallet,
      bank: after.bank
    });
  } else {
    return { reply: "Missing player or guild information for charging." };
  }

  const purchaseId = `${Date.now()}`;
  const rows = [];

  for (let i = 0; i < qty; i++) {
    const entry = buildSingleEntry({
      name: item.type,
      x,
      y: 0,
      z
    });

    rows.push({
      purchase_id: purchaseId,
      user_id: String(userId || ""),
      guild_id: String(guildId || ""),
      username: String(username || userId || ""),
      item_name: item.name,
      item_type: item.type,
      qty: 1,
      method: String(method || "wallet").toLowerCase(),
      total: Number(item.price || 0),
      json_snippet: JSON.stringify(entry, null, 2),
      created_at: new Date().toISOString()
    });
  }

  await savePurchaseRows(rows);

  return { reply: `Bought ${qty}x ${item.name} for ${total} dollars using ${method}.` };
}

module.exports = {
  getShopList,
  findShopItemByName,
  addItem,
  editPrice,
  editName,
  deleteItem,
  autocomplete,
  supportsAttachments,
  buildAttachmentWhitelist,
  buyItem
};
