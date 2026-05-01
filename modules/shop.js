const db = require("../services/db");
const xml = require("./xml");

// =========================
// COMMANDS
// =========================
module.exports.commands = [
    { name: "shop", description: "View shop" },
    { name: "queue", description: "View queued orders" },
    { name: "orders", description: "View all orders" },
    { name: "build", description: "Build XML" },
    { name: "shopcycle", description: "Force build all orders" },
    { name: "deleteshophistory", description: "Clear orders" },

    {
        name: "buy",
        description: "Buy item",
        options: [
            { name: "item", description: "Item", type: 3, required: true, autocomplete: true },
            { name: "x", description: "X", type: 4, required: true },
            { name: "z", description: "Z", type: 4, required: true },
            { name: "quantity", description: "Amount", type: 4, required: false }
        ]
    },

    { name: "additem", description: "Add item" },

    {
        name: "deleteshopitem",
        description: "Delete item",
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

    if (!shop.length)
        return interaction.reply({ content: "Shop empty", ephemeral: true });

    return interaction.reply({
        content: shop.map(i => `• ${i.displayName} ($${i.price})`).join("\n"),
        ephemeral: true
    });
};

// =========================
// BUY → INSTANT XML READY
// =========================
module.exports.buy = async (interaction) => {

    const shop = db.getShop();

    const name = interaction.options.getString("item");
    const x = interaction.options.getInteger("x");
    const z = interaction.options.getInteger("z");
    const qty = interaction.options.getInteger("quantity") || 1;

    const item = shop.find(i => i.displayName === name);

    if (!item)
        return interaction.reply({ content: "Item not found", ephemeral: true });

    const orders = db.getOrders();

    orders.push({
        displayName: item.displayName,
        type: item.type,
        price: item.price,
        x,
        z,
        quantity: qty,
        status: "built"
    });

    db.saveOrders(orders);

    return interaction.reply({
        content: `Purchased ${qty}x ${item.displayName}`,
        ephemeral: true
    });
};

// =========================
// QUEUE
// =========================
module.exports.queue = async (interaction) => {
    const orders = db.getOrders().filter(o => o.status === "queued");

    if (!orders.length)
        return interaction.reply({ content: "Queue empty", ephemeral: true });

    return interaction.reply({
        content: orders.map(o => `• ${o.displayName} x${o.quantity}`).join("\n"),
        ephemeral: true
    });
};

// =========================
// ORDERS
// =========================
module.exports.orders = async (interaction) => {
    const orders = db.getOrders();

    if (!orders.length)
        return interaction.reply({ content: "No orders", ephemeral: true });

    return interaction.reply({
        content: orders.map(o =>
            `• ${o.displayName} x${o.quantity} (${o.status})`
        ).join("\n"),
        ephemeral: true
    });
};

// =========================
// BUILD XML
// =========================
module.exports.build = async (interaction) => {

    await interaction.deferReply({ ephemeral: true });

    const result = xml.buildXML(db);

    return interaction.editReply({
        content:
            `EVENTS XML:\n\n${result.events.substring(0, 1500)}\n\n` +
            `POS XML:\n\n${result.pos.substring(0, 1500)}`
    });
};

// =========================
// SHOPCYCLE
// =========================
module.exports.shopcycle = async (interaction) => {

    await interaction.deferReply({ ephemeral: true });

    let orders = db.getOrders();

    orders = orders.map(o => ({ ...o, status: "built" }));

    db.saveOrders(orders);

    const result = xml.buildXML(db);

    return interaction.editReply({
        content: "All orders built into XML"
    });
};

// =========================
// DELETE HISTORY
// =========================
module.exports.deleteshophistory = async (interaction) => {

    db.saveOrders([]);

    return interaction.reply({
        content: "Orders cleared",
        ephemeral: true
    });
};

// =========================
// DELETE ITEM
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
            .map(i => ({ name: i.displayName, value: i.displayName }))
            .slice(0, 25)
    );
};
