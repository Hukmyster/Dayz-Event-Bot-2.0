// modules/shop.js - FULL FTP VERSION (preserves all original logic)
const debug = require("../utils/debug");
const storage = require("../services/storage");
const { buildSingleEntry } = require("./shopSnippetBuilder");
const economy = require("./economy");

const SHOP_KEY = 'shop';
let shopItems = [];

async function loadShop() {
  try {
    const data = await storage.loadJson(SHOP_KEY);
    shopItems = Array.isArray(data) ? data : [];
    debug.ok("shop.loadShop", { items: shopItems.length });
  } catch (err) {
    debug.fail("shop.loadShop", err);
    shopItems = [];
  }
}

async function saveShop() {
  await storage.saveJson(SHOP_KEY, shopItems);
}

// Initial load
loadShop().catch(console.error);

function normalizeText(v) {
  return String(v ?? "").trim();
}

function normalizeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapShopRow(item) {
  return {
    id: item.id || Date.now().toString(),
    name: item.displayname,
    displayname: item.displayname,
    type: item.type,
    price: Number(item.price)
  };
}

function buildAttachmentWhitelist() {
  return new Set(["M4A1","AKM","AK74","SG5K","VSD","VSS","M16A2","CR-527"]);
}

function supportsAttachments(itemName) {
  const clean = normalizeText(itemName).toUpperCase();
  return buildAttachmentWhitelist().has(clean);
}

async function getShopList() {
  try {
    return shopItems.map(mapShopRow);
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

  shopItems.push({
    id: Date.now().toString(),
    displayname: name,
    type,
    price
  });

  await saveShop();
  debug.ok("shop.addItem", { name });
  return { reply: `Added ${name}` };
}

async function editPrice(name, price) {
  name = normalizeText(name);
  price = normalizeNumber(price);

  debug.debug("shop.editPrice", { name, price });

  if (!name) return { reply: "Item name is required" };
  if (price === null || price < 0) return { reply: "Price must be a valid number" };

  const item = await findShopItemByName(name);
  if (!item) return { reply: "Item not found" };

  const shopItem = shopItems.find(i => i.displayname === item.name);
  if (shopItem) shopItem.price = price;

  await saveShop();
  debug.ok("shop.editPrice", { updated: item.name });
  return { reply: `Updated ${item.name} price to ${price}` };
}

async function editName(name, newname) {
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

  const shopItem = shopItems.find(i => i.displayname === item.name);
  if (shopItem) shopItem.displayname = newname;

  await saveShop();
  debug.ok("shop.editName", { updated: newname });
  return { reply: `Renamed item to ${newname}` };
}

async function deleteItem(name) {
  name = normalizeText(name);
  debug.debug("shop.deleteItem", { name });

  if (!name) return { reply: "Item name is required" };

  const item = await findShopItemByName(name);
  if (!item) return { reply: "Item not found" };

  shopItems = shopItems.filter(i => i.displayname !== item.name);
  await saveShop();

  debug.ok("shop.deleteItem", { deleted: item.name });
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
    debug.ok("shop.buyItem.charge", { userId, guildId, method, total, wallet: after.wallet, bank: after.bank });
  } else {
    return { reply: "Missing player or guild information for charging." };
  }

  // Purchase snippets - for now we skip DB storage (you can extend later with a separate JSON if needed)
  const purchaseId = `${Date.now()}`;
  debug.ok("shop.buyItem", { purchaseId, qty, item: item.name });

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
  buyItem,
  loadShop
};
