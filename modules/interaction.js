const { MessageFlags } = require("discord.js");

const db = require("../services/db");
const shop = require("./shop");
const orders = require("./orders");
const xml = require("./xml");

module.exports = async (interaction) => {

    try {

        // ---------------- AUTOCOMPLETE ----------------
        if (interaction.isAutocomplete()) {

            const focused = interaction.options.getFocused().toLowerCase();

            const items = db.getShop()
                .filter(i =>
                    i.displayName.toLowerCase().includes(focused)
                )
                .slice(0, 5)
                .map(i => ({
                    name: i.displayName,
                    value: i.displayName
                }));

            return interaction.respond(items);
        }

        // ---------------- COMMANDS ONLY ----------------
        if (!interaction.isChatInputCommand()) return;

        // Always defer first (prevents timeout + double reply issues)
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const cmd = interaction.commandName;

        // ---------------- SHOP ----------------
        if (cmd === "shop") {
            const shopItems = db.getShop();

            return interaction.editReply(
                shopItems.length
                    ? shopItems.map(i => `• ${i.displayName} ($${i.price})`).join("\n")
                    : "Shop is empty"
            );
        }

        // ---------------- BUY ----------------
        if (cmd === "buy") {

            const itemName = interaction.options.getString("item");
            const x = interaction.options.getInteger("x");
            const z = interaction.options.getInteger("z");

            const item = shop.findItem(itemName);

            if (!item) {
                return interaction.editReply("Item not found in shop.");
            }

            await orders.createOrder(item, x, z);

            return interaction.editReply(
                `Order placed: ${item.displayName} @ ${x}, ${z}`
            );
        }

        // ---------------- ORDERS ----------------
        if (cmd === "orders") {

            const list = db.getOrders();

            return interaction.editReply(
                list.length
                    ? list.map(o => `• ${o.displayName} [${o.status}]`).join("\n")
                    : "No orders"
            );
        }

        // ---------------- QUEUE ----------------
        if (cmd === "queue") {
            await orders.queueOrders();
            return interaction.editReply("Queued orders");
        }

        // ---------------- BUILD XML ----------------
        if (cmd === "build") {
            await xml.buildXML();
            return interaction.editReply("XML built");
        }

        // ---------------- CYCLE ----------------
        if (cmd === "cycle") {
            await orders.cycleOrders();
            return interaction.editReply("Cycle complete");
        }

        // ---------------- VIEW XML ----------------
        if (cmd === "viewxml") {

            const fs = require("fs");

            const path = "./custom/shopevents.xml";

            if (!fs.existsSync(path)) {
                return interaction.editReply("No XML found yet.");
            }

            const data = fs.readFileSync(path, "utf8");

            return interaction.editReply("```xml\n" + data.slice(0, 1900) + "\n```");
        }

    } catch (err) {
        console.error("[INTERACTION ERROR]", err);

        if (interaction.deferred || interaction.replied) {
            return interaction.editReply("Error executing command.");
        }

        return interaction.reply({
            content: "Error executing command.",
            flags: MessageFlags.Ephemeral
        });
    }
};
