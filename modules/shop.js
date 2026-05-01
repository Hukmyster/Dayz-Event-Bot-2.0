const db = require("../services/db");

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
    { name: "queue", description: "View queued orders" },

    {
        name: "deleteshopitem",
        description: "Delete item",
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
];

// =========================
// SHOP VIEW
// =========================
module.exports.shop = async (interaction) => {

    const shop = db.getShop();

    if (!shop.length) {
        return interaction.reply({
            content: "Shop is empty",
            ephemeral: true
        });
    }

    return interaction.reply({
        content: shop.map(i => `• ${i.displayName} ($${i.price})`).join("\n"),
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
// ADD ITEM (MODAL)
// =========================
module.exports.additem = async (interaction) => {

    const modal = new ModalBuilder()
        .setCustomId("additem_modal")
        .setTitle("Add Item");

    const name = new TextInputBuilder()
        .setCustomId("name")
        .setLabel("Display Name")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    const type = new TextInputBuilder()
        .setCustomId("type")
        .setLabel("DayZ Type")
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
        content: "Item added",
        ephemeral: true
    });
};

// =========================
// AUTOCOMPLETE FIX
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

// =========================
// QUEUE FIX (YOUR BROKEN COMMAND)
// =========================
module.exports.queue = async (interaction) => {

    const orders = db.getOrders();

    if (!orders.length) {
        return interaction.reply({
            content: "No queued orders",
            ephemeral: true
        });
    }

    return interaction.reply({
        content: orders.map(o =>
            `• ${o.displayName} x${o.quantity} @ (${o.x},${o.z})`
        ).join("\n"),
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
        content: "Item deleted",
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
