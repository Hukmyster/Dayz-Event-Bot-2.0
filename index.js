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
const SNAPSHOT_PATH = "./custom/snapshot.json";
const XML_PATH = "./custom/generated_events.xml";

// -----------------------------
// LOAD / SAVE ORDERS
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
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("DB SAVE ERROR:", err);
    }
}

// -----------------------------
// SNAPSHOT (INTERMEDIATE)
// -----------------------------
function buildSnapshot() {
    const orders = loadOrders().filter(o => o.status === "pending");

    const snapshot = {
        createdAt: new Date().toISOString(),
        spawns: orders
    };

    fs.mkdirSync("./custom", { recursive: true });
    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2));

    return snapshot;
}

// -----------------------------
// XML BUILDER (DAYZ EVENT FORMAT)
// -----------------------------
function buildXML() {

    const orders = loadOrders().filter(o => o.status === "pending");

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<events>\n`;
    xml += `  <event name="DISCORD_SPAWNS">\n`;
    xml += `    <nominal>${orders.length}</nominal>\n`;
    xml += `    <lifetime>3600</lifetime>\n`;
    xml += `    <restock>0</restock>\n`;
    xml += `    <saferadius>100</saferadius>\n`;
    xml += `    <distanceradius>50</distanceradius>\n`;
    xml += `    <cleanupradius>100</cleanupradius>\n`;
    xml += `    <flags deletable="1" init_random="0" remove_damaged="1"/>\n`;
    xml += `    <position>fixed</position>\n`;
    xml += `    <limit>child</limit>\n`;

    for (const o of orders) {
        xml += `    <child type="${o.item}" />\n`;
    }

    xml += `  </event>\n`;
    xml += `</events>\n`;

    fs.mkdirSync("./custom", { recursive: true });
    fs.writeFileSync(XML_PATH, xml);

    console.log("XML GENERATED");
}

// -----------------------------
// SLASH COMMANDS
// -----------------------------
const commands = [
    new SlashCommandBuilder()
        .setName("buy")
        .setDescription("Purchase item")
        .toJSON(),

    new SlashCommandBuilder()
        .setName("build")
        .setDescription("Build snapshot + XML files")
        .toJSON()
];

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

    if (interaction.isChatInputCommand()) {

        // BUY
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
                .setLabel("X")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const z = new TextInputBuilder()
                .setCustomId("z")
                .setLabel("Z")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(item),
                new ActionRowBuilder().addComponents(x),
                new ActionRowBuilder().addComponents(z)
            );

            await interaction.showModal(modal);
        }

        // BUILD EVERYTHING
        if (interaction.commandName === "build") {

            buildSnapshot();
            buildXML();

            await interaction.reply({
                content: "🧠 Snapshot + XML generated.",
                flags: InteractionResponseFlags.Ephemeral
            });
        }
    }

    // MODAL
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
                flags: InteractionResponseFlags.Ephemeral
            });
        }
    }
});

// -----------------------------
// START
// -----------------------------
registerCommands().then(() => {
    client.login(process.env.DISCORD_TOKEN);
});
