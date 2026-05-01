const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

let shopCache = [];
let ordersCache = [];

async function loadData() {

    const { data: shop } = await supabase.from("shop").select("*");
    const { data: orders } = await supabase.from("orders").select("*");

    shopCache = shop || [];
    ordersCache = orders || [];

    console.log(`[DB] Shop:${shopCache.length} Orders:${ordersCache.length}`);
}

const getShop = () => shopCache;
const getOrders = () => ordersCache;

async function saveShop(shop) {
    await supabase.from("shop").upsert(shop, { onConflict: "id" });
    shopCache = shop;
}

async function saveOrders(orders) {
    await supabase.from("orders").upsert(orders, { onConflict: "id" });
    ordersCache = orders;
}

async function clearAll() {
    await supabase.from("shop").delete().neq("id", "none");
    await supabase.from("orders").delete().neq("id", "none");

    shopCache = [];
    ordersCache = [];
}

module.exports = {
    supabase,
    loadData,
    getShop,
    getOrders,
    saveShop,
    saveOrders,
    clearAll
};
