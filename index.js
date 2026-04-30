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

require("dotenv").config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// -----------------------------
// SIMPLE IN-MEMORY ORDER QUEUE
// -----------------------------
const orderQueue = [];

// -----------------------------
// SLASH COMMAND SETUP
// -----------------------------
const commands = [
    new SlashCommandBuilder()
        .setName("buy")
        .setDescription("Purchase an item in-game")
        .toJSON()
];

// Register commands (guild = instant updates)
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
// BOT READY
// -----------------------------
client.once("clientReady", () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// -----------------------------
// INTERACTION HANDLER
// -----------------------------
client.on("interactionCreate", async (interaction) => {

    // -------------------------
    // /BUY COMMAND
    // -------------------------
    if (interaction.isChatInputCommand()) {

        if (interaction.commandName === "buy") {

            const modal = new ModalBuilder()
                .setCustomId("buyModal")
                .setTitle("DayZ Purchase Form");

            const item = new TextInputBuilder()
                .setCustomId("item")
                .setLabel("Item (e.g. M4, AK, Glock)")
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
    // MODAL SUBMIT (ORDER CREATION)
    // -------------------------
    if (interaction.isModalSubmit()) {

        if (interaction.customId === "buyModal") {

            const item = interaction.fields.getTextInputValue("item");
            const x = interaction.fields.getTextInputValue("x");
            const z = interaction.fields.getTextInputValue("z");

            const order = {
                id: Date.now(),
                user: interaction.user.id,
                item,
                x,
                z,
                status: "pending"
            };

            orderQueue.push(order);

            console.log("NEW ORDER ADDED:", order);

            await interaction.reply({
                content: `✅ Order received: **${item}** at (${x}, ${z}) added to queue.`,
                ephemeral: true
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
