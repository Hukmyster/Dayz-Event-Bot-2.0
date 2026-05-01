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
  console.error("[FATAL] DISCORD_TOKEN missing in environment variables");
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

/* ---------------- READY ---------------- */

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);

  try {
    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );

    console.log("[DISCORD] Commands registered");
  } catch (err) {
    console.error("[COMMAND REGISTRATION ERROR]", err);
  }
});

/* ---------------- SAFE REPLY HELPER ---------------- */

async function safeReply(interaction, payload) {
  try {
    if (interaction.replied || interaction.deferred) {
      return await interaction.followUp(payload);
    }
    return await interaction.reply(payload);
  } catch (err) {
    console.error("[REPLY ERROR]", err);
  }
}

/* ---------------- AUTOCOMPLETE FIX ---------------- */

client.on(Events.InteractionCreate, async (interaction) => {
  try {

    /* ---- AUTOCOMPLETE ---- */
    if (interaction.isAutocomplete()) {
      const focused = interaction.options.getFocused();

      const query = typeof focused === "string" ? focused : "";
      const results = shop.autocomplete(query || "");

      return interaction.respond(results.slice(0, 25)).catch(() => {});
    }

    /* ---- IGNORE NON COMMANDS ---- */
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    /* ---------------- SHOP ---------------- */
    if (commandName === "shop") {
      const items = await shop.getShopList();

      const list = items.length
        ? items.map(i => `• ${i.name} (${i.type}) - $${i.price}`).join("\n")
        : "Shop is empty";

      return safeReply(interaction, { content: list, ephemeral: true });
    }

    /* ---------------- ADD ITEM ---------------- */
    if (commandName === "additem") {
      const name = interaction.options.getString("name") || "";
      const type = interaction.options.getString("type") || "";
      const price = interaction.options.getInteger("price") || 0;

      if (!name.trim() || !type.trim()) {
        return safeReply(interaction, {
          content: "Invalid item data",
          ephemeral: true
        });
      }

      const res = await shop.addItem(name.trim(), type.trim(), price);

      return safeReply(interaction, { content: res.reply, ephemeral: true });
    }

    /* ---------------- BUY ---------------- */
    if (commandName === "buy") {
      const item = interaction.options.getString("item") || "";
      const qty = interaction.options.getInteger("quantity") || 1;
      const x = interaction.options.getInteger("x") || 0;
      const z = interaction.options.getInteger("z") || 0;

      const res = await shop.buyItem(item.trim(), qty, x, z);

      return safeReply(interaction, { content: res.reply, ephemeral: true });
    }

    /* ---------------- DELETE ITEM ---------------- */
    if (commandName === "deleteshopitem") {
      const name = interaction.options.getString("name") || "";

      const res = await shop.deleteItem(name.trim());

      return safeReply(interaction, { content: res.reply, ephemeral: true });
    }

    /* ---------------- QUEUE ---------------- */
    if (commandName === "queue") {
      const orders = shop.getOrders();

      const msg = orders.length
        ? orders.map(o => `• ${o.item} x${o.qty} @ (${o.x},${o.z})`).join("\n")
        : "No queued orders";

      return safeReply(interaction, { content: msg, ephemeral: true });
    }

    /* ---------------- BUILD ---------------- */
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
      content: "Error executing command",
      ephemeral: true
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
