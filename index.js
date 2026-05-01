const {
    Client,
    GatewayIntentBits,
    REST,
    Routes
} = require("discord.js");

require("dotenv").config();

const shop = require("./modules/shop");

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// ---------------- READY ----------------
client.once("clientReady", async () => {

    console.log(`Logged in as ${client.user.tag}`);

    const commands = shop.commands;

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

// ---------------- ROUTER ----------------
client.on("interactionCreate", async (interaction) => {

    try {

        if (interaction.isAutocomplete()) {
            return shop.autocomplete(interaction);
        }

        if (!interaction.isChatInputCommand()) return;

        switch (interaction.commandName) {

            case "shop":
                return shop.view(interaction);

            case "buy":
                return shop.buy(interaction);

            case "additem":
                return shop.add(interaction);

            case "deleteshopitem":
                return shop.remove(interaction);

            case "deleteshophistory":
                return shop.clearOrders(interaction);

            case "queue":
                return shop.queue(interaction);

            case "build":
                return shop.build(interaction);

            case "shopcycle":
                return shop.forceCycle(interaction);

            case "viewxml":
                return shop.viewXML(interaction);
        }

    } catch (err) {
        console.error("[BRAIN ERROR]", err);

        if (interaction.deferred || interaction.replied) {
            return interaction.editReply("Error: " + err.message);
        }

        return interaction.reply({
            content: "Error: " + err.message,
            ephemeral: true
        });
    }
});

client.login(process.env.DISCORD_TOKEN);
