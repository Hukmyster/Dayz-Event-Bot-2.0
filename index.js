const { Client, GatewayIntentBits, REST, Routes } = require("discord.js");
require("dotenv").config();

const commands = require("./modules/commands");
const handleInteraction = require("./modules/interaction");
const db = require("./services/db");

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

client.once("ready", async () => {
    console.log(`Logged in as ${client.user.tag}`);

    await db.loadData();

    setInterval(db.loadData, 15000);
});

// ROUTER
client.on("interactionCreate", handleInteraction);

// REGISTER COMMANDS
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    console.log("Registering commands...");
    await rest.put(
        Routes.applicationGuildCommands(
            process.env.CLIENT_ID,
            process.env.GUILD_ID
        ),
        { body: commands }
    );
    console.log("Commands registered");

    client.login(process.env.DISCORD_TOKEN);
})();
