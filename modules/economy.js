const { createClient } = require("@supabase/supabase-js");
const ws = require("ws");
const debug = require("../utils/debug");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey, { realtime: { transport: ws } }) : null;

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

  debug.step("economy.getOrCreateAccount", { userId, guildId, username });

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

  if (data) {
    debug.ok("economy.getOrCreateAccount", {
      status: "found",
      userId,
      guildId,
      wallet: data.wallet,
      bank: data.bank
    });
    return data;
  }

  const payload = {
    user_id: userId,
    guild_id: guildId,
    username: username || "Unknown",
    wallet: 0,
    bank: 0,
    last_daily_claim_at: null
  };

  debug.step("economy.getOrCreateAccount.insert", { payload });

  const { data: inserted, error: insertError } = await supabase
    .from("economy_accounts")
    .insert([payload])
    .select("*")
    .single();

  if (insertError) {
    debug.supabaseError("economy.getOrCreateAccount", "insert", insertError, { payload });
    throw insertError;
  }

  debug.ok("economy.getOrCreateAccount", {
    status: "created",
    userId,
    guildId,
    wallet: inserted?.wallet,
    bank: inserted?.bank
  });

  return inserted;
}

async function updateAccount(userId, guildId, updates) {
  assertSupabase();

  debug.step("economy.updateAccount", { userId, guildId, updates });

  const { data, error } = await supabase
    .from("economy_accounts")
    .update(updates)
    .eq("user_id", userId)
    .eq("guild_id", guildId)
    .select("*")
    .maybeSingle();

  if (error) {
    debug.supabaseError("economy.updateAccount", "update", error, { userId, guildId, updates });
    throw error;
  }

  if (!data) {
    const err = new Error("Account update returned no rows");
    debug.supabaseError("economy.updateAccount", "no_rows", err, { userId, guildId, updates });
    throw err;
  }

  debug.ok("economy.updateAccount", {
    userId,
    guildId,
    wallet: data?.wallet,
    bank: data?.bank
  });

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

  debug.step("economy.logTransaction", { payload });

  const { error } = await supabase
    .from("economy_transactions")
    .insert([payload]);

  if (error) {
    debug.supabaseError("economy.logTransaction", "insert", error, { payload });
    throw error;
  }

  debug.ok("economy.logTransaction", {
    userId: entry.userId,
    type: payload.type,
    amount: payload.amount
  });
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

async function deductFromWallet(userId, guildId, amount, username, extra = {}) {
  assertSupabase();
  amount = normalizeNumber(amount);

  if (amount === null) throw new Error("Amount must be a valid number");
  if (amount <= 0) throw new Error("Amount must be positive");

  const account = await getOrCreateAccount(userId, guildId, username);
  const wallet = Number(account.wallet || 0);

  if (wallet < amount) {
    throw new Error("Insufficient wallet funds");
  }

  const updated = await updateAccount(userId, guildId, {
    wallet: wallet - amount
  });

  await logTransaction({
    guildId,
    userId,
    username,
    type: "shop_purchase",
    amount: -amount,
    balanceAfter: updated.wallet,
    notes: extra.notes || null,
    metadata: extra.metadata || {}
  });

  debug.ok("economy.deductFromWallet", {
    userId,
    guildId,
    amount,
    walletBefore: wallet,
    walletAfter: updated.wallet
  });

  return updated;
}

async function deductFromBank(userId, guildId, amount, username, extra = {}) {
  assertSupabase();
  amount = normalizeNumber(amount);

  if (amount === null) throw new Error("Amount must be a valid number");
  if (amount <= 0) throw new Error("Amount must be positive");

  const account = await getOrCreateAccount(userId, guildId, username);
  const bank = Number(account.bank || 0);

  if (bank < amount) {
    throw new Error("Insufficient bank funds");
  }

  const updated = await updateAccount(userId, guildId, {
    bank: bank - amount
  });

  await logTransaction({
    guildId,
    userId,
    username,
    type: "shop_purchase",
    amount: -amount,
    balanceAfter: updated.bank,
    notes: extra.notes || null,
    metadata: extra.metadata || {}
  });

  debug.ok("economy.deductFromBank", {
    userId,
    guildId,
    amount,
    bankBefore: bank,
    bankAfter: updated.bank
  });

  return updated;
}

async function setDailyClaim(guildId, userId, isoString) {
  assertSupabase();

  const { error } = await supabase
    .from("economy_accounts")
    .update({ last_daily_claim_at: isoString })
    .eq("guild_id", guildId)
    .eq("user_id", userId);

  if (error) {
    debug.supabaseError("economy.setDailyClaim", "update", error, { guildId, userId, isoString });
    throw error;
  }
}

async function getDailyClaim(guildId, userId) {
  assertSupabase();

  const { data, error } = await supabase
    .from("economy_accounts")
    .select("last_daily_claim_at")
    .eq("guild_id", guildId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    debug.supabaseError("economy.getDailyClaim", "select", error, { guildId, userId });
    throw error;
  }

  return data || null;
}

async function upsertGamertagLink({ userId, guildId, username, gamertag, lastSeenAt }) {
  assertSupabase();

  const payload = {
    user_id: userId,
    guild_id: guildId,
    username: username || "Unknown",
    gamertag,
    last_seen_at: new Date(lastSeenAt).toISOString()
  };

  debug.step("economy.upsertGamertagLink", { payload });

  const { error } = await supabase
    .from("economy_gamertags")
    .upsert(payload, { onConflict: "user_id,guild_id" });

  if (error) {
    debug.supabaseError("economy.upsertGamertagLink", "upsert", error, { userId, guildId, gamertag });
    throw error;
  }

  debug.ok("economy.upsertGamertagLink", {
    userId,
    guildId,
    gamertag,
    lastSeenAt: payload.last_seen_at
  });
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
  deductFromWallet,
  deductFromBank,
  setDailyClaim,
  getDailyClaim,
  upsertGamertagLink
};
