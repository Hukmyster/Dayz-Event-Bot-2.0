const db = require("../services/db");
const xml = require("./xml");

const {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder
} = require("discord.js");

// =========================
// SLASH COMMAND DEFINITIONS
// =========================
module.exports.commands = [
    { name: "shop", description: "View shop items" },

    {
        name: "buy",
        description: "Buy item",
        options: [
            {
                name: "item",
                description: "Select item",
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
                description: "Amount",
                type: 4,
                required: false
            }
        ]
    },

    { name: "additem", description: "Add shop item" },

    {
        name: "deleteshopitem",
        description: "Remove item",
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

    { name: "deleteshophistory", description: "Clear orders only" },
    { name: "build", description: "Build XML files" },
    { name: "viewxml", description: "View XML output" }
];

// =========================
// SHOP VIEW
// =========================
module.exports.shop = async (interaction) => {

    const shop = db.getShop();

    const output = shop.length
        ? shop.map(i => `• ${i.displayName} ($${i.price})`).join("\n")
        : "Shop is empty";

    return interaction.reply({
        content: output,
        ephemeral: true
    });
};

// =========================
// BUY ITEM
// =========================
module.exports.buy = async (interaction) => {

    const shop = db.getShop();

    const itemName = interaction.options.getString("item");
    const x = interaction.options.getInteger("x");
    const z = interaction.options.getInteger("z");
    const qty = interaction.options.getInteger("quantity") || 1;

    const item = shop.find(i => i.displayName === itemName);

    if (!item) {
        return interaction.reply({
            content: "Item not found",
            ephemeral: true
        });
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
// ADD ITEM (MODAL OPEN)
// =========================
module.exports.additem = async (interaction) => {

    const modal = new ModalBuilder()
        .setCustomId("additem_modal")
        .setTitle("Add Shop Item");

    const name = new TextInputBuilder()
        .setCustomId("name")
        .setLabel("Display Name")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    const type = new TextInputBuilder()
        .setCustomId("type")
        .setLabel("DayZ Type (M4A1 etc)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    const price = new TextInputBuilder()
        .setCustomId("price")
        .setLabel("Price")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(name),
        new ActionRowBuilder().addComponents(type),
        new ActionRowBuilder().addComponents(price)
    );

    return interaction.showModal(modal);
};

// =========================
// MODAL HANDLER
// =========================
module.exports.handleModal = async (interaction) => {

    if (interaction.customId !== "additem_modal") return;

    const shop = db.getShop();

    shop.push({
        displayName: interaction.fields.getTextInputValue("name"),
        type: interaction.fields.getTextInputValue("type"),
        price: parseInt(interaction.fields.getTextInputValue("price"))
    });

    db.saveShop(shop);

    return interaction.reply({
        content: "Item added successfully",
        ephemeral: true
    });
};

// =========================
// AUTOCOMPLETE FIX (IMPORTANT)
// =========================
module.exports.autocomplete = async (interaction) => {

    const shop = db.getShop();

    const focused = interaction.options.getFocused();

    const results = shop
        .filter(i =>
            i.displayName.toLowerCase().includes(focused.toLowerCase())
        )
        .slice(0, 25)
        .map(i => ({
            name: i.displayName,
            value: i.displayName
        }));

    return interaction.respond(results);
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
// CLEAR ORDERS ONLY
// =========================
module.exports.deleteshophistory = async (interaction) => {

    db.saveOrders([]);

    return interaction.reply({
        content: "Order history cleared",
        ephemeral: true
    });
};

// =========================
// BUILD XML
// =========================
module.exports.build = async (interaction) => {

    xml.buildXML(db);

    return interaction.reply({
        content: "XML rebuilt successfully",
        ephemeral: true
    });
};

// =========================
// VIEW XML
// =========================
const fs = require("fs");

module.exports.viewxml = async (interaction) => {

    const events = fs.readFileSync("./custom/shopevents.xml", "utf8");

    return interaction.reply({
        content: "XML sent to logs (too large for Discord preview)",
        ephemeral: true
    });
};
