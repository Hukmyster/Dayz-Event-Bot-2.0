const db = require("../services/db");

// ---------------- CREATE ORDER ----------------
async function createOrder(item, x, z) {

    const order = {
        id: Date.now().toString(),
        itemType: item.type,
        displayName: item.displayName,
        x: Number(x),
        z: Number(z),
        status: "pending"
    };

    const { error } = await db.supabase
        .from("orders")
        .insert([order]);

    if (error) {
        console.error("[ORDER INSERT ERROR]", error);
        throw error;
    }

    await db.loadData();
}

// ---------------- QUEUE ORDERS ----------------
async function queueOrders() {

    const orders = db.getOrders();

    for (let o of orders) {
        if (o.status === "pending") {
            o.status = "queued";
        }
    }

    await db.saveOrders(orders);
}

// ---------------- CYCLE ORDERS ----------------
async function cycleOrders() {

    const orders = db.getOrders();

    for (let o of orders) {
        if (o.status === "built") {
            o.status = "completed";
        }
    }

    await db.saveOrders(orders);
}

module.exports = {
    createOrder,
    queueOrders,
    cycleOrders
};
