const { InteractionType, MessageFlags } = require("discord.js");

const db = require("../services/db");
const shop = require("./shop");
const orders = require("./orders");
const xml = require("./xml");

const fs = require("fs");

const EVENTS_PATH = "./custom/shopevents.xml";
const SPAWNS_PATH = "./custom/cfgeventspawns.xml";

module.exports = async (interaction) => {

    if (interaction.isAutocomplete()) {
        const f = interaction.options.getFocused().toLowerCase();

        return interaction.respond(
            db.getShop()
                .filter(i => i.displayName.toLowerCase().includes(f))
                .slice(0, 5)
                .map(i => ({ name: i.displayName, value: i.displayName }))
        );
    }

    if (!interaction.isChatInputCommand()) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (interaction.commandName === "shop") {
        return interaction.editReply(
            db.getShop().map(i => `• ${i.displayName}`).join("\n") || "Empty"
        );
    }

    if (interaction.commandName === "buy") {

        const item = shop.findItem(interaction.options.getString("item"));

        await orders.createOrder(
            item,
            interaction.options.getInteger("x"),
            interaction.options.getInteger("z")
        );

        return interaction.editReply("Order placed");
    }

    if (interaction.commandName === "orders") {
        return interaction.editReply(
            db.getOrders().map(o => `• ${o.displayName} [${o.status}]`).join("\n")
        );
    }

    if (interaction.commandName === "queue") {
        await orders.queueOrders();
        return interaction.editReply("Queued");
    }

    if (interaction.commandName === "build") {
        await xml.buildXML();
        return interaction.editReply("XML built");
    }

    if (interaction.commandName === "cycle") {
        await orders.cycleOrders();
        return interaction.editReply("Cycle complete");
    }

    if (interaction.commandName === "viewxml") {

        if (!fs.existsSync(EVENTS_PATH)) {
            return interaction.editReply("No XML yet");
        }

        const data = fs.readFileSync(EVENTS_PATH, "utf8");

        return interaction.editReply("```xml\n" + data.slice(0, 1900) + "\n```");
    }
};
