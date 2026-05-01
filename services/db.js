// If you're not using Supabase yet, keep this file as a small wrapper
// and replace the env names below with the ones you use on Railway.

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let cache = {
  orders: []
};

async function loadData() {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("id", { ascending: true });

  if (error) throw error;

  cache.orders = data || [];
  return cache.orders;
}

function getOrders() {
  return cache.orders;
}

async function saveOrders(orders) {
  const { error } = await supabase.from("orders").upsert(orders, {
    onConflict: "id"
  });

  if (error) throw error;

  cache.orders = orders;
  return true;
}

module.exports = {
  supabase,
  loadData,
  getOrders,
  saveOrders
};
