const fs = require("fs");
const { Client, GatewayIntentBits, Collection } = require("discord.js");

const shop = require("./modules/shop");

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

client.commands = new Collection();

// =========================
// REGISTER COMMANDS
// =========================
client.on("ready", async () => {
    console.log(`Logged in as ${client.user.tag}`);

    const commands = shop.commands;

    await client.application.commands.set(commands);

    console.log("[DISCORD] Commands registered");
});

// =========================
// INTERACTIONS
// =========================
client.on("interactionCreate", async (interaction) => {

    try {

        // ===== AUTOCOMPLETE =====
        if (interaction.isAutocomplete()) {
            return shop.autocomplete(interaction);
        }

        // ===== MODALS =====
        if (interaction.isModalSubmit()) {
            return shop.handleModal(interaction);
        }

        if (!interaction.isChatInputCommand()) return;

        const cmd = interaction.commandName;

        if (shop[cmd]) {
            return await shop[cmd](interaction);
        }

    } catch (err) {
        console.log("[INTERACTION ERROR]", err);

        if (!interaction.replied) {
            return interaction.reply({
                content: "Error executing command",
                ephemeral: true
            });
        }
    }
});

client.login(process.env.TOKEN);
