const debug = require("../utils/debug");
const storage = require("../services/storage");

let economyData = {};
let transactions = [];
const ECONOMY_KEY = "economy";
let loadPromise = null;

async function loadEconomy() {
  try {
    const data = await storage.loadJson(ECONOMY_KEY);
    economyData = data.accounts || {};
    transactions = Array.isArray(data.transactions) ? data.transactions : [];
    debug.ok("economy.loadEconomy", { accounts: Object.keys(economyData).length });
  } catch (err) {
    debug.fail("economy.loadEconomy", err);
    economyData = {};
    transactions = [];
  }
}

loadPromise = loadEconomy();

async function ensureLoaded() {
  if (loadPromise) await loadPromise;
}

async function saveEconomy() {
  try {
    await storage.saveJson(ECONOMY_KEY, {
      accounts: economyData,
      transactions: transactions.slice(-500)
    });
  } catch (err) {
    debug.fail("economy.saveEconomy", err);
  }
}

function normalizeNumber(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.floor(Math.max(0, n));
}

function formatMoney(value) {
  const n = Number(value || 0);
  return `${Math.max(0, Math.floor(n))} dollars`;
}

function getAccountKey(userId, guildId) {
  return `${guildId}:${userId}`;
}

async function getOrCreateAccount(userId, guildId, username) {
  await ensureLoaded();

  debug.step("economy.getOrCreateAccount", { userId, guildId, username });

  const key = getAccountKey(userId, guildId);
  let account = economyData[key];

  if (account) {
    if (username && account.username !== username) {
      account.username = username;
      await saveEconomy();
    }
    debug.ok("economy.getOrCreateAccount", { status: "found", userId, guildId });
    return account;
  }

  account = {
    user_id: userId,
    guild_id: guildId,
    username: username || "Unknown",
    wallet: 0,
    bank: 0,
    last_daily_claim_at: null,
    gamertag: "",
    last_seen_at: null
  };

  economyData[key] = account;
  await saveEconomy();

  debug.ok("economy.getOrCreateAccount", { status: "created", userId, guildId });
  return account;
}

async function updateAccount(userId, guildId, updates) {
  await ensureLoaded();

  const key = getAccountKey(userId, guildId);
  const account = economyData[key] || await getOrCreateAccount(userId, guildId, "Unknown");

  Object.assign(account, updates);
  await saveEconomy();

  debug.ok("economy.updateAccount", { userId, guildId, wallet: account.wallet, bank: account.bank });
  return account;
}

async function logTransaction(entry) {
  await ensureLoaded();

  const tx = {
    timestamp: new Date().toISOString(),
    guild_id: entry.guildId,
    user_id: entry.userId,
    username: entry.username || "Unknown",
    type: entry.type || "unknown",
    amount: Number(entry.amount || 0),
    balance_after: Number(entry.balanceAfter || 0),
    target_user_id: entry.targetUserId || null,
    target_username: entry.targetUsername || null,
    notes: entry.notes || null,
    metadata: entry.metadata || {}
  };

  transactions.push(tx);
  await saveEconomy();

  debug.ok("economy.logTransaction", { userId: entry.userId, type: tx.type, amount: tx.amount });
}

async function adminAdjustWallet(userId, guildId, amount, username, extra = {}) {
  amount = normalizeNumber(amount);
  if (amount === null) throw new Error("Amount must be a valid number");

  const account = await getOrCreateAccount(userId, guildId, username);
  const current = Number(account.wallet || 0);
  const next = current + amount;

  if (next < 0) throw new Error("Insufficient wallet funds");

  const updated = await updateAccount(userId, guildId, { wallet: next });

  await logTransaction({
    guildId,
    userId,
    username,
    type: amount >= 0 ? "admin_add" : "admin_remove",
    amount,
    balanceAfter: updated.wallet,
    notes: extra.notes,
    metadata: extra.metadata
  });

  return updated;
}

async function transferWallet(userId, recipientId, guildId, amount, senderName, recipientName) {
  await ensureLoaded();

  amount = normalizeNumber(amount);
  if (amount === null || amount <= 0) throw new Error("Amount must be positive");
  if (userId === recipientId) throw new Error("You can't send money to yourself.");

  const senderKey = getAccountKey(userId, guildId);
  const recipientKey = getAccountKey(recipientId, guildId);

  const senderAccount = economyData[senderKey] || await getOrCreateAccount(userId, guildId, senderName);
  const recipientAccount = economyData[recipientKey] || await getOrCreateAccount(recipientId, guildId, recipientName);

  const senderWallet = Number(senderAccount.wallet || 0);
  if (senderWallet < amount) throw new Error("Insufficient wallet funds");

  senderAccount.wallet = senderWallet - amount;
  recipientAccount.wallet = Number(recipientAccount.wallet || 0) + amount;

  await logTransaction({
    guildId,
    userId,
    username: senderName,
    targetUserId: recipientId,
    targetUsername: recipientName,
    type: "transfer_out",
    amount: -amount,
    balanceAfter: senderAccount.wallet,
    notes: `Sent to ${recipientName}`
  });

  await logTransaction({
    guildId,
    userId: recipientId,
    username: recipientName,
    targetUserId: userId,
    targetUsername: senderName,
    type: "transfer_in",
    amount,
    balanceAfter: recipientAccount.wallet,
    notes: `Received from ${senderName}`
  });

  await saveEconomy();

  debug.ok("economy.transferWallet", { userId, recipientId, guildId, amount });

  return { sender: senderAccount, recipient: recipientAccount };
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
    guildId,
    userId,
    username,
    type: "deposit",
    amount: -amount,
    balanceAfter: updated.wallet,
    notes: extra.notes,
    metadata: extra.metadata
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
    guildId,
    userId,
    username,
    type: "withdraw",
    amount,
    balanceAfter: updated.wallet,
    notes: extra.notes,
    metadata: extra.metadata
  });

  return updated;
}

async function addBank(userId, guildId, amount, username, extra = {}) {
  amount = normalizeNumber(amount);
  if (amount === null || amount <= 0) throw new Error("Amount must be positive");

  const account = await getOrCreateAccount(userId, guildId, username);
  const bank = Number(account.bank || 0);

  const updated = await updateAccount(userId, guildId, { bank: bank + amount });

  await logTransaction({
    guildId,
    userId,
    username,
    type: "bank_add",
    amount,
    balanceAfter: updated.bank,
    notes: extra.notes,
    metadata: extra.metadata
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
    guildId,
    userId,
    username,
    type: "shop_purchase",
    amount: -amount,
    balanceAfter: updated.wallet,
    notes: extra.notes,
    metadata: extra.metadata
  });

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
    guildId,
    userId,
    username,
    type: "shop_purchase",
    amount: -amount,
    balanceAfter: updated.bank,
    notes: extra.notes,
    metadata: extra.metadata
  });

  return updated;
}

async function setDailyClaim(guildId, userId, isoString) {
  await updateAccount(userId, guildId, { last_daily_claim_at: isoString });
}

async function getDailyClaim(guildId, userId) {
  await ensureLoaded();

  const key = getAccountKey(userId, guildId);
  const account = economyData[key];
  return account ? { last_daily_claim_at: account.last_daily_claim_at || null } : null;
}

async function upsertGamertagLink({ userId, guildId, username, gamertag, lastSeenAt }) {
  const account = await getOrCreateAccount(userId, guildId, username);
  account.gamertag = gamertag;
  account.last_seen_at = lastSeenAt ? new Date(lastSeenAt).toISOString() : new Date().toISOString();
  await saveEconomy();

  debug.ok("economy.upsertGamertagLink", { userId, guildId, gamertag });
}

async function getAllAccounts() {
  await ensureLoaded();
  return Object.values(economyData);
}

async function getAccount(userId, guildId, username = "Unknown") {
  return getOrCreateAccount(userId, guildId, username);
}

function hasAccess() {
  return true;
}

module.exports = {
  formatMoney,
  getOrCreateAccount,
  getAccount,
  updateAccount,
  logTransaction,
  adminAdjustWallet,
  transferWallet,
  transferWalletToBank,
  transferBankToWallet,
  addBank,
  deductFromWallet,
  deductFromBank,
  setDailyClaim,
  getDailyClaim,
  upsertGamertagLink,
  getAllAccounts,
  hasAccess,
  loadEconomy
};
