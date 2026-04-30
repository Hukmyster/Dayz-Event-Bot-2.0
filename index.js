const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    InteractionResponseFlags
} = require("discord.js");

const fs = require("fs");
require("dotenv").config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// -----------------------------
// PATHS
// -----------------------------
const DB_PATH = "./database/orders.json";
const SHOP_PATH = "./database/shop.json";
const EVENTS_PATH = "./custom/shopevents.xml";
const SPAWNS_PATH = "./custom/cfgeventspawns.xml";

// -----------------------------
// SAFETY
// -----------------------------
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

// -----------------------------
// INIT FILES
// -----------------------------
function ensureFiles() {
    if (!fs.existsSync("./database")) fs.mkdirSync("./database", { recursive: true });

    if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, "[]");
    if (!fs.existsSync(SHOP_PATH)) fs.writeFileSync(SHOP_PATH, "[]");
}

function loadJSON(path) {
    return JSON.parse(fs.readFileSync(path, "utf-8"));
}

function saveJSON(path, data) {
    fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

// -----------------------------
// SHOP SYSTEM
// -----------------------------
function getShop() {
    return loadJSON(SHOP_PATH);
}

function findShopMatch(query) {
    const shop = getShop();
    return shop
        .filter(i => i.displayName.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 5);
}

// -----------------------------
// ORDERS
// -----------------------------
function getOrders() {
    return loadJSON(DB_PATH);
}

function saveOrders(data) {
    saveJSON(DB_PATH, data);
}

// -----------------------------
// EVENT NAME
// -----------------------------
function makeEventName() {
    return `ShopEvent_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

// -----------------------------
// XML BUILD
// -----------------------------
function buildXML() {

    const orders = getOrders().filter(o => o.status === "pending");

    let events = [];
    let spawns = [];

    for (const o of orders) {

        const eventName = makeEventName();

        events.push(`
<event name="${eventName}">
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
</event>`);

        spawns.push(`
<event name="${eventName}">
    <pos x="${o.x}" z="${o.z}" a="0" />
</event>`);

        o.status = "built";
        o.eventName = eventName;
    }

    const eventsXML =
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<events>
${events.join("")}
</events>`;

    const spawnsXML =
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<eventposdef>
${spawns.join("")}
</eventposdef>`;

    fs.mkdirSync("./custom", { recursive: true });
    fs.writeFileSync(EVENTS_PATH, eventsXML);
    fs.writeFileSync(SPAWNS_PATH, spawnsXML);

    saveOrders(orders);

    console.log("XML GENERATED");
}

// -----------------------------
// COMMANDS
// -----------------------------
const commands = [

    // BUY
    new SlashCommandBuilder()
        .setName("buy")
        .setDescription("Buy an item")
        .addStringOption(opt =>
            opt.setName("item")
                .setDescription("Search shop items")
                .setAutocomplete(true)
                .setRequired(true)
        )
        .addIntegerOption(opt =>
            opt.setName("x")
                .setDescription("X coord")
                .setRequired(true)
        )
        .addIntegerOption(opt =>
            opt.setName("z")
                .setDescription("Z coord")
                .setRequired(true)
        )
        .toJSON(),

    // ADD ITEM (ADMIN SHOP BUILDER)
    new SlashCommandBuilder()
        .setName("additem")
        .setDescription("Add item to shop")
        .toJSON(),

    // BUILD
    new SlashCommandBuilder()
        .setName("build")
        .setDescription("Generate XML")
        .toJSON()
];

// -----------------------------
// REGISTER
// -----------------------------
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

async function register() {
    await rest.put(
        Routes.applicationGuildCommands(
            process.env.CLIENT_ID,
            process.env.GUILD_ID
        ),
        { body: commands }
    );
    console.log("Commands registered");
}

// -----------------------------
// READY
// -----------------------------
client.once("clientReady", () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// -----------------------------
// INTERACTIONS
// -----------------------------
client.on("interactionCreate", async (interaction) => {

    ensureFiles();

    // AUTOCOMPLETE (SHOP SEARCH)
    if (interaction.isAutocomplete()) {

        const focused = interaction.options.getFocused();
        const matches = findShopMatch(focused);

        return interaction.respond(
            matches.map(i => ({
                name: `${i.displayName} ($${i.price})`,
                value: i.id
            }))
        );
    }

    // COMMANDS
    if (interaction.isChatInputCommand()) {

        // BUY
        if (interaction.commandName === "buy") {

            const shop = getShop();
            const itemId = interaction.options.getString("item");
            const x = interaction.options.getInteger("x");
            const z = interaction.options.getInteger("z");

            const item = shop.find(i => i.id === itemId);

            if (!item) {
                return interaction.reply({
                    content: "Item not found.",
                    flags: 64
                });
            }

            const orders = getOrders();

            orders.push({
                id: Date.now(),
                user: interaction.user.id,
                itemType: item.type,
                displayName: item.displayName,
                x,
                z,
                status: "pending"
            });

            saveOrders(orders);

            return interaction.reply({
                content: `✅ Purchased ${item.displayName} at ${x},${z}`,
                flags: 64
            });
        }

        // ADD ITEM
        if (interaction.commandName === "additem") {

            const modal = new ModalBuilder()
                .setCustomId("addItemModal")
                .setTitle("Add Shop Item");

            const type = new TextInputBuilder()
                .setCustomId("type")
                .setLabel("types.xml ITEM NAME (case sensitive)")
                .setStyle(TextInputStyle.Short);

            const name = new TextInputBuilder()
                .setCustomId("name")
                .setLabel("Display Name (Discord)")
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

        // BUILD
        if (interaction.commandName === "build") {

            buildXML();

            return interaction.reply({
                content: "XML built.",
                flags: 64
            });
        }
    }

    // MODALS
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

            saveJSON(SHOP_PATH, shop);

            return interaction.reply({
                content: `Added ${name} to shop.`,
                flags: 64
            });
        }
    }
});

// -----------------------------
// START
// -----------------------------
register().then(() => client.login(process.env.DISCORD_TOKEN));
