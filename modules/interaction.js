const { MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js");

const db = require("../services/db");
const orders = require("./orders");
const xml = require("./xml");
const fs = require("fs");

module.exports = async (interaction) => {

    try {

        // ---------------- MODAL OPEN (ADD ITEM) ----------------
        if (interaction.isChatInputCommand() && interaction.commandName === "additem") {

            const modal = new ModalBuilder()
                .setCustomId("additem_modal")
                .setTitle("Add Shop Item");

            const nameInput = new TextInputBuilder()
                .setCustomId("name")
                .setLabel("Item Name")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const priceInput = new TextInputBuilder()
                .setCustomId("price")
                .setLabel("Price")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(nameInput),
                new ActionRowBuilder().addComponents(priceInput)
            );

            return interaction.showModal(modal);
        }

        // ---------------- MODAL SUBMIT ----------------
        if (interaction.isModalSubmit() && interaction.customId === "additem_modal") {

            const name = interaction.fields.getTextInputValue("name");
            const price = parseInt(interaction.fields.getTextInputValue("price"));

            const shop = db.getShop();

            shop.push({
                id: Date.now().toString(),
                displayName: name,
                price
            });

            await db.saveShop(shop);

            return interaction.reply({
                content: `Added item: ${name}`,
                ephemeral: true
            });
        }

        // ---------------- VIEW XML ----------------
        if (interaction.isChatInputCommand() && interaction.commandName === "viewxml") {

            await interaction.deferReply({ ephemeral: true });

            const eventFile = "./custom/shopevents.xml";
            const spawnFile = "./custom/cfgeventspawns.xml";

            const eventXML = fs.existsSync(eventFile)
                ? fs.readFileSync(eventFile, "utf8")
                : "Missing";

            const spawnXML = fs.existsSync(spawnFile)
                ? fs.readFileSync(spawnFile, "utf8")
                : "Missing";

            return interaction.editReply(
                "EVENT XML:\n```xml\n" + eventXML.slice(0, 1800) +
                "\n```\nSPAWN XML:\n```xml\n" + spawnXML.slice(0, 1800) + "\n```"
            );
        }

        // ---------------- DELETE SHOP HISTORY ----------------
        if (interaction.isChatInputCommand() && interaction.commandName === "deleteshophistory") {

            await db.clearAll();

            fs.writeFileSync("./custom/shopevents.xml", "");
            fs.writeFileSync("./custom/cfgeventspawns.xml", "");

            return interaction.reply({
                content: "Shop + orders + XML cleared",
                ephemeral: true
            });
        }

        // ---------------- NORMAL COMMANDS ----------------
        if (!interaction.isChatInputCommand()) return;

        await interaction.deferReply({ ephemeral: true });

        const cmd = interaction.commandName;

        // SHOP
        if (cmd === "shop") {
            return interaction.editReply(
                db.getShop().map(i => `• ${i.displayName} ($${i.price})`).join("\n") || "Empty"
            );
        }

        // BUY
        if (cmd === "buy") {

            const name = interaction.options.getString("item");
            const x = interaction.options.getInteger("x");
            const z = interaction.options.getInteger("z");

            const item = db.getShop().find(i =>
                i.displayName.toLowerCase() === name.toLowerCase()
            );

            if (!item) return interaction.editReply("Item not found");

            await orders.createOrder(item, x, z);

            return interaction.editReply(`Order placed: ${item.displayName}`);
        }

        // ORDERS
        if (cmd === "orders") {
            return interaction.editReply(
                db.getOrders().map(o =>
                    `• ${o.displayName} [${o.status}]`
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
