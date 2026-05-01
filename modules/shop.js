const fs = require("fs");
const db = require("../services/db");
const xml = require("./xml");

// ---------------- COMMANDS ----------------
module.exports.commands = [
    { name: "shop", description: "View shop" },
    {
        name: "buy",
        description: "Buy item",
        options: [
            { name: "item", type: 3, required: true, autocomplete: true },
            { name: "x", type: 4, required: true },
            { name: "z", type: 4, required: true },
            { name: "quantity", type: 4, required: false }
        ]
    },
    { name: "additem", description: "Add item" },
    {
        name: "deleteshopitem",
        description: "Delete item",
        options: [
            { name: "item", type: 3, required: true, autocomplete: true }
        ]
    },
    { name: "deleteshophistory", description: "Clear orders" },
    { name: "queue", description: "Queue orders" },
    { name: "build", description: "Build XML" },
    { name: "shopcycle", description: "Force cycle" },
    { name: "viewxml", description: "View XML" }
];

// ---------------- AUTOCOMPLETE ----------------
module.exports.autocomplete = async (i) => {

    const shop = db.getShop();

    return i.respond(
        shop.map(x => ({
            name: x.displayName,
            value: x.displayName
        }))
    );
};

// ---------------- VIEW ----------------
module.exports.view = async (i) => {
    return i.reply({
        content: db.getShop().map(x =>
            `• ${x.displayName} ($${x.price})`
        ).join("\n") || "Empty",
        ephemeral: true
    });
};

// ---------------- BUY ----------------
module.exports.buy = async (i) => {

    const shop = db.getShop();

    const name = i.options.getString("item");
    const x = i.options.getInteger("x");
    const z = i.options.getInteger("z");
    const qty = i.options.getInteger("quantity") || 1;

    const item = shop.find(x =>
        x.displayName === name
    );

    if (!item)
        return i.reply({ content: "Not found", ephemeral: true });

    const orders = db.getOrders();

    orders.push({
        displayName: item.displayName,
        type: item.type,
        x, z,
        quantity: qty,
        status: "queued"
    });

    db.saveOrders(orders);

    return i.reply({
        content: `Ordered ${qty}x ${item.displayName}`,
        ephemeral: true
    });
};

// ---------------- ADD ITEM ----------------
module.exports.add = async (i) => {
    return i.reply({ content: "Use DB file add (next upgrade will add modal)", ephemeral: true });
};

// ---------------- DELETE ITEM ----------------
module.exports.remove = async (i) => {

    let shop = db.getShop();

    const name = i.options.getString("item");

    shop = shop.filter(x => x.displayName !== name);

    db.saveShop(shop);

    return i.reply({ content: "Removed", ephemeral: true });
};

// ---------------- ORDERS ----------------
module.exports.clearOrders = async (i) => {
    db.saveOrders([]);
    fs.writeFileSync("./custom/shopevents.xml", "<events></events>");
    fs.writeFileSync("./custom/cfgeventspawns.xml", "<eventposdef></eventposdef>");

    return i.reply({ content: "Cleared", ephemeral: true });
};

// ---------------- QUEUE ----------------
module.exports.queue = async (i) => {
    return i.reply({ content: "Queued (placeholder)", ephemeral: true });
};

// ---------------- BUILD ----------------
module.exports.build = async (i) => {
    await xml.buildXML(db);
    return i.reply({ content: "Built", ephemeral: true });
};

// ---------------- FORCE CYCLE ----------------
module.exports.forceCycle = async (i) => {
    const orders = db.getOrders();

    orders.forEach(o => o.status = "queued");

    db.saveOrders(orders);
    await xml.buildXML(db);

    return i.reply({ content: "Cycled", ephemeral: true });
};

// ---------------- VIEW XML ----------------
module.exports.viewXML = async (i) => {

    const event = fs.readFileSync("./custom/shopevents.xml", "utf8");
    const spawn = fs.readFileSync("./custom/cfgeventspawns.xml", "utf8");

    return i.reply({
        content: "EVENT:\n```xml\n" + event + "\n```\nSPAWN:\n```xml\n" + spawn + "\n```",
        ephemeral: true
    });
};
