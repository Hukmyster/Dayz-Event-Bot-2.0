const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

let shop = [];
let orders = [];

async function loadData() {
    const s = await supabase.from("shop").select("*");
    const o = await supabase.from("orders").select("*");

    shop = s.data || [];
    orders = o.data || [];

    console.log(`[DB] Shop:${shop.length} Orders:${orders.length}`);
}

module.exports = {
    supabase,
    getShop: () => shop,
    getOrders: () => orders,
    loadData
};
