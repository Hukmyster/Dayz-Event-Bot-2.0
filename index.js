const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  Events
} = require("discord.js");

require("dotenv").config();

const shop = require("./modules/shop");

if (!process.env.DISCORD_TOKEN) {
  console.error("[FATAL] DISCORD_TOKEN missing");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

/* ---------------- COMMANDS ---------------- */

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

/* ---------------- READY + FORCE REFRESH ---------------- */

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log("[DISCORD] Clearing old commands...");
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: [] }
    );

    console.log("[DISCORD] Registering commands...");

    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );

    console.log("[DISCORD] Commands registered");
  } catch (err) {
    console.error("[COMMAND ERROR]", err);
  }
});

/* ---------------- SAFE REPLY ---------------- */

async function safeReply(interaction, payload) {
  try {
    if (interaction.replied || interaction.deferred) {
      return interaction.followUp(payload);
    }
    return interaction.reply(payload);
  } catch (err) {
    console.error("[REPLY ERROR]", err);
  }
}

/* ---------------- INTERACTION ---------------- */

client.on(Events.InteractionCreate, async (interaction) => {
  try {

    /* -------- AUTOCOMPLETE -------- */
    if (interaction.isAutocomplete()) {
      const focused = interaction.options.getFocused();
      const query = typeof focused === "string" ? focused : "";

      const results = shop.autocomplete(query || "");

      return interaction.respond(results.slice(0, 25)).catch(() => {});
    }

    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    /* -------- SHOP -------- */
    if (commandName === "shop") {
      const items = shop.getShopList();

      const msg = items.length
        ? items.map(i => `• ${i.name} (${i.type}) - $${i.price}`).join("\n")
        : "Shop empty";

      return safeReply(interaction, { content: msg, ephemeral: true });
    }

    /* -------- ADD ITEM (FIXED VALIDATION) -------- */
    if (commandName === "additem") {
      const name = interaction.options.getString("name");
      const type = interaction.options.getString("type");
      const price = interaction.options.getInteger("price");

      if (!name || !type || price === null || price === undefined) {
        return safeReply(interaction, {
          content: "Missing item fields (Discord command issue)",
          ephemeral: true
        });
      }

      const res = await shop.addItem(name, type, price);

      return safeReply(interaction, { content: res.reply, ephemeral: true });
    }

    /* -------- BUY -------- */
    if (commandName === "buy") {
      const item = interaction.options.getString("item");
      const qty = interaction.options.getInteger("quantity");
      const x = interaction.options.getInteger("x");
      const z = interaction.options.getInteger("z");

      const res = await shop.buyItem(item, qty, x, z);

      return safeReply(interaction, { content: res.reply, ephemeral: true });
    }

    /* -------- DELETE ITEM -------- */
    if (commandName === "deleteshopitem") {
      const name = interaction.options.getString("name");

      const res = await shop.deleteItem(name);

      return safeReply(interaction, { content: res.reply, ephemeral: true });
    }

    /* -------- QUEUE -------- */
    if (commandName === "queue") {
      const orders = shop.getOrders();

      const msg = orders.length
        ? orders.map(o => `• ${o.item} x${o.qty} @ (${o.x},${o.z})`).join("\n")
        : "No orders";

      return safeReply(interaction, { content: msg, ephemeral: true });
    }

    /* -------- BUILD -------- */
    if (commandName === "build") {
      const xml = shop.buildXML();

      return safeReply(interaction, {
        content: "XML built successfully",
        ephemeral: true
      });
    }

  } catch (err) {
    console.error("[INTERACTION ERROR]", err);

    return safeReply(interaction, {
      content: "Command error",
      ephemeral: true
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
