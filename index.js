const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder
} = require("discord.js");

const fs = require("fs");
require("dotenv").config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// ---------------- PATHS ----------------
const DB_PATH = "./database/orders.json";
const SHOP_PATH = "./database/shop.json";
const EVENTS_PATH = "./custom/shopevents.xml";
const SPAWNS_PATH = "./custom/cfgeventspawns.xml";

// ---------------- SAFETY ----------------
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

// ---------------- INIT ----------------
function ensureFiles() {
    if (!fs.existsSync("./database")) fs.mkdirSync("./database");
    if (!fs.existsSync("./custom")) fs.mkdirSync("./custom");

    if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, "[]");
    if (!fs.existsSync(SHOP_PATH)) fs.writeFileSync(SHOP_PATH, "[]");
}

function load(path) {
    return JSON.parse(fs.readFileSync(path, "utf-8"));
}

function save(path, data) {
    fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

// ---------------- DATA ----------------
function getShop() {
    return load(SHOP_PATH);
}

function getOrders() {
    return load(DB_PATH);
}

// ---------------- EVENT NAME ----------------
function makeEventName() {
    return `ShopEvent_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

// ---------------- XML BUILD ----------------
function buildXML() {
    const orders = getOrders().filter(o => o.status === "pending");

    let events = [];
    let spawns = [];

    for (const o of orders) {

        const eventName = makeEventName();

        events.push(
`<event name="${eventName}">
    <nominal>1</nominal>
    <min>1</min>
    <max>1</max>
    <lifetime>11000</lifetime>
    <restock>0</restock>
    <saferadius>0</saferadius>
    <distanceradius>0</distanceradius>
    <cleanupradius>0</cleanupradius>
    <flags deletable="0" init_random="0" remove_damaged="1"/>
    <position>fixed</position>
    <limit>child</limit>
    <active>1</active>
    <children>
        <child lootmax="0" lootmin="0" max="1" min="1" type="${o.itemType}"/>
    </children>
</event>`
        );

        spawns.push(
`<event name="${eventName}">
    <pos x="${o.x}" z="${o.z}" a="0" />
</event>`
        );

        o.status = "built";
    }

    const eventsXML =
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<events>${events.join("")}
</events>`;

    const spawnsXML =
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<eventposdef>${spawns.join("")}
</eventposdef>`;

    fs.writeFileSync(EVENTS_PATH, eventsXML);
    fs.writeFileSync(SPAWNS_PATH, spawnsXML);

    save(DB_PATH, getOrders());

    console.log("XML BUILT");
}

// ---------------- COMMANDS ----------------
const commands = [

    new SlashCommandBuilder()
        .setName("buy")
        .setDescription("Purchase an item from the shop")
        .addStringOption(opt =>
            opt.setName("item")
                .setDescription("Select item to buy")
                .setAutocomplete(true)
                .setRequired(true)
        )
        .addIntegerOption(opt =>
            opt.setName("x")
                .setDescription("Spawn X coordinate")
                .setRequired(true)
        )
        .addIntegerOption(opt =>
            opt.setName("z")
                .setDescription("Spawn Z coordinate")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("additem")
        .setDescription("Add a new item to the shop"),

    new SlashCommandBuilder()
        .setName("removeitem")
        .setDescription("Remove an item from the shop")
        .addStringOption(opt =>
            opt.setName("item")
                .setDescription("Select item to remove")
                .setAutocomplete(true)
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("shop")
        .setDescription("View all shop items"),

    new SlashCommandBuilder()
        .setName("orders")
        .setDescription("View pending orders"),

    new SlashCommandBuilder()
        .setName("build")
        .setDescription("Build XML files from pending orders"),

    new SlashCommandBuilder()
        .setName("viewxml")
        .setDescription("View generated XML"),

    new SlashCommandBuilder()
        .setName("dumpshop")
        .setDescription("Debug: view raw shop data"),

    new SlashCommandBuilder()
        .setName("dumporders")
        .setDescription("Debug: view raw orders data"),

    new SlashCommandBuilder()
        .setName("listcommands")
        .setDescription("List all available commands")
];

// ---------------- REGISTER ----------------
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

async function register() {
    await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands }
    );
}

// ---------------- READY ----------------
client.once("clientReady", () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// ---------------- INTERACTIONS ----------------
client.on("interactionCreate", async (interaction) => {

    ensureFiles();

    // AUTOCOMPLETE
    if (interaction.isAutocomplete()) {
        const focused = interaction.options.getFocused();
        const shop = getShop();

        const filtered = shop
            .filter(i => i.displayName.toLowerCase().includes(focused.toLowerCase()))
            .slice(0, 5);

        return interaction.respond(
            filtered.map(i => ({
                name: `${i.displayName} ($${i.price})`,
                value: i.id
            }))
        );
    }

    // COMMANDS
    if (interaction.isChatInputCommand()) {

        if (interaction.commandName === "buy") {
            const shop = getShop();
            const itemId = interaction.options.getString("item");
            const x = interaction.options.getInteger("x");
            const z = interaction.options.getInteger("z");

            const item = shop.find(i => i.id === itemId);
            if (!item) return interaction.reply({ content: "Item not found", flags: 64 });

            const orders = getOrders();

            orders.push({
                id: Date.now(),
                itemType: item.type,
                displayName: item.displayName,
                x,
                z,
                status: "pending"
            });

            save(DB_PATH, orders);

            console.log("ORDER SAVED:", orders[orders.length - 1]);

            return interaction.reply({
                content: `✅ ${item.displayName} @ ${x},${z}`,
                flags: 64
            });
        }

        if (interaction.commandName === "removeitem") {
            const id = interaction.options.getString("item");
            let shop = getShop();

            shop = shop.filter(i => i.id !== id);
            save(SHOP_PATH, shop);

            return interaction.reply({ content: "Item removed", flags: 64 });
        }

        if (interaction.commandName === "shop") {
            const shop = getShop();

            if (!shop.length) return interaction.reply({ content: "Shop is empty", flags: 64 });

            const text = shop.map(i => `• ${i.displayName} ($${i.price})`).join("\n");

            return interaction.reply({ content: text, flags: 64 });
        }

        if (interaction.commandName === "orders") {
            const orders = getOrders().filter(o => o.status === "pending");

            if (!orders.length) return interaction.reply({ content: "No pending orders", flags: 64 });

            const text = orders.map(o => `• ${o.displayName} @ ${o.x},${o.z}`).join("\n");

            return interaction.reply({ content: text, flags: 64 });
        }

        if (interaction.commandName === "build") {
            buildXML();
            return interaction.reply({ content: "XML built", flags: 64 });
        }

        if (interaction.commandName === "viewxml") {
            try {
                const xml = fs.readFileSync(EVENTS_PATH, "utf-8");
                return interaction.reply({
                    content: "```xml\n" + xml.slice(0, 1800) + "\n```",
                    flags: 64
                });
            } catch {
                return interaction.reply({ content: "No XML yet", flags: 64 });
            }
        }

        if (interaction.commandName === "dumpshop") {
            return interaction.reply({
                content: "```json\n" + JSON.stringify(getShop(), null, 2).slice(0, 1800),
                flags: 64
            });
        }

        if (interaction.commandName === "dumporders") {
            return interaction.reply({
                content: "```json\n" + JSON.stringify(getOrders(), null, 2).slice(0, 1800),
                flags: 64
            });
        }

        if (interaction.commandName === "listcommands") {
            return interaction.reply({
                content:
`/buy - purchase item
/additem - add shop item
/removeitem - remove item
/shop - view shop
/orders - view orders
/build - build XML
/viewxml - view XML
/dumpshop - debug shop
/dumporders - debug orders
/listcommands - this list`,
                flags: 64
            });
        }

        if (interaction.commandName === "additem") {

            const modal = new ModalBuilder()
                .setCustomId("addItemModal")
                .setTitle("Add Item");

            const type = new TextInputBuilder()
                .setCustomId("type")
                .setLabel("types.xml name")
                .setStyle(TextInputStyle.Short);

            const name = new TextInputBuilder()
                .setCustomId("name")
                .setLabel("Display name")
                .setStyle(TextInputStyle.Short);

            const price = new TextInputBuilder()
                .setCustomId("price")
                .setLabel("Price")
                .setStyle(TextInputStyle.Short);

            modal.addComponents(
                new ActionRowBuilder().addComponents(type),
                new ActionRowBuilder().addComponents(name),
                new ActionRowBuilder().addComponents(price)
            );

            return interaction.showModal(modal);
        }
    }

    // MODAL
    if (interaction.isModalSubmit()) {

        if (interaction.customId === "addItemModal") {

            const type = interaction.fields.getTextInputValue("type");
            const name = interaction.fields.getTextInputValue("name");
            const price = interaction.fields.getTextInputValue("price");

            const shop = getShop();

            shop.push({
                id: Date.now().toString(),
                type,
                displayName: name,
                price: Number(price)
            });

            save(SHOP_PATH, shop);

            return interaction.reply({
                content: `Added ${name}`,
                flags: 64
            });
        }
    }
});

// ---------------- START ----------------
register().then(() => client.login(process.env.DISCORD_TOKEN));
