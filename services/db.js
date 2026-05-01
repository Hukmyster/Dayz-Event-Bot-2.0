const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

let shopCache = [];
let ordersCache = [];

// ---------------- LOAD ----------------
async function loadData() {
    console.log("[DB] Loading...");

    const { data: shop } = await supabase.from("shop").select("*");
    const { data: orders } = await supabase.from("orders").select("*");

    shopCache = shop || [];
    ordersCache = orders || [];

    console.log(`[DB] Shop:${shopCache.length} Orders:${ordersCache.length}`);
}

// ---------------- GETTERS ----------------
const getShop = () => shopCache;
const getOrders = () => ordersCache;

// ---------------- SAVE ORDERS ----------------
async function saveOrders(orders) {

    const { error } = await supabase
        .from("orders")
        .upsert(orders, { onConflict: "id" });

    if (error) throw error;

    ordersCache = orders;
}

// ---------------- SAVE SHOP ----------------
async function saveShop(shop) {

    const { error } = await supabase
        .from("shop")
        .upsert(shop, { onConflict: "id" });

    if (error) throw error;

    shopCache = shop;
}

// ---------------- CLEAR ALL ----------------
async function clearAll() {

    await supabase.from("shop").delete().neq("id", "none");
    await supabase.from("orders").delete().neq("id", "none");

    shopCache = [];
    ordersCache = [];

    console.log("[DB] Cleared shop + orders");
}

module.exports = {
    supabase,
    loadData,
    getShop,
    getOrders,
    saveOrders,
    saveShop,
    clearAll
};
