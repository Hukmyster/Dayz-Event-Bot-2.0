const { Client, GatewayIntentBits, Collection } = require("discord.js");

const shop = require("./modules/shop");

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

client.commands = new Collection();

// =========================
// READY
// =========================
client.once("ready", async () => {

    console.log(`Logged in as ${client.user.tag}`);

    await client.application.commands.set(shop.commands);

    console.log("[DISCORD] Commands registered");
});

// =========================
// INTERACTIONS (ONLY ONE HANDLER - CLEAN)
// =========================
client.on("interactionCreate", async (interaction) => {

    try {

        // AUTOCOMPLETE
        if (interaction.isAutocomplete()) {
            return shop.autocomplete?.(interaction);
        }

        // MODALS
        if (interaction.isModalSubmit()) {
            return shop.handleModal?.(interaction);
        }

        // SLASH COMMANDS
        if (!interaction.isChatInputCommand()) return;

        const cmd = interaction.commandName;

        if (typeof shop[cmd] === "function") {
            return await shop[cmd](interaction);
        }

    } catch (err) {
        console.log("[INTERACTION ERROR]", err);

        if (!interaction.replied && !interaction.deferred) {
            return interaction.reply({
                content: "Error executing command",
                ephemeral: true
            });
        }
    }
});

client.login(process.env.TOKEN);
