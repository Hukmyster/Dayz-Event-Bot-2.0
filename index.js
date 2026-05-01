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

if (!process.env.GUILD_ID) {
  console.error("[FATAL] GUILD_ID missing (required for instant command updates)");
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
      { name: "item", type: 3, required: true, autocomplete: true },
      { name: "quantity", type: 4, required: true },
      { name: "x", type: 4, required: true },
      { name: "z", type: 4, required: true }
    ]
  },
  {
    name: "deleteshopitem",
    description: "Remove item from shop",
    options: [
      { name: "name", type: 3, required: true }
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

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log("[DISCORD] Registering GUILD commands...");

    await rest.put(
      Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
      { body: commands }
    );

    const cmds = await rest.get(
      Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID)
    );

    console.log("[DEBUG] ACTIVE COMMANDS:");
    console.log(JSON.stringify(cmds, null, 2));

    console.log("[DISCORD] Commands registered");
  } catch (err) {
    console.error("[COMMAND REGISTER ERROR]", err);
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

/* ---------------- INTERACTIONS ---------------- */

client.on(Events.InteractionCreate, async (interaction) => {
  try {

    if (!interaction.guild) {
      console.log("[IGNORED] DM interaction");
      return;
    }

    if (interaction.isAutocomplete()) {
      const focused = interaction.options.getFocused();
      const query = typeof focused === "string" ? focused : "";

      const results = shop.autocomplete(query);

      console.log("[AUTOCOMPLETE]", { query, results });

      return interaction.respond(results.slice(0, 25)).catch(console.error);
    }

    if (!interaction.isChatInputCommand()) return;

    const cmd = interaction.commandName;

    console.log(`[COMMAND] ${cmd}`);

    if (cmd === "shop") {
      const items = shop.getShopList() || [];

      const msg = items.length
        ? items.map(i => `• ${i.name} (${i.type}) - $${i.price}`).join("\n")
        : "Shop empty";

      return safeReply(interaction, { content: msg, ephemeral: true });
    }

    if (cmd === "additem") {
      const name = interaction.options.getString("name");
      const type = interaction.options.getString("type");
      const price = interaction.options.getInteger("price");

      console.log("[ADD ITEM RAW]", {
        name,
        type,
        price,
        raw: interaction.options.data
      });

      const res = await shop.addItem(name, type, price);

      return safeReply(interaction, { content: res.reply, ephemeral: true });
    }

    if (cmd === "buy") {
      const item = interaction.options.getString("item");
      const qty = interaction.options.getInteger("quantity");
      const x = interaction.options.getInteger("x");
      const z = interaction.options.getInteger("z");

      const res = await shop.buyItem(item, qty, x, z);

      return safeReply(interaction, { content: res.reply, ephemeral: true });
    }

    if (cmd === "deleteshopitem") {
      const name = interaction.options.getString("name");

      const res = await shop.deleteItem(name);

      return safeReply(interaction, { content: res.reply, ephemeral: true });
    }

    if (cmd === "queue") {
      const orders = shop.getOrders() || [];

      const msg = orders.length
        ? orders.map(o => `• ${o.item} x${o.qty} @ (${o.x},${o.z})`).join("\n")
        : "No orders";

      return safeReply(interaction, { content: msg, ephemeral: true });
    }

    if (cmd === "build") {
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
