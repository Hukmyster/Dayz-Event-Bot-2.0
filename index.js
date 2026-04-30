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

// -----------------------------
// CLIENT
// -----------------------------
const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// -----------------------------
// PATHS
// -----------------------------
const DB_PATH = "./database/orders.json";
const EVENTS_PATH = "./custom/shopevents.xml";
const SPAWNS_PATH = "./custom/cfgeventspawns.xml";

// -----------------------------
// SAFETY (RAILWAY STABILITY)
// -----------------------------
process.on("unhandledRejection", (err) => {
    console.error("Unhandled Rejection:", err);
});

process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception:", err);
});

// -----------------------------
// DATABASE
// -----------------------------
function loadOrders() {
    try {
        if (!fs.existsSync(DB_PATH)) {
            fs.mkdirSync("./database", { recursive: true });
            fs.writeFileSync(DB_PATH, "[]");
        }
        return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
    } catch (err) {
        console.error("DB LOAD ERROR:", err);
        return [];
    }
}

function saveOrders(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// -----------------------------
// EVENT NAME (OPTION A)
// -----------------------------
function makeEventName() {
    return `ShopEvent_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

// -----------------------------
// XML BUILDER
// -----------------------------
function buildXMLFiles() {

    const orders = loadOrders().filter(o => o.status === "pending");

    let eventsXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<events>\n`;
    let spawnsXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<eventposdef>\n`;

    for (const o of orders) {

        const eventName = makeEventName();

        // EVENTS.XML
        eventsXML += `
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
            <child lootmax="0" lootmin="0" max="1" min="1" type="${o.item}"/>
        </children>
    </event>\n`;

        // CFG EVENT SPAWNS
        spawnsXML += `
    <event name="${eventName}">
        <pos x="${o.x}" z="${o.z}" a="0" />
    </event>\n`;

        o.status = "built";
        o.eventName = eventName;
    }

    eventsXML += `</events>`;
    spawnsXML += `</eventposdef>`;

    fs.mkdirSync("./custom", { recursive: true });

    fs.writeFileSync(EVENTS_PATH, eventsXML);
    fs.writeFileSync(SPAWNS_PATH, spawnsXML);

    saveOrders(orders);

    console.log("XML FILES GENERATED");
}

// -----------------------------
// SLASH COMMANDS
// -----------------------------
const commands = [
    new SlashCommandBuilder()
        .setName("buy")
        .setDescription("Purchase an item")
        .toJSON(),

    new SlashCommandBuilder()
        .setName("build")
        .setDescription("Generate DayZ XML files")
        .toJSON()
];

// -----------------------------
// REGISTER COMMANDS
// -----------------------------
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

async function registerCommands() {
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

    // COMMANDS
    if (interaction.isChatInputCommand()) {

        if (interaction.commandName === "buy") {

            const modal = new ModalBuilder()
                .setCustomId("buyModal")
                .setTitle("Purchase Item");

            const item = new TextInputBuilder()
                .setCustomId("item")
                .setLabel("Item")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const x = new TextInputBuilder()
                .setCustomId("x")
                .setLabel("X Coordinate")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const z = new TextInputBuilder()
                .setCustomId("z")
                .setLabel("Z Coordinate")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(item),
                new ActionRowBuilder().addComponents(x),
                new ActionRowBuilder().addComponents(z)
            );

            await interaction.showModal(modal);
        }

        if (interaction.commandName === "build") {

            buildXMLFiles();

            await interaction.reply({
                content: "🧠 XML generated successfully.",
                flags: 64
            });
        }
    }

    // MODAL SUBMIT
    if (interaction.isModalSubmit()) {

        if (interaction.customId === "buyModal") {

            const item = interaction.fields.getTextInputValue("item");
            const x = interaction.fields.getTextInputValue("x");
            const z = interaction.fields.getTextInputValue("z");

            const orders = loadOrders();

            orders.push({
                id: Date.now(),
                user: interaction.user.id,
                item,
                x,
                z,
                status: "pending",
                createdAt: new Date().toISOString()
            });

            saveOrders(orders);

            await interaction.reply({
                content: `✅ Order saved: ${item}`,
                flags: 64
            });
        }
    }
});

// -----------------------------
// START BOT
// -----------------------------
registerCommands().then(() => {
    client.login(process.env.DISCORD_TOKEN);
});
