const db = require("../services/db");
const xml = require("./xml");

// =========================
// COMMANDS
// =========================
module.exports.commands = [
    { name: "shop", description: "View shop items" },
    { name: "queue", description: "View queued orders" },
    { name: "orders", description: "View all orders" },
    { name: "build", description: "Build XML from orders" },
    { name: "shopcycle", description: "Force all orders → XML" },
    { name: "deleteshophistory", description: "Clear all orders" },

    {
        name: "buy",
        description: "Buy item",
        options: [
            { name: "item", description: "Item", type: 3, required: true, autocomplete: true },
            { name: "x", description: "X coord", type: 4, required: true },
            { name: "z", description: "Z coord", type: 4, required: true },
            { name: "quantity", description: "Amount", type: 4, required: false }
        ]
    },

    { name: "additem", description: "Add shop item" },

    {
        name: "deleteshopitem",
        description: "Delete shop item",
        options: [
            { name: "item", description: "Item", type: 3, required: true, autocomplete: true }
        ]
    }
];

// =========================
// SHOP
// =========================
module.exports.shop = async (interaction) => {

    const shop = db.getShop();

    if (!shop.length) {
        return interaction.reply({ content: "Shop empty", ephemeral: true });
    }

    return interaction.reply({
        content: shop.map(i => `• ${i.displayName} ($${i.price})`).join("\n"),
        ephemeral: true
    });
};

// =========================
// BUY
// =========================
module.exports.buy = async (interaction) => {

    const shop = db.getShop();

    const itemName = interaction.options.getString("item");
    const x = interaction.options.getInteger("x");
    const z = interaction.options.getInteger("z");
    const qty = interaction.options.getInteger("quantity") || 1;

    const item = shop.find(i => i.displayName === itemName);

    if (!item) {
        return interaction.reply({ content: "Item not found", ephemeral: true });
    }

    const orders = db.getOrders();

    orders.push({
        displayName: item.displayName,
        type: item.type,
        price: item.price,
        x,
        z,
        quantity: qty,
        status: "queued"
    });

    db.saveOrders(orders);

    return interaction.reply({
        content: `Purchased ${qty}x ${item.displayName}`,
        ephemeral: true
    });
};

// =========================
// QUEUE (FIXED)
// =========================
module.exports.queue = async (interaction) => {

    const orders = db.getOrders().filter(o => o.status === "queued");

    if (!orders.length) {
        return interaction.reply({ content: "Queue empty", ephemeral: true });
    }

    return interaction.reply({
        content: orders.map(o =>
            `• ${o.displayName} x${o.quantity} @ (${o.x},${o.z})`
        ).join("\n"),
        ephemeral: true
    });
};

// =========================
// ORDERS (ALL STAGES)
// =========================
module.exports.orders = async (interaction) => {

    const orders = db.getOrders();

    if (!orders.length) {
        return interaction.reply({ content: "No orders", ephemeral: true });
    }

    return interaction.reply({
        content: orders.map(o =>
            `• ${o.displayName} x${o.quantity} (${o.status})`
        ).join("\n"),
        ephemeral: true
    });
};

// =========================
// BUILD (FIXED TIMEOUT BUG)
// =========================
module.exports.build = async (interaction) => {

    await interaction.deferReply({ ephemeral: true });

    try {
        xml.buildXML(db);

        return interaction.editReply("XML built successfully");
    } catch (err) {
        console.log(err);
        return interaction.editReply("Build failed");
    }
};

// =========================
// SHOP CYCLE (FORCE BUILD)
// =========================
module.exports.shopcycle = async (interaction) => {

    await interaction.deferReply({ ephemeral: true });

    try {
        let orders = db.getOrders();

        // force all to built
        orders = orders.map(o => ({ ...o, status: "built" }));

        db.saveOrders(orders);

        xml.buildXML(db);

        return interaction.editReply("Shop cycle complete (all built)");
    } catch (err) {
        console.log(err);
        return interaction.editReply("Shop cycle failed");
    }
};

// =========================
// CLEAR ORDERS
// =========================
module.exports.deleteshophistory = async (interaction) => {

    db.saveOrders([]);

    return interaction.reply({
        content: "Orders cleared",
        ephemeral: true
    });
};

// =========================
// DELETE SHOP ITEM
// =========================
module.exports.deleteshopitem = async (interaction) => {

    const name = interaction.options.getString("item");

    let shop = db.getShop();

    shop = shop.filter(i => i.displayName !== name);

    db.saveShop(shop);

    return interaction.reply({
        content: "Item removed",
        ephemeral: true
    });
};

// =========================
// AUTOCOMPLETE
// =========================
module.exports.autocomplete = async (interaction) => {

    const shop = db.getShop();
    const focused = interaction.options.getFocused();

    return interaction.respond(
        shop
            .filter(i => i.displayName.toLowerCase().includes(focused.toLowerCase()))
            .slice(0, 25)
            .map(i => ({
                name: i.displayName,
                value: i.displayName
            }))
    );
};
