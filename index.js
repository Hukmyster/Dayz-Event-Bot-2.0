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
} = require("discord.js");

const fs = require("fs");
require("dotenv").config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// -----------------------------
// DATABASE SETUP
// -----------------------------
const DB_PATH = "./database/orders.json";

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
// SLASH COMMAND SETUP
// -----------------------------
const commands = [
    new SlashCommandBuilder()
        .setName("buy")
        .setDescription("Purchase an item in-game")
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
// READY EVENT
// -----------------------------
client.once("clientReady", () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// -----------------------------
// INTERACTIONS
// -----------------------------
client.on("interactionCreate", async (interaction) => {

    // -------------------------
    // /BUY COMMAND
    // -------------------------
    if (interaction.isChatInputCommand()) {

        if (interaction.commandName === "buy") {

            const modal = new ModalBuilder()
                .setCustomId("buyModal")
                .setTitle("DayZ Purchase System");

            const item = new TextInputBuilder()
                .setCustomId("item")
                .setLabel("Item (M4, AK, Glock, etc)")
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
    }

    // -------------------------
    // MODAL SUBMIT (SAVE ORDER)
    // -------------------------
    if (interaction.isModalSubmit()) {

        if (interaction.customId === "buyModal") {

            const item = interaction.fields.getTextInputValue("item");
            const x = interaction.fields.getTextInputValue("x");
            const z = interaction.fields.getTextInputValue("z");

            const orders = loadOrders();

            const order = {
                id: Date.now(),
                user: interaction.user.id,
                item,
                x,
                z,
                status: "pending",
                createdAt: new Date().toISOString()
            };

            orders.push(order);
            saveOrders(orders);

            console.log("ORDER SAVED:", order);

            await interaction.reply({
                content: `✅ Order saved: **${item}** at (${x}, ${z})`,
                ephemeral: true
            });
        }
    }
});

// -----------------------------
// START BOT + REGISTER COMMANDS
// -----------------------------
registerCommands().then(() => {
    client.login(process.env.DISCORD_TOKEN);
});
