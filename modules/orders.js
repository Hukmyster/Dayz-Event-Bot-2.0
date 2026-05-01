const db = require("../services/db");

async function createOrder(item, x, z) {

    await db.supabase.from("orders").insert([{
        id: Date.now(),
        itemType: item.type,
        displayName: item.displayName,
        x,
        z,
        status: "pending"
    }]);

    await db.loadData();
}

async function queueOrders() {

    for (let o of db.getOrders()) {
        if (o.status === "pending") {
            await db.supabase.from("orders")
                .update({ status: "queued" })
                .eq("id", o.id);
        }
    }

    await db.loadData();
}

async function cycleOrders() {

    for (let o of db.getOrders()) {
        if (o.status === "built") {
            await db.supabase.from("orders")
                .update({ status: "completed" })
                .eq("id", o.id);
        }
    }

    await db.loadData();
}

module.exports = {
    createOrder,
    queueOrders,
    cycleOrders
};
