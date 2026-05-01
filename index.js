const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder
} = require("discord.js");

require("dotenv").config();

const db = require("./services/db");
const interactionHandler = require("./modules/interaction");

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// ---------------- COMMANDS ----------------
const commands = [
    new SlashCommandBuilder()
        .setName("shop")
        .setDescription("View shop"),

    new SlashCommandBuilder()
        .setName("buy")
        .setDescription("Buy item")
        .addStringOption(o =>
            o.setName("item").setDescription("Item name").setRequired(true)
        )
        .addIntegerOption(o =>
            o.setName("x").setDescription("X").setRequired(true)
        )
        .addIntegerOption(o =>
            o.setName("z").setDescription("Z").setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("additem")
        .setDescription("Add item"),

    new SlashCommandBuilder()
        .setName("viewxml")
        .setDescription("View generated XML"),

    new SlashCommandBuilder()
        .setName("deleteshophistory")
        .setDescription("Wipe shop + orders + XML"),

    new SlashCommandBuilder()
        .setName("orders")
        .setDescription("View orders"),

    new SlashCommandBuilder()
        .setName("queue")
        .setDescription("Queue orders"),

    new SlashCommandBuilder()
        .setName("build")
        .setDescription("Build XML")
];

// ---------------- READY ----------------
client.once("clientReady", async () => {
    console.log(`Logged in as ${client.user.tag}`);

    await db.loadData();

    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

    await rest.put(
        Routes.applicationGuildCommands(
            process.env.CLIENT_ID,
            process.env.GUILD_ID
        ),
        { body: commands }
    );

    console.log("[DISCORD] Commands registered");
});

// ---------------- INTERACTIONS ----------------
client.on("interactionCreate", interactionHandler);

client.login(process.env.DISCORD_TOKEN);
