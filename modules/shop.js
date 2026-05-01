const db = require("../services/db");
const xml = require("./xml");

const {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder
} = require("discord.js");

// =========================
// COMMANDS
// =========================
module.exports.commands = [
    { name: "shop", description: "View shop" },

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
        description: "Remove item",
        options: [
            { name: "item", description: "Item", type: 3, required: true, autocomplete: true }
        ]
    },

    { name: "deleteshophistory", description: "Clear orders" },
    { name: "build", description: "Build XML" },
    { name: "viewxml", description: "View XML" }
];

// =========================
// SHOP VIEW
// =========================
module.exports.shop = async (interaction) => {
    const shop = db.getShop();

    return interaction.reply({
        content: shop.length
            ? shop.map(i => `• ${i.displayName} ($${i.price})`).join("\n")
            : "Empty shop",
        ephemeral: true
    });
};

// =========================
// BUY
// =========================
module.exports.buy = async (interaction) => {

    const shop = db.getShop();

    const name = interaction.options.getString("item");
    const x = interaction.options.getInteger("x");
    const z = interaction.options.getInteger("z");
    const qty = interaction.options.getInteger("quantity") || 1;

    const item = shop.find(i => i.displayName === name);

    if (!item) {
        return interaction.reply({ content: "Not found", ephemeral: true });
    }

    const orders = db.getOrders();

    orders.push({
        displayName: item.displayName,
        type: item.type,
        x,
        z,
        quantity: qty,
        status: "queued"
    });

    db.saveOrders(orders);

    return interaction.reply({
        content: `Bought ${qty}x ${item.displayName}`,
        ephemeral: true
    });
};

// =========================
// ADD ITEM MODAL
// =========================
module.exports.additem = async (interaction) => {

    const modal = new ModalBuilder()
        .setCustomId("additem_modal")
        .setTitle("Add Item");

    const name = new TextInputBuilder()
        .setCustomId("name")
        .setLabel("Display Name")
        .setStyle(TextInputStyle.Short);

    const type = new TextInputBuilder()
        .setCustomId("type")
        .setLabel("DayZ Type")
        .setStyle(TextInputStyle.Short);

    const price = new TextInputBuilder()
        .setCustomId("price")
        .setLabel("Price")
        .setStyle(TextInputStyle.Short);

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

    const db = require("../services/db");

    const shop = db.getShop();

    shop.push({
        displayName: interaction.fields.getTextInputValue("name"),
        type: interaction.fields.getTextInputValue("type"),
        price: parseInt(interaction.fields.getTextInputValue("price"))
    });

    db.saveShop(shop);

    return interaction.reply({
        content: "Item added",
        ephemeral: true
    });
};

// =========================
// DELETE ITEM
// =========================
module.exports.deleteshopitem = async (interaction) => {

    const db = require("../services/db");

    let shop = db.getShop();

    const name = interaction.options.getString("item");

    shop = shop.filter(i => i.displayName !== name);

    db.saveShop(shop);

    return interaction.reply({
        content: "Item removed",
        ephemeral: true
    });
};

// =========================
// CLEAR HISTORY
// =========================
module.exports.deleteshophistory = async (interaction) => {

    const db = require("../services/db");

    db.saveOrders([]);

    return interaction.reply({
        content: "Orders cleared",
        ephemeral: true
    });
};

// =========================
// BUILD XML
// =========================
module.exports.build = async (interaction) => {

    const db = require("../services/db");
    const xml = require("./xml");

    xml.buildXML(db);

    return interaction.reply({
        content: "XML built",
        ephemeral: true
    });
};

// =========================
// VIEW XML
// =========================
const fs = require("fs");

module.exports.viewxml = async (interaction) => {

    const events = fs.readFileSync("./custom/shopevents.xml", "utf8");
    const spawns = fs.readFileSync("./custom/cfgeventspawns.xml", "utf8");

    return interaction.reply({
        content: "XML sent to console",
        ephemeral: true
    });
};
