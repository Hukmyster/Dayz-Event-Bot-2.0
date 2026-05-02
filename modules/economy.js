const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const ECONOMY_ROLE_ID = '1496741063191429160';
const CURRENCY_NAME = 'dollars';
const STARTING_BANK_BALANCE = Number(process.env.STARTING_BANK_BALANCE || 0);

const ACCOUNT_TABLE = 'economy_accounts';
const TRANSACTION_TABLE = 'economy_transactions';
const SHOP_TABLE = 'shop';

function hasAccess(member) {
  return member?.roles?.cache?.has(ECONOMY_ROLE_ID) || false;
}

function ensureEconomyRole(member) {
  if (!hasAccess(member)) {
    throw new Error('You do not have the required role to use economy commands.');
  }
}

function formatMoney(amount) {
  return `${Number(amount || 0).toLocaleString()} ${CURRENCY_NAME}`;
}

async function getAccount(userId, guildId) {
  const { data, error } = await supabase
    .from(ACCOUNT_TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('guild_id', guildId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function createAccount(userId, guildId, username = null) {
  const { data, error } = await supabase
    .from(ACCOUNT_TABLE)
    .insert({
      user_id: userId,
      guild_id: guildId,
      username,
      wallet: 0,
      bank: STARTING_BANK_BALANCE
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getOrCreateAccount(userId, guildId, username = null) {
  const existing = await getAccount(userId, guildId);
  if (existing) return existing;
  return createAccount(userId, guildId, username);
}

async function updateAccount(userId, guildId, updates) {
  const { data, error } = await supabase
    .from(ACCOUNT_TABLE)
    .update(updates)
    .eq('user_id', userId)
    .eq('guild_id', guildId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function logTransaction({
  guildId,
  userId,
  username = null,
  type,
  amount,
  balanceAfter = null,
  targetUserId = null,
  targetUsername = null,
  notes = null,
  metadata = {}
}) {
  const { data, error } = await supabase
    .from(TRANSACTION_TABLE)
    .insert({
      guild_id: guildId,
      user_id: userId,
      username,
      type,
      amount,
      balance_after: balanceAfter,
      target_user_id: targetUserId,
      target_username: targetUsername,
      notes,
      metadata
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function addWallet(userId, guildId, amount, username = null, meta = {}) {
  const account = await getOrCreateAccount(userId, guildId, username);
  const newWallet = Number(account.wallet || 0) + Number(amount);
  const updated = await updateAccount(userId, guildId, { wallet: newWallet });

  await logTransaction({
    guildId,
    userId,
    username,
    type: Number(amount) >= 0 ? 'wallet_add' : 'wallet_remove',
    amount: Number(amount),
    balanceAfter: newWallet,
    notes: meta.notes || null,
    metadata: meta
  });

  return updated;
}

async function addBank(userId, guildId, amount, username = null, meta = {}) {
  const account = await getOrCreateAccount(userId, guildId, username);
  const newBank = Number(account.bank || 0) + Number(amount);
  const updated = await updateAccount(userId, guildId, { bank: newBank });

  await logTransaction({
    guildId,
    userId,
    username,
    type: Number(amount) >= 0 ? 'bank_add' : 'bank_remove',
    amount: Number(amount),
    balanceAfter: newBank,
    notes: meta.notes || null,
    metadata: meta
  });

  return updated;
}

async function transferWalletToBank(userId, guildId, amount, username = null, meta = {}) {
  const account = await getOrCreateAccount(userId, guildId, username);
  amount = Number(amount);

  if (Number(account.wallet || 0) < amount) {
    throw new Error('Insufficient wallet balance.');
  }

  const updated = await updateAccount(userId, guildId, {
    wallet: Number(account.wallet || 0) - amount,
    bank: Number(account.bank || 0) + amount
  });

  await logTransaction({
    guildId,
    userId,
    username,
    type: 'deposit',
    amount,
    balanceAfter: updated.bank,
    notes: meta.notes || null,
    metadata: meta
  });

  return updated;
}

async function transferBankToWallet(userId, guildId, amount, username = null, meta = {}) {
  const account = await getOrCreateAccount(userId, guildId, username);
  amount = Number(amount);

  if (Number(account.bank || 0) < amount) {
    throw new Error('Insufficient bank balance.');
  }

  const updated = await updateAccount(userId, guildId, {
    bank: Number(account.bank || 0) - amount,
    wallet: Number(account.wallet || 0) + amount
  });

  await logTransaction({
    guildId,
    userId,
    username,
    type: 'withdraw',
    amount,
    balanceAfter: updated.wallet,
    notes: meta.notes || null,
    metadata: meta
  });

  return updated;
}

async function chargeWallet(userId, guildId, amount, username = null, meta = {}) {
  const account = await getOrCreateAccount(userId, guildId, username);
  amount = Number(amount);

  if (Number(account.wallet || 0) < amount) {
    throw new Error('Insufficient wallet balance.');
  }

  const updated = await updateAccount(userId, guildId, {
    wallet: Number(account.wallet || 0) - amount
  });

  await logTransaction({
    guildId,
    userId,
    username,
    type: 'purchase_wallet',
    amount: -amount,
    balanceAfter: updated.wallet,
    notes: meta.notes || null,
    metadata: meta
  });

  return updated;
}

async function chargeBank(userId, guildId, amount, username = null, meta = {}) {
  const account = await getOrCreateAccount(userId, guildId, username);
  amount = Number(amount);

  if (Number(account.bank || 0) < amount) {
    throw new Error('Insufficient bank balance.');
  }

  const updated = await updateAccount(userId, guildId, {
    bank: Number(account.bank || 0) - amount
  });

  await logTransaction({
    guildId,
    userId,
    username,
    type: 'purchase_bank',
    amount: -amount,
    balanceAfter: updated.bank,
    notes: meta.notes || null,
    metadata: meta
  });

  return updated;
}

async function chargeByMethod(userId, guildId, amount, method = 'wallet', username = null, meta = {}) {
  const normalized = String(method || 'wallet').toLowerCase();
  if (normalized === 'bank') {
    return chargeBank(userId, guildId, amount, username, meta);
  }
  return chargeWallet(userId, guildId, amount, username, meta);
}

async function adminAdjustWallet(userId, guildId, amount, username = null, meta = {}) {
  return addWallet(userId, guildId, amount, username, {
    ...meta,
    admin: true
  });
}

async function adminAdjustBank(userId, guildId, amount, username = null, meta = {}) {
  return addBank(userId, guildId, amount, username, {
    ...meta,
    admin: true
  });
}

async function getShopItems() {
  const { data, error } = await supabase
    .from(SHOP_TABLE)
    .select('id,displayname,type,price')
    .order('displayname', { ascending: true });

  if (error) throw error;

  return (data || []).map(row => ({
    id: row.id,
    name: row.displayname,
    displayname: row.displayname,
    type: row.type,
    price: Number(row.price)
  }));
}

async function findShopItemByName(name) {
  const clean = String(name ?? '').trim();

  const { data, error } = await supabase
    .from(SHOP_TABLE)
    .select('id,displayname,type,price')
    .ilike('displayname', clean)
    .maybeSingle();

  if (error) throw error;

  return data
    ? {
        id: data.id,
        name: data.displayname,
        displayname: data.displayname,
        type: data.type,
        price: Number(data.price)
      }
    : null;
}

module.exports = {
  supabase,
  ECONOMY_ROLE_ID,
  CURRENCY_NAME,
  STARTING_BANK_BALANCE,
  ACCOUNT_TABLE,
  TRANSACTION_TABLE,
  SHOP_TABLE,
  hasAccess,
  ensureEconomyRole,
  formatMoney,
  getAccount,
  getOrCreateAccount,
  createAccount,
  updateAccount,
  logTransaction,
  addWallet,
  addBank,
  transferWalletToBank,
  transferBankToWallet,
  chargeWallet,
  chargeBank,
  chargeByMethod,
  adminAdjustWallet,
  adminAdjustBank,
  getShopItems,
  findShopItemByName
};
