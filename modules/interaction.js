const {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder
} = require("discord.js");

const db = require("../services/db");
const orders = require("./orders");
const xml = require("./xml");
const fs = require("fs");

module.exports = async (interaction) => {

    try {

        // ================= AUTOCOMPLETE =================
        if (interaction.isAutocomplete()) {

            const focused = interaction.options.getFocused();
            const shop = db.getShop();

            return interaction.respond(
                shop
                    .filter(i =>
                        i.displayName.toLowerCase().includes(focused.toLowerCase())
                    )
                    .slice(0, 5)
                    .map(i => ({
                        name: `${i.displayName} ($${i.price})`,
                        value: i.displayName
                    }))
            );
        }

        // ================= ADD ITEM MODAL =================
        if (interaction.isChatInputCommand() && interaction.commandName === "additem") {

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
                .setLabel("XML Type (M4A1 etc)")
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
        }

        // ================= ADD ITEM SUBMIT =================
        if (interaction.isModalSubmit() && interaction.customId === "additem_modal") {

            const name = interaction.fields.getTextInputValue("name");
            const type = interaction.fields.getTextInputValue("type");
            const price = parseInt(interaction.fields.getTextInputValue("price"));

            const shop = db.getShop();

            shop.push({
                id: Date.now().toString(),
                displayName: name,
                type: type,
                price: price
            });

            await db.saveShop(shop);

            return interaction.reply({
                content: `Added ${name}`,
                ephemeral: true
            });
        }

        // ================= VIEW XML =================
        if (interaction.isChatInputCommand() && interaction.commandName === "viewxml") {

            await interaction.deferReply({ ephemeral: true });

            const eventXML = fs.existsSync("./custom/shopevents.xml")
                ? fs.readFileSync("./custom/shopevents.xml", "utf8")
                : "Missing";

            const spawnXML = fs.existsSync("./custom/cfgeventspawns.xml")
                ? fs.readFileSync("./custom/cfgeventspawns.xml", "utf8")
                : "Missing";

            return interaction.editReply(
                "EVENT XML:\n```xml\n" +
                eventXML.slice(0, 1800) +
                "\n```\nSPAWN XML:\n```xml\n" +
                spawnXML.slice(0, 1800) +
                "\n```"
            );
        }

        // ================= DELETE ORDER HISTORY ONLY =================
        if (interaction.isChatInputCommand() && interaction.commandName === "deleteshophistory") {

            const ordersList = db.getOrders();
            ordersList.length = 0;
            await db.saveOrders(ordersList);

            fs.writeFileSync("./custom/shopevents.xml", "");
            fs.writeFileSync("./custom/cfgeventspawns.xml", "");

            return interaction.reply({
                content: "Orders cleared ONLY",
                ephemeral: true
            });
        }

        // ================= NORMAL COMMANDS =================
        if (!interaction.isChatInputCommand()) return;

        await interaction.deferReply({ ephemeral: true });

        const cmd = interaction.commandName;

        // SHOP
        if (cmd === "shop") {
            return interaction.editReply(
                db.getShop().map(i =>
                    `• ${i.displayName} ($${i.price})`
                ).join("\n") || "Empty"
            );
        }

        // BUY
        if (cmd === "buy") {

            const name = interaction.options.getString("item");
            const x = interaction.options.getInteger("x");
            const z = interaction.options.getInteger("z");
            const qty = interaction.options.getInteger("quantity") || 1;

            const item = db.getShop().find(i =>
                i.displayName.toLowerCase().includes(name.toLowerCase())
            );

            if (!item) return interaction.editReply("Item not found");

            const totalPrice = item.price * qty;

            await orders.createOrder({
                ...item,
                quantity: qty,
                totalPrice
            }, x, z);

            return interaction.editReply(
                `Order: ${item.displayName} x${qty} ($${totalPrice})`
            );
        }

        // ORDERS
        if (cmd === "orders") {
            return interaction.editReply(
                db.getOrders().map(o =>
                    `• ${o.displayName} x${o.quantity || 1} [${o.status}]`
                ).join("\n") || "No orders"
            );
        }

        // QUEUE
        if (cmd === "queue") {
            await orders.queueOrders();
            return interaction.editReply("Queued");
        }

        // BUILD
        if (cmd === "build") {
            await xml.buildXML();
            return interaction.editReply("XML built");
        }

    } catch (err) {
        console.error("[INTERACTION ERROR]", err);

        if (interaction.deferred || interaction.replied) {
            return interaction.editReply(`Error: ${err.message}`);
        }

        return interaction.reply({
            content: `Error: ${err.message}`,
            ephemeral: true
        });
    }
};
