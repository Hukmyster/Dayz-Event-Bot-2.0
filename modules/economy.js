const { loadTable, saveTable } = require('../services/storage');
const debug = require("../utils/debug");

const ECONOMY_FILE = 'economy';

let economyCache = [];
let isLoaded = false;

function normalizeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatMoney(value) {
  const n = Number(value || 0);
  return `${Math.max(0, Math.floor(n))} dollars`;
}

function rowToAccount(row = {}) {
  return {
    user_id: String(row.user_id ?? ''),
    guild_id: String(row.guild_id ?? ''),
    username: String(row.username ?? 'Unknown'),
    wallet: Number(row.wallet || 0),
    bank: Number(row.bank || 0),
    last_daily_claim_at: row.last_daily_claim_at || null,
    gamertag: row.gamertag || null,
    last_seen_at: row.last_seen_at || null
  };
}

function accountToRow(account = {}) {
  return {
    user_id: String(account.user_id ?? ''),
    guild_id: String(account.guild_id ?? ''),
    username: String(account.username ?? 'Unknown'),
    wallet: Number(account.wallet || 0),
    bank: Number(account.bank || 0),
    last_daily_claim_at: account.last_daily_claim_at || '',
    gamertag: account.gamertag || '',
    last_seen_at: account.last_seen_at || ''
  };
}

async function ensureLoaded() {
  if (!isLoaded) {
    debug.step("economy.ensureLoaded", "Loading economy table from storage...");
    economyCache = (await loadTable(ECONOMY_FILE, [
      'user_id',
      'guild_id',
      'username',
      'wallet',
      'bank',
      'last_daily_claim_at',
      'gamertag',
      'last_seen_at'
    ])).map(rowToAccount);
    isLoaded = true;
    debug.ok("economy.ensureLoaded", `Loaded ${economyCache.length} accounts`);
  }
  return economyCache;
}

async function saveEconomy() {
  await saveTable(ECONOMY_FILE, economyCache.map(accountToRow), [
    'user_id',
    'guild_id',
    'username',
    'wallet',
    'bank',
    'last_daily_claim_at',
    'gamertag',
    'last_seen_at'
  ]);
}

async function getOrCreateAccount(userId, guildId, username) {
  debug.step("economy.getOrCreateAccount", { userId, guildId, username });
  await ensureLoaded();

  let account = economyCache.find(a => a.guild_id === String(guildId) && a.user_id === String(userId));

  if (!account) {
    account = {
      user_id: String(userId),
      guild_id: String(guildId),
      username: username || "Unknown",
      wallet: 0,
      bank: 0,
      last_daily_claim_at: null,
      gamertag: null,
      last_seen_at: null
    };
    economyCache.push(account);
    await saveEconomy();
    debug.ok("economy.getOrCreateAccount", { status: "created", userId });
  } else {
    if (username && account.username !== username) {
      account.username = username;
      await saveEconomy();
    }
    debug.ok("economy.getOrCreateAccount", { status: "found", userId });
  }
  return account;
}

async function updateAccount(userId, guildId, updates) {
  await ensureLoaded();
  const account = economyCache.find(a => a.guild_id === String(guildId) && a.user_id === String(userId));

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
}

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
  const account = economyCache.find(a => a.guild_id === String(guildId) && a.user_id === String(userId));
  if (account) {
    account.last_daily_claim_at = isoString;
    await saveEconomy();
  }
}

async function getDailyClaim(guildId, userId) {
  await ensureLoaded();
  const account = economyCache.find(a => a.guild_id === String(guildId) && a.user_id === String(userId));
  return account ? { last_daily_claim_at: account.last_daily_claim_at } : null;
}

async function upsertGamertagLink({ userId, guildId, username, gamertag, lastSeenAt }) {
  await ensureLoaded();
  const account = await getOrCreateAccount(userId, guildId, username);

  account.gamertag = gamertag;
  account.last_seen_at = new Date(lastSeenAt).toISOString();
  if (username) account.username = username;
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
