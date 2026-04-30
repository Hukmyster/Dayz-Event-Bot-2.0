const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require("discord.js");
require("dotenv").config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// 1. Define command
const commands = [
    new SlashCommandBuilder()
        .setName("buy")
        .setDescription("Test buy command")
        .toJSON()
];

// 2. Register command to Discord (guild-only = instant updates)
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log("Registering slash command...");

        await rest.put(
            Routes.applicationGuildCommands(
                process.env.CLIENT_ID,
                process.env.GUILD_ID
            ),
            { body: commands }
        );

        console.log("Slash command registered.");
    } catch (error) {
        console.error(error);
    }
})();

// 3. Bot ready
client.once("clientReady", () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// 4. Command handler
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "buy") {
        await interaction.reply("Buy command works ✅");
    }
});

client.login(process.env.DISCORD_TOKEN);
