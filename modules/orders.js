const db = require("../services/db");

// ---------------- CREATE ----------------
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

    if (error) throw error;

    await db.loadData();
}

// ---------------- QUEUE ----------------
async function queueOrders() {

    const orders = db.getOrders();

    for (const o of orders) {
        if (o.status === "pending") {
            o.status = "queued";
        }
    }

    await db.saveOrders(orders);
}

// ---------------- CYCLE ----------------
async function cycleOrders() {

    const orders = db.getOrders();

    for (const o of orders) {
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
