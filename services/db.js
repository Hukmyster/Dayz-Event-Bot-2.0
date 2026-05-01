const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

// ---------------- LOCAL CACHE ----------------
let shopCache = [];
let ordersCache = [];

// ---------------- LOAD DATA ----------------
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

// ---------------- SHOP ----------------
function getShop() {
    return shopCache;
}

// ---------------- ORDERS ----------------
function getOrders() {
    return ordersCache;
}

// ---------------- SAVE ORDERS (FIXED) ----------------
async function saveOrders(orders) {

    try {
        const { error } = await supabase
            .from("orders")
            .upsert(orders, { onConflict: "id" });

        if (error) {
            console.error("[DB SAVE ORDERS ERROR]", error);
            throw error;
        }

        ordersCache = orders;

    } catch (err) {
        console.error("[DB SAVE ORDERS FAIL]", err);
        throw err;
    }
}

// ---------------- SAVE SHOP (optional future use) ----------------
async function saveShop(shop) {

    try {
        const { error } = await supabase
            .from("shop")
            .upsert(shop, { onConflict: "id" });

        if (error) {
            console.error("[DB SAVE SHOP ERROR]", error);
            throw error;
        }

        shopCache = shop;

    } catch (err) {
        console.error("[DB SAVE SHOP FAIL]", err);
        throw err;
    }
}

// ---------------- EXPORTS ----------------
module.exports = {
    supabase,
    loadData,
    getShop,
    getOrders,
    saveOrders,
    saveShop
};
