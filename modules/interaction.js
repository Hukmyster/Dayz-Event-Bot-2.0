const {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder
} = require("discord.js");

const fs = require("fs");
const path = require("path");

const db = require("../services/db");
const orders = require("./orders");
const xml = require("./xml");

// ---------------- SAFE FOLDER ----------------
function ensureCustomFolder() {
    const dir = path.join(__dirname, "../custom");
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

module.exports = async (interaction) => {

    try {

        // =====================================================
        // AUTOCOMPLETE (SHOP SEARCH)
        // =====================================================
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
                        name: i.displayName,
                        value: i.displayName
                    }))
            );
        }

        // =====================================================
        // ADD ITEM MODAL
        // =====================================================
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

        // =====================================================
        // ADD ITEM SUBMIT
        // =====================================================
        if (interaction.isModalSubmit() && interaction.customId === "additem_modal") {

            const shop = db.getShop();

            shop.push({
                id: Date.now().toString(),
                displayName: interaction.fields.getTextInputValue("name"),
                type: interaction.fields.getTextInputValue("type"),
                price: parseInt(interaction.fields.getTextInputValue("price"))
            });

            await db.saveShop(shop);

            return interaction.reply({
                content: "Item added",
                ephemeral: true
            });
        }

        // =====================================================
        // DELETE SHOP ITEM
        // =====================================================
        if (interaction.isChatInputCommand() && interaction.commandName === "deleteshopitem") {

            const name = interaction.options.getString("item");

            let shop = db.getShop();

            const before = shop.length;

            shop = shop.filter(i =>
                i.displayName.toLowerCase() !== name.toLowerCase()
            );

            await db.saveShop(shop);

            return interaction.reply({
                content: `Removed ${before - shop.length} item(s)`,
                ephemeral: true
            });
        }

        // =====================================================
        // SHOP CYCLE (FORCE ALL BUILT)
        // =====================================================
        if (interaction.isChatInputCommand() && interaction.commandName === "shopcycle") {

            let ordersList = db.getOrders();

            for (const o of ordersList) {
                o.status = "built";
            }

            await db.saveOrders(ordersList);

            await xml.buildXML();

            return interaction.reply({
                content: "All orders forced to BUILT + XML regenerated",
                ephemeral: true
            });
        }

        // =====================================================
        // VIEW XML
        // =====================================================
        if (interaction.isChatInputCommand() && interaction.commandName === "viewxml") {

            await interaction.deferReply({ ephemeral: true });

            const dir = ensureCustomFolder();

            const eventPath = path.join(dir, "shopevents.xml");
            const spawnPath = path.join(dir, "cfgeventspawns.xml");

            const eventXML = fs.existsSync(eventPath)
                ? fs.readFileSync(eventPath, "utf8")
                : "Missing";

            const spawnXML = fs.existsSync(spawnPath)
                ? fs.readFileSync(spawnPath, "utf8")
                : "Missing";

            return interaction.editReply(
                "EVENT XML:\n```xml\n" +
                eventXML.slice(0, 1800) +
                "\n```\nSPAWN XML:\n```xml\n" +
                spawnXML.slice(0, 1800) +
                "\n```"
            );
        }

        // =====================================================
        // DELETE ORDER HISTORY (FIXED SAFE VERSION)
        // =====================================================
        if (interaction.isChatInputCommand() && interaction.commandName === "deleteshophistory") {

            await interaction.deferReply({ ephemeral: true });

            const dir = ensureCustomFolder();

            // clear orders
            const ordersList = db.getOrders();
            ordersList.length = 0;
            await db.saveOrders(ordersList);

            // safe empty XML
            const emptyEvents =
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<events></events>`;

            const emptySpawn =
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<eventposdef></eventposdef>`;

            fs.writeFileSync(path.join(dir, "shopevents.xml"), emptyEvents);
            fs.writeFileSync(path.join(dir, "cfgeventspawns.xml"), emptySpawn);

            return interaction.editReply("Orders + XML cleared safely");
        }

        // =====================================================
        // NORMAL COMMANDS
        // =====================================================
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
                i.displayName.toLowerCase() === name.toLowerCase()
            );

            if (!item) return interaction.editReply("Item not found");

            await orders.createOrder({
                ...item,
                quantity: qty,
                totalPrice: item.price * qty
            }, x, z);

            return interaction.editReply(
                `Ordered ${qty}x ${item.displayName}`
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
