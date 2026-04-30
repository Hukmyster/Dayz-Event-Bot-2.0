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

// -----------------------------
// DATABASE FUNCTIONS
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
// SNAPSHOT BUILDER
// -----------------------------
function buildSnapshot() {
    const orders = loadOrders();

    const pending = orders.filter(o => o.status === "pending");

    const snapshot = {
        createdAt: new Date().toISOString(),
        totalOrders: pending.length,
        spawns: pending.map(o => ({
            item: o.item,
            position: {
                x: Number(o.x),
                z: Number(o.z)
            }
        }))
    };

    fs.mkdirSync("./custom", { recursive: true });
    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2));

    console.log("SNAPSHOT BUILT:", snapshot);
}

// -----------------------------
// SLASH COMMAND
// -----------------------------
const commands = [
    new SlashCommandBuilder()
        .setName("buy")
        .setDescription("Purchase an item in-game")
        .toJSON(),

    new SlashCommandBuilder()
        .setName("build")
        .setDescription("Build snapshot file from orders")
        .toJSON()
];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

async function registerCommands() {
    try {
        console.log("Registering slash commands...");

        await rest.put(
            Routes.applicationGuildCommands(
                process.env.CLIENT_ID,
                process.env.GUILD_ID
            ),
            { body: commands }
        );

        console.log("Slash commands registered.");
    } catch (err) {
        console.error("Command registration failed:", err);
    }
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

    // -------------------------
    // COMMANDS
    // -------------------------
    if (interaction.isChatInputCommand()) {

        // BUY
        if (interaction.commandName === "buy") {

            const modal = new ModalBuilder()
                .setCustomId("buyModal")
                .setTitle("DayZ Purchase System");

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

        // BUILD SNAPSHOT (MANUAL TRIGGER FOR TESTING)
        if (interaction.commandName === "build") {

            buildSnapshot();

            await interaction.reply({
                content: "🧠 Snapshot built successfully.",
                flags: InteractionResponseFlags.Ephemeral
            });
        }
    }

    // -------------------------
    // MODAL
    // -------------------------
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
                content: `✅ Order saved: **${item}**`,
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
