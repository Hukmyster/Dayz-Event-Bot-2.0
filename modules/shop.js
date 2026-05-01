const db = require("../services/db");
const xml = require("./xml");
const fs = require("fs");

// =====================
// COMMAND REGISTRATION
// =====================
module.exports.commands = [
    {
        name: "shop",
        description: "View shop items"
    },
    {
        name: "buy",
        description: "Buy an item from the shop",
        options: [
            {
                name: "item",
                description: "Item name",
                type: 3,
                required: true,
                autocomplete: true
            },
            {
                name: "x",
                description: "X coordinate",
                type: 4,
                required: true
            },
            {
                name: "z",
                description: "Z coordinate",
                type: 4,
                required: true
            },
            {
                name: "quantity",
                description: "Amount to buy",
                type: 4,
                required: false
            }
        ]
    },
    {
        name: "additem",
        description: "Add item to shop"
    },
    {
        name: "deleteshopitem",
        description: "Remove item from shop",
        options: [
            {
                name: "item",
                description: "Item name",
                type: 3,
                required: true,
                autocomplete: true
            }
        ]
    },
    {
        name: "deleteshophistory",
        description: "Clear all purchase history"
    },
    {
        name: "queue",
        description: "View queued orders"
    },
    {
        name: "build",
        description: "Build XML files"
    },
    {
        name: "shopcycle",
        description: "Force rebuild cycle"
    },
    {
        name: "viewxml",
        description: "View generated XML"
    }
];

// =====================
// AUTOCOMPLETE
// =====================
module.exports.autocomplete = async (interaction) => {
    const shop = db.getShop?.() || [];

    const focused = interaction.options.getFocused();

    const filtered = shop
        .filter(i =>
            i.displayName.toLowerCase().includes(focused.toLowerCase())
        )
        .slice(0, 25);

    return interaction.respond(
        filtered.map(i => ({
            name: i.displayName,
            value: i.displayName
        }))
    );
};

// =====================
// VIEW SHOP
// =====================
module.exports.view = async (interaction) => {

    const shop = db.getShop?.() || [];

    const list = shop.length
        ? shop.map(i => `• ${i.displayName} ($${i.price})`).join("\n")
        : "Shop is empty";

    return interaction.reply({
        content: list,
        ephemeral: true
    });
};

// =====================
// BUY ITEM
// =====================
module.exports.buy = async (interaction) => {

    const shop = db.getShop?.() || [];

    const itemName = interaction.options.getString("item");
    const x = interaction.options.getInteger("x");
    const z = interaction.options.getInteger("z");
    const quantity = interaction.options.getInteger("quantity") || 1;

    const item = shop.find(i => i.displayName === itemName);

    if (!item) {
        return interaction.reply({
            content: "Item not found",
            ephemeral: true
        });
    }

    const orders = db.getOrders?.() || [];

    orders.push({
        id: Date.now().toString(),
        displayName: item.displayName,
        type: item.type,
        x,
        z,
        quantity,
        status: "queued"
    });

    db.saveOrders?.(orders);

    return interaction.reply({
        content: `Purchased ${quantity}x ${item.displayName}`,
        ephemeral: true
    });
};

// =====================
// ADD ITEM (SAFE PLACEHOLDER OR MODAL READY)
// =====================
module.exports.add = async (interaction) => {

    // For now safe stub so bot never hangs
    return interaction.reply({
        content: "Additem UI will be upgraded to modal system next step.",
        ephemeral: true
    });
};

// =====================
// DELETE ITEM
// =====================
module.exports.remove = async (interaction) => {

    let shop = db.getShop?.() || [];

    const name = interaction.options.getString("item");

    const before = shop.length;

    shop = shop.filter(i => i.displayName !== name);

    db.saveShop?.(shop);

    return interaction.reply({
        content: `Removed item. (${before - shop.length})`,
        ephemeral: true
    });
};

// =====================
// CLEAR HISTORY (SAFE)
// =====================
module.exports.clearOrders = async (interaction) => {

    db.saveOrders?.([]);

    // also wipe XML safely
    try {
        fs.writeFileSync("./custom/shopevents.xml", "<events></events>");
        fs.writeFileSync("./custom/cfgeventspawns.xml", "<eventposdef></eventposdef>");
    } catch (e) {
        console.log("[XML CLEAR ERROR]", e.message);
    }

    return interaction.reply({
        content: "Order history cleared",
        ephemeral: true
    });
};

// =====================
// QUEUE VIEW
// =====================
module.exports.queue = async (interaction) => {

    const orders = db.getOrders?.() || [];

    const queued = orders.filter(o => o.status === "queued");

    return interaction.reply({
        content: queued.length
            ? queued.map(o =>
                `• ${o.quantity}x ${o.displayName} @ (${o.x}, ${o.z})`
            ).join("\n")
            : "No queued orders",
        ephemeral: true
    });
};

// =====================
// BUILD XML
// =====================
module.exports.build = async (interaction) => {
    await xml.buildXML(db);

    return interaction.reply({
        content: "XML built successfully",
        ephemeral: true
    });
};

// =====================
// FORCE CYCLE
// =====================
module.exports.forceCycle = async (interaction) => {

    const orders = db.getOrders?.() || [];

    orders.forEach(o => o.status = "queued");

    db.saveOrders?.(orders);

    await xml.buildXML(db);

    return interaction.reply({
        content: "Shop cycle completed",
        ephemeral: true
    });
};

// =====================
// VIEW XML
// =====================
module.exports.viewXML = async (interaction) => {

    let events = "";
    let spawns = "";

    try {
        events = fs.readFileSync("./custom/shopevents.xml", "utf8");
        spawns = fs.readFileSync("./custom/cfgeventspawns.xml", "utf8");
    } catch (e) {
        return interaction.reply({
            content: "XML files not found yet",
            ephemeral: true
        });
    }

    return interaction.reply({
        content:
`EVENTS:
\`\`\`xml
${events}
\`\`\`

SPAWNS:
\`\`\`xml
${spawns}
\`\`\``,
        ephemeral: true
    });
};
