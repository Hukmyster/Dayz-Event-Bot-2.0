const {
  Client,
  GatewayIntentBits,
  Collection,
  REST,
  Routes
} = require("discord.js");

require("dotenv").config();

const shop = require("./modules/shop");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

/* ---------------- COMMAND REGISTRY ---------------- */

const commands = [
  {
    name: "shop",
    description: "View shop items"
  },
  {
    name: "additem",
    description: "Add item to shop",
    options: [
      { name: "name", type: 3, description: "Item name", required: true },
      { name: "type", type: 3, description: "DayZ type name", required: true },
      { name: "price", type: 4, description: "Price", required: true }
    ]
  },
  {
    name: "buy",
    description: "Buy item",
    options: [
      {
        name: "item",
        type: 3,
        description: "Item name",
        required: true,
        autocomplete: true
      },
      {
        name: "quantity",
        type: 4,
        description: "Amount",
        required: true
      },
      {
        name: "x",
        type: 4,
        description: "X coord",
        required: true
      },
      {
        name: "z",
        type: 4,
        description: "Z coord",
        required: true
      }
    ]
  },
  {
    name: "deleteshopitem",
    description: "Remove item from shop",
    options: [
      { name: "name", type: 3, description: "Item name", required: true }
    ]
  },
  {
    name: "queue",
    description: "View queued orders"
  },
  {
    name: "build",
    description: "Build XML files"
  }
];

/* ---------------- REGISTER COMMANDS ---------------- */

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: commands }
  );

  console.log("[DISCORD] Commands registered");
});

/* ---------------- INTERACTION ROUTER ---------------- */

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isAutocomplete()) {
      const focused = interaction.options.getFocused();
      const results = shop.autocomplete(focused);

      return interaction.respond(results);
    }

    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    /* ---------------- SHOP VIEW ---------------- */
    if (commandName === "shop") {
      const items = await shop.getShopList();
      const list = items.map(i => `• ${i.name} (${i.type}) - $${i.price}`).join("\n") || "Empty shop";

      return interaction.reply({ content: list, ephemeral: true });
    }

    /* ---------------- ADD ITEM ---------------- */
    if (commandName === "additem") {
      const name = interaction.options.getString("name");
      const type = interaction.options.getString("type");
      const price = interaction.options.getInteger("price");

      const res = await shop.addItem(name, type, price);

      return interaction.reply({ content: res.reply, ephemeral: true });
    }

    /* ---------------- BUY ITEM ---------------- */
    if (commandName === "buy") {
      const item = interaction.options.getString("item");
      const qty = interaction.options.getInteger("quantity");
      const x = interaction.options.getInteger("x");
      const z = interaction.options.getInteger("z");

      const res = await shop.buyItem(item, qty, x, z);

      return interaction.reply({ content: res.reply, ephemeral: true });
    }

    /* ---------------- DELETE ITEM ---------------- */
    if (commandName === "deleteshopitem") {
      const name = interaction.options.getString("name");

      const res = await shop.deleteItem(name);

      return interaction.reply({ content: res.reply, ephemeral: true });
    }

    /* ---------------- QUEUE ---------------- */
    if (commandName === "queue") {
      const orders = shop.getOrders();

      const msg = orders.length
        ? orders.map(o => `• ${o.item} x${o.qty} @ (${o.x},${o.z})`).join("\n")
        : "No orders queued";

      return interaction.reply({ content: msg, ephemeral: true });
    }

    /* ---------------- BUILD XML ---------------- */
    if (commandName === "build") {
      const xml = await deploy.deploy();

      return interaction.reply({ content: xml, ephemeral: true });
    }

  } catch (err) {
    console.error("[INTERACTION ERROR]", err);
    if (interaction.replied || interaction.deferred) return;
    return interaction.reply({ content: "Error executing command", ephemeral: true });
  }
});

client.login(process.env.DISCORD_TOKEN);
