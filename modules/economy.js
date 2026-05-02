const { createClient } = require("@supabase/supabase-js");
const debug = require("../utils/debug");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

function assertSupabase() {
  if (!supabase) throw new Error("Supabase client not configured");
}

function normalizeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatMoney(value) {
  const n = Number(value || 0);
  return `${Math.max(0, Math.floor(n))} dollars`;
}

async function getOrCreateAccount(userId, guildId, username) {
  assertSupabase();

  const { data, error } = await supabase
    .from("economy_accounts")
    .select("*")
    .eq("user_id", userId)
    .eq("guild_id", guildId)
    .maybeSingle();

  if (error) {
    debug.supabaseError("economy.getOrCreateAccount", "select", error, { userId, guildId });
    throw error;
  }

  if (data) return data;

  const payload = {
    user_id: userId,
    guild_id: guildId,
    username: username || "Unknown",
    wallet: 0,
    bank: 0
  };

  const { data: inserted, error: insertError } = await supabase
    .from("economy_accounts")
    .insert([payload])
    .select("*")
    .single();

  if (insertError) {
    debug.supabaseError("economy.getOrCreateAccount", "insert", insertError, { payload });
    throw insertError;
  }

  return inserted;
}

async function updateAccount(userId, guildId, updates) {
  assertSupabase();

  const { data, error } = await supabase
    .from("economy_accounts")
    .update(updates)
    .eq("user_id", userId)
    .eq("guild_id", guildId)
    .select("*")
    .single();

  if (error) {
    debug.supabaseError("economy.updateAccount", "update", error, { userId, guildId, updates });
    throw error;
  }

  return data;
}

async function logTransaction(entry) {
  assertSupabase();

  const payload = {
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

  const { error } = await supabase
    .from("economy_transactions")
    .insert([payload]);

  if (error) {
    debug.supabaseError("economy.logTransaction", "insert", error, { payload });
    throw error;
  }
}

async function adminAdjustWallet(userId, guildId, amount, username, extra = {}) {
  assertSupabase();
  amount = normalizeNumber(amount);

  if (amount === null) throw new Error("Amount must be a valid number");

  const account = await getOrCreateAccount(userId, guildId, username);
  const currentWallet = Number(account.wallet || 0);
  const nextWallet = currentWallet + amount;

  if (nextWallet < 0) {
    throw new Error("Insufficient wallet funds");
  }

  const updated = await updateAccount(userId, guildId, { wallet: nextWallet });

  await logTransaction({
    guildId,
    userId,
    username,
    type: amount >= 0 ? "admin_add" : "admin_remove",
    amount,
    balanceAfter: updated.wallet,
    notes: extra.notes || null,
    metadata: extra.metadata || {}
  });

  return updated;
}

async function transferWalletToBank(userId, guildId, amount, username, extra = {}) {
  assertSupabase();
  amount = normalizeNumber(amount);

  if (amount === null) throw new Error("Amount must be a valid number");
  if (amount <= 0) throw new Error("Deposit amount must be positive");

  const account = await getOrCreateAccount(userId, guildId, username);
  const wallet = Number(account.wallet || 0);
  const bank = Number(account.bank || 0);

  if (wallet < amount) {
    throw new Error("Insufficient wallet funds");
  }

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
    notes: extra.notes || null,
    metadata: extra.metadata || {}
  });

  return updated;
}

async function transferBankToWallet(userId, guildId, amount, username, extra = {}) {
  assertSupabase();
  amount = normalizeNumber(amount);

  if (amount === null) throw new Error("Amount must be a valid number");
  if (amount <= 0) throw new Error("Withdraw amount must be positive");

  const account = await getOrCreateAccount(userId, guildId, username);
  const wallet = Number(account.wallet || 0);
  const bank = Number(account.bank || 0);

  if (bank < amount) {
    throw new Error("Insufficient bank funds");
  }

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
    notes: extra.notes || null,
    metadata: extra.metadata || {}
  });

  return updated;
}

async function addBank(userId, guildId, amount, username, extra = {}) {
  assertSupabase();
  amount = normalizeNumber(amount);

  if (amount === null) throw new Error("Amount must be a valid number");
  if (amount <= 0) throw new Error("Amount must be positive");

  const account = await getOrCreateAccount(userId, guildId, username);
  const wallet = Number(account.wallet || 0);
  const bank = Number(account.bank || 0);

  const updated = await updateAccount(userId, guildId, {
    wallet,
    bank: bank + amount
  });

  await logTransaction({
    guildId,
    userId,
    username,
    type: "bank_add",
    amount,
    balanceAfter: updated.bank,
    notes: extra.notes || null,
    metadata: extra.metadata || {}
  });

  return updated;
}

async function setDailyClaim(guildId, userId, isoString) {
  assertSupabase();

  const { error } = await supabase
    .from("daily_claims")
    .upsert([{ guild_id: guildId, user_id: userId, last_daily_claim_at: isoString }], {
      onConflict: "guild_id,user_id"
    });

  if (error) {
    debug.supabaseError("economy.setDailyClaim", "upsert", error, { guildId, userId, isoString });
    throw error;
  }
}

async function getDailyClaim(guildId, userId) {
  assertSupabase();

  const { data, error } = await supabase
    .from("daily_claims")
    .select("*")
    .eq("guild_id", guildId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    debug.supabaseError("economy.getDailyClaim", "select", error, { guildId, userId });
    throw error;
  }

  return data || null;
}

module.exports = {
  supabase,
  formatMoney,
  getOrCreateAccount,
  updateAccount,
  logTransaction,
  adminAdjustWallet,
  transferWalletToBank,
  transferBankToWallet,
  addBank,
  setDailyClaim,
  getDailyClaim
};
