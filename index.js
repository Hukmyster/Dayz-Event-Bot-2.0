require("dotenv").config();
const { Client, GatewayIntentBits, REST, Routes } = require("discord.js");

const shop = require("./modules/shop");
const xml = require("./modules/xml");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const commands = [
  {
    name: "additem",
    description: "Add item to shop"
  },
  {
    name: "buy",
    description: "Buy item",
    options: [
      {
        name: "item",
        description: "Item name",
        type: 3,
        required: true,
        autocomplete: true
      },
      {
        name: "x",
        description: "X coordinate",
        type: 4,
        required: true
      },
      {
        name: "z",
        description: "Z coordinate",
        type: 4,
        required: true
      },
      {
        name: "quantity",
        description: "Amount",
        type: 4,
        required: false
      }
    ]
  },
  {
    name: "viewxml",
    description: "View built XML"
  }
];

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: commands }
  );

  console.log("[DISCORD] Commands registered");
});

client.on("interactionCreate", async (interaction) => {
  try {
    // AUTOCOMPLETE
    if (interaction.isAutocomplete()) {
      return shop.autocomplete(interaction);
    }

    // MODAL SUBMIT
    if (interaction.isModalSubmit()) {
      return shop.handleModal(interaction);
    }

    // COMMANDS
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "additem") {
      return shop.showAddModal(interaction);
    }

    if (interaction.commandName === "buy") {
      return shop.buy(interaction);
    }

    if (interaction.commandName === "viewxml") {
      return shop.viewXML(interaction);
    }

  } catch (err) {
    console.error("[INTERACTION ERROR]", err);

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: "Error occurred", flags: 64 });
    } else {
      await interaction.reply({ content: "Error occurred", flags: 64 });
    }
  }
});

client.login(process.env.TOKEN);
