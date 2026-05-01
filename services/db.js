const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

// ---------------- CACHE ----------------
let shopCache = [];
let ordersCache = [];

// ---------------- LOAD ----------------
async function loadData() {
    try {
        console.log("[DB] Loading...");

        const { data: shop } = await supabase
            .from("shop")
            .select("*");

        const { data: orders } = await supabase
            .from("orders")
            .select("*");

        shopCache = shop || [];
        ordersCache = orders || [];

        console.log(`[DB] Shop:${shopCache.length} Orders:${ordersCache.length}`);

    } catch (err) {
        console.error("[DB LOAD ERROR]", err);
    }
}

// ---------------- GETTERS ----------------
function getShop() {
    return shopCache;
}

function getOrders() {
    return ordersCache;
}

// ---------------- SAVE ORDERS ----------------
async function saveOrders(orders) {
    const { error } = await supabase
        .from("orders")
        .upsert(orders, { onConflict: "id" });

    if (error) {
        console.error("[DB SAVE ORDERS ERROR]", error);
        throw error;
    }

    ordersCache = orders;
}

// ---------------- SAVE SHOP ----------------
async function saveShop(shop) {
    const { error } = await supabase
        .from("shop")
        .upsert(shop, { onConflict: "id" });

    if (error) {
        console.error("[DB SAVE SHOP ERROR]", error);
        throw error;
    }

    shopCache = shop;
}

// ---------------- CLEAR EVERYTHING ----------------
async function clearAllShopData() {

    console.log("[DB] Clearing shop + orders...");

    const { error: shopErr } = await supabase
        .from("shop")
        .delete()
        .neq("id", "none");

    const { error: orderErr } = await supabase
        .from("orders")
        .delete()
        .neq("id", "none");

    if (shopErr) console.error("[CLEAR SHOP ERROR]", shopErr);
    if (orderErr) console.error("[CLEAR ORDERS ERROR]", orderErr);

    shopCache = [];
    ordersCache = [];

    console.log("[DB] All data cleared");
}

module.exports = {
    supabase,
    loadData,
    getShop,
    getOrders,
    saveOrders,
    saveShop,
    clearAllShopData
};
