const { MessageFlags } = require("discord.js");

const db = require("../services/db");
const shop = require("./shop");
const orders = require("./orders");
const xml = require("./xml");

module.exports = async (interaction) => {

    try {

        if (interaction.isAutocomplete()) {

            const focused = interaction.options.getFocused().toLowerCase();

            return interaction.respond(
                db.getShop()
                    .filter(i => i.displayName.toLowerCase().includes(focused))
                    .slice(0, 5)
                    .map(i => ({
                        name: i.displayName,
                        value: i.displayName
                    }))
            );
        }

        if (!interaction.isChatInputCommand()) return;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const cmd = interaction.commandName;

        // SHOP
        if (cmd === "shop") {
            return interaction.editReply(
                db.getShop().map(i => `• ${i.displayName}`).join("\n") || "Empty"
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

        // CLEAR SHOP
        if (cmd === "cleanshop") {

            await db.clearAll();

            const fs = require("fs");
            fs.writeFileSync("./custom/shopevents.xml", "");
            fs.writeFileSync("./custom/cfgeventspawns.xml", "");

            return interaction.editReply("All shop + orders cleared");
        }

    } catch (err) {

        console.error("[INTERACTION ERROR]", err);

        return interaction.editReply(`Error: ${err.message}`);
    }
};
