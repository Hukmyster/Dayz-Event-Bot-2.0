// modules/economy.js
const { loadJson, saveJson } = require('../services/storage');
const debug = require("../utils/debug");

const ECONOMY_FILE = 'economy';

let economyCache = {};        // In-memory cache for speed
let isLoaded = false;

function normalizeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatMoney(value) {
  const n = Number(value || 0);
  return `${Math.max(0, Math.floor(n))} dollars`;
}

async function ensureLoaded() {
  if (!isLoaded) {
    debug.step("economy.ensureLoaded", "Loading economy data from storage...");
    economyCache = await loadJson(ECONOMY_FILE);
    isLoaded = true;
    debug.ok("economy.ensureLoaded", `Loaded ${Object.keys(economyCache).length} accounts`);
  }
  return economyCache;
}

async function saveEconomy() {
  await saveJson(ECONOMY_FILE, economyCache);
}

// ====================== CORE FUNCTIONS ======================

async function getOrCreateAccount(userId, guildId, username) {
  debug.step("economy.getOrCreateAccount", { userId, guildId, username });
  await ensureLoaded();

  const key = `${guildId}-${userId}`;
  let account = economyCache[key];

  if (!account) {
    account = {
      user_id: userId,
      guild_id: guildId,
      username: username || "Unknown",
      wallet: 0,
      bank: 0,
      last_daily_claim_at: null,
      gamertag: null,
      last_seen_at: null
    };
    economyCache[key] = account;
    await saveEconomy();
    debug.ok("economy.getOrCreateAccount", { status: "created", userId });
  } else {
    debug.ok("economy.getOrCreateAccount", { status: "found", userId });
  }
  return account;
}

async function updateAccount(userId, guildId, updates) {
  await ensureLoaded();
  const key = `${guildId}-${userId}`;
  const account = economyCache[key];

  if (!account) throw new Error("Account not found");

  Object.assign(account, updates);
  await saveEconomy();

  debug.ok("economy.updateAccount", { 
    userId, 
    guildId, 
    wallet: account.wallet, 
    bank: account.bank 
  });
  return account;
}

async function logTransaction(entry) {
  debug.step("economy.logTransaction", { 
    type: entry.type, 
    amount: entry.amount, 
    userId: entry.userId 
  });
  // TODO: Optionally implement a separate transactions.json later
  // For now we just log to console/debug
}

// ====================== PUBLIC API ======================

async function adminAdjustWallet(userId, guildId, amount, username, extra = {}) {
  amount = normalizeNumber(amount);
  if (amount === null) throw new Error("Amount must be a valid number");

  const account = await getOrCreateAccount(userId, guildId, username);
  const currentWallet = Number(account.wallet || 0);
  const nextWallet = currentWallet + amount;

  if (nextWallet < 0) throw new Error("Insufficient wallet funds");

  const updated = await updateAccount(userId, guildId, { wallet: nextWallet });

  await logTransaction({
    guildId, userId, username,
    type: amount >= 0 ? "admin_add" : "admin_remove",
    amount,
    balanceAfter: updated.wallet,
    notes: extra.notes,
    metadata: extra.metadata || {}
  });

  return updated;
}

async function transferWalletToBank(userId, guildId, amount, username, extra = {}) {
  amount = normalizeNumber(amount);
  if (amount === null || amount <= 0) throw new Error("Deposit amount must be positive");

  const account = await getOrCreateAccount(userId, guildId, username);
  const wallet = Number(account.wallet || 0);
  const bank = Number(account.bank || 0);

  if (wallet < amount) throw new Error("Insufficient wallet funds");

  const updated = await updateAccount(userId, guildId, {
    wallet: wallet - amount,
    bank: bank + amount
  });

  await logTransaction({
    guildId, userId, username,
    type: "deposit",
    amount: -amount,
    balanceAfter: updated.wallet,
    notes: extra.notes,
    metadata: extra.metadata || {}
  });

  return updated;
}

async function transferBankToWallet(userId, guildId, amount, username, extra = {}) {
  amount = normalizeNumber(amount);
  if (amount === null || amount <= 0) throw new Error("Withdraw amount must be positive");

  const account = await getOrCreateAccount(userId, guildId, username);
  const wallet = Number(account.wallet || 0);
  const bank = Number(account.bank || 0);

  if (bank < amount) throw new Error("Insufficient bank funds");

  const updated = await updateAccount(userId, guildId, {
    wallet: wallet + amount,
    bank: bank - amount
  });

  await logTransaction({
    guildId, userId, username,
    type: "withdraw",
    amount,
    balanceAfter: updated.wallet,
    notes: extra.notes,
    metadata: extra.metadata || {}
  });

  return updated;
}

async function addBank(userId, guildId, amount, username, extra = {}) {
  amount = normalizeNumber(amount);
  if (amount === null || amount <= 0) throw new Error("Amount must be positive");

  const account = await getOrCreateAccount(userId, guildId, username);
  const bank = Number(account.bank || 0);

  const updated = await updateAccount(userId, guildId, {
    bank: bank + amount
  });

  await logTransaction({
    guildId, userId, username,
    type: "bank_add",
    amount,
    balanceAfter: updated.bank,
    notes: extra.notes,
    metadata: extra.metadata || {}
  });

  return updated;
}

async function deductFromWallet(userId, guildId, amount, username, extra = {}) {
  amount = normalizeNumber(amount);
  if (amount === null || amount <= 0) throw new Error("Amount must be positive");

  const account = await getOrCreateAccount(userId, guildId, username);
  const wallet = Number(account.wallet || 0);

  if (wallet < amount) throw new Error("Insufficient wallet funds");

  const updated = await updateAccount(userId, guildId, { wallet: wallet - amount });

  await logTransaction({
    guildId, userId, username,
    type: "shop_purchase",
    amount: -amount,
    balanceAfter: updated.wallet,
    notes: extra.notes,
    metadata: extra.metadata || {}
  });

  debug.ok("economy.deductFromWallet", { amount, walletAfter: updated.wallet });
  return updated;
}

async function deductFromBank(userId, guildId, amount, username, extra = {}) {
  amount = normalizeNumber(amount);
  if (amount === null || amount <= 0) throw new Error("Amount must be positive");

  const account = await getOrCreateAccount(userId, guildId, username);
  const bank = Number(account.bank || 0);

  if (bank < amount) throw new Error("Insufficient bank funds");

  const updated = await updateAccount(userId, guildId, { bank: bank - amount });

  await logTransaction({
    guildId, userId, username,
    type: "shop_purchase",
    amount: -amount,
    balanceAfter: updated.bank,
    notes: extra.notes,
    metadata: extra.metadata || {}
  });

  debug.ok("economy.deductFromBank", { amount, bankAfter: updated.bank });
  return updated;
}

async function setDailyClaim(guildId, userId, isoString) {
  await ensureLoaded();
  const key = `${guildId}-${userId}`;
  if (economyCache[key]) {
    economyCache[key].last_daily_claim_at = isoString;
    await saveEconomy();
  }
}

async function getDailyClaim(guildId, userId) {
  await ensureLoaded();
  const key = `${guildId}-${userId}`;
  return economyCache[key] ? { last_daily_claim_at: economyCache[key].last_daily_claim_at } : null;
}

async function upsertGamertagLink({ userId, guildId, username, gamertag, lastSeenAt }) {
  await ensureLoaded();
  const key = `${guildId}-${userId}`;
  
  if (!economyCache[key]) {
    await getOrCreateAccount(userId, guildId, username);
  }

  economyCache[key].gamertag = gamertag;
  economyCache[key].last_seen_at = new Date(lastSeenAt).toISOString();
  await saveEconomy();

  debug.ok("economy.upsertGamertagLink", { gamertag });
}

module.exports = {
  formatMoney,
  getOrCreateAccount,
  updateAccount,
  logTransaction,
  adminAdjustWallet,
  transferWalletToBank,
  transferBankToWallet,
  addBank,
  deductFromWallet,
  deductFromBank,
  setDailyClaim,
  getDailyClaim,
  upsertGamertagLink
};
