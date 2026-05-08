const economy = require("./economy");
const shop = require("./shop");
const debug = require("../utils/debug");
const { buildSingleEntry } = require("./shopSnippetBuilder");
const { appendPurchase } = require("./shopPurchases");

function normalizeText(v) {
  return String(v ?? "").trim();
}

function normalizeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function splitKitItems({ item, attachments = [] }) {
  const out = [];
  if (item) out.push({ ...item, role: "base" });
  for (const attachment of attachments) {
    if (!attachment) continue;
    out.push({ ...attachment, role: "attachment" });
  }
  return out;
}

function buildShopObjectRows({ itemName, quantity, x, z, y = 0, attachments = [], customString = "" }) {
  const rows = [];
  const base = normalizeText(itemName);
  const qty = Math.max(1, Math.floor(normalizeNumber(quantity) || 1));

  for (let i = 0; i < qty; i++) {
    rows.push(buildSingleEntry({
      name: base,
      x,
      y,
      z,
      customString
    }));
  }

  for (const attachment of attachments) {
    rows.push(buildSingleEntry({
      name: normalizeText(attachment.name),
      x: normalizeNumber(attachment.x, x),
      y: normalizeNumber(attachment.y, y),
      z: normalizeNumber(attachment.z, z),
      customString: normalizeText(attachment.customString, customString)
    }));
  }

  return rows;
}

async function chargePurchase({ userId, guildId, username, amount, method = "wallet", notes = "Shop purchase" }) {
  const cleanMethod = normalizeText(method).toLowerCase() || "wallet";
  const cleanAmount = normalizeNumber(amount);

  if (cleanAmount === null || cleanAmount <= 0) {
    throw new Error("Amount must be a valid number greater than 0");
  }

  debug.step("shopPurchase.chargePurchase", {
    userId,
    guildId,
    username,
    amount: cleanAmount,
    method: cleanMethod
  });

  if (cleanMethod === "bank") {
    const updated = await economy.deductFromBank(userId, guildId, cleanAmount, username, { notes });
    debug.ok("shopPurchase.chargePurchase", {
      method: "bank",
      userId,
      guildId,
      amount: cleanAmount,
      wallet: updated.wallet,
      bank: updated.bank
    });
    return updated;
  }

  const updated = await economy.deductFromWallet(userId, guildId, cleanAmount, username, { notes });
  debug.ok("shopPurchase.chargePurchase", {
    method: "wallet",
    userId,
    guildId,
    amount: cleanAmount,
    wallet: updated.wallet,
    bank: updated.bank
  });
  return updated;
}

async function buyItem({
  itemName,
  quantity,
  x,
  z,
  y = 0,
  method = "wallet",
  playerId,
  guildId,
  username,
  attachments = [],
  customString = ""
}) {
  debug.debug("shopPurchase.buyItem", {
    itemName,
    quantity,
    x,
    z,
    y,
    method,
    playerId,
    guildId,
    attachmentCount: attachments.length
  });

  const cleanItemName = normalizeText(itemName);
  const qty = Math.max(1, Math.floor(normalizeNumber(quantity) || 1));
  const cleanX = normalizeNumber(x);
  const cleanZ = normalizeNumber(z);
  const cleanY = normalizeNumber(y) ?? 0;

  if (!cleanItemName) return { reply: "Item is required" };
  if (cleanX === null || cleanZ === null) return { reply: "Coordinates must be valid numbers" };

  const shopItem = await shop.findShopItemByName(cleanItemName);
  if (!shopItem) return { reply: "Item not found" };

  const price = Number(shopItem.price || 0);
  if (!Number.isFinite(price) || price <= 0) {
    return { reply: "This item cannot be purchased because its price is invalid." };
  }

  const totalCost = price * qty;

  if (playerId && guildId) {
    try {
      await chargePurchase({
        userId: playerId,
        guildId,
        username: username || playerId,
        amount: totalCost,
        method,
        notes: `Shop purchase: ${shopItem.name}`
      });
    } catch (err) {
      debug.fail("shopPurchase.chargePurchase", err, { itemName: cleanItemName, qty, method });
      return { reply: err.message || "Failed to charge player." };
    }
  } else {
    return { reply: "Missing player or guild information for charging." };
  }

  const rows = buildShopObjectRows({
    itemName: shopItem.type,
    quantity: qty,
    x: cleanX,
    z: cleanZ,
    y: cleanY,
    attachments,
    customString
  });

  const order = {
    id: Date.now().toString(),
    item: shopItem.name,
    type: shopItem.type,
    qty,
    x: cleanX,
    y: cleanY,
    z: cleanZ,
    method: normalizeText(method).toLowerCase() || "wallet",
    price,
    totalCost,
    playerId: playerId || null,
    guildId: guildId || null,
    status: "queued",
    rows
  };

  await appendPurchase({
    purchase_id: order.id,
    user_id: String(playerId || ""),
    guild_id: String(guildId || ""),
    username: String(username || playerId || ""),
    item_name: order.item,
    item_type: order.type,
    qty: order.qty,
    method: order.method,
    total: order.totalCost,
    json_snippet: JSON.stringify(rows, null, 2),
    created_at: new Date().toISOString()
  });

  debug.ok("shopPurchase.buyItem", {
    orderId: order.id,
    item: order.item,
    qty: order.qty,
    rows: rows.length,
    totalCost
  });

  return {
    reply: `Purchase successful: ${qty}x ${shopItem.name}`,
    order,
    rows
  };
}

module.exports = {
  splitKitItems,
  buildShopObjectRows,
  chargePurchase,
  buyItem
};
