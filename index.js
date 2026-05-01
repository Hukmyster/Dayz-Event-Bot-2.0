const { Client, GatewayIntentBits, REST, Routes, Events, ApplicationCommandOptionType, MessageFlags } = require("discord.js");
require("dotenv").config();

const shop = require("./modules/shop");
const logger = require("./utils/logger");
const debug = require("./utils/debug");

if (!process.env.DISCORD_TOKEN) {
  console.error("[FATAL] DISCORD_TOKEN missing");
  process.exit(1);
}

if (!process.env.GUILD_ID) {
  console.error("[FATAL] GUILD_ID missing (required for instant command updates)");
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
  { name: "shoplist", description: "List all shop items" },
  {
    name: "shopbuyitem",
    description: "Buy an item from the shop",
    options: [
      { name: "item", type: ApplicationCommandOptionType.String, description: "Item name", required: true, autocomplete: true },
      { name: "quantity", type: ApplicationCommandOptionType.Integer, description: "Quantity", required: true },
      { name: "x", type: ApplicationCommandOptionType.Integer, description: "X coordinate", required: true },
      { name: "z", type: ApplicationCommandOptionType.Integer, description: "Z coordinate", required: true }
    ]
  },
  {
    name: "shopadditem",
    description: "Add a new item to the shop",
    options: [
      { name: "name", type: ApplicationCommandOptionType.String, description: "Item display name", required: true },
      { name: "type", type: ApplicationCommandOptionType.String, description: "DayZ type name", required: true },
      { name: "price", type: ApplicationCommandOptionType.Integer, description: "Price", required: true }
    ]
  },
  {
    name: "shopremoveitem",
    description: "Remove an item from the shop",
    options: [
      { name: "name", type: ApplicationCommandOptionType.String, description: "Item display name", required: true }
    ]
  },
  {
    name: "shopeditprice",
    description: "Change the price of an item",
    options: [
      { name: "name", type: ApplicationCommandOptionType.String, description: "Item display name", required: true },
      { name: "price", type: ApplicationCommandOptionType.Integer, description: "New price", required: true }
    ]
  },
  {
    name: "shopeditname",
    description: "Rename an item",
    options: [
      { name: "name", type: ApplicationCommandOptionType.String, description: "Current item display name", required: true },
      { name: "newname", type: ApplicationCommandOptionType.String, description: "New display name", required: true }
    ]
  },
  { name: "shopqueue", description: "View queued purchases" },
  { name: "shopclearqueue", description: "Clear queued purchases" },
  { name: "shopbuildxml", description: "Build the XML files" },
  { name: "shopviewxml", description: "View the built XML in Discord" },
  { name: "shoppushxml", description: "Push the built XML to the output folder" },
  { name: "shophelp", description: "List all shop commands" },
  { name: "shopstatus", description: "Show bot and shop status" },
  { name: "shopreload", description: "Reload shop data from disk" }
];

async function safeReply(interaction, payload, label = "reply") {
  try {
    const data = { ...payload };

    if (data.ephemeral) {
      delete data.ephemeral;
      data.flags = MessageFlags.Ephemeral;
    }

    debug.step(label, {
      action: "attempt",
      command: interaction.commandName,
      replied: interaction.replied,
      deferred: interaction.deferred
    });

    if (interaction.replied || interaction.deferred) {
      return interaction.followUp(data);
    }

    return interaction.reply(data);
  } catch (err) {
    logger.error("REPLY ERROR", err);
    debug.fail(label, err, { command: interaction.commandName });
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);
  debug.start("startup", { bot: client.user.tag });

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log("[DISCORD] Clearing old GUILD commands...");
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
      { body: [] }
    );

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
    debug.ok("startup", { commands: cmds.map(c => c.name) });
  } catch (err) {
    console.error("[COMMAND REGISTER ERROR]", err);
    debug.fail("startup", err);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (!interaction.guild) {
      console.log("[IGNORED] DM interaction");
      debug.step("dm", { user: interaction.user?.tag });
      return;
    }

    if (interaction.isAutocomplete()) {
      const focused = interaction.options.getFocused();
      const query = typeof focused === "string" ? focused : "";
      const results = shop.autocomplete(query);

      logger.interaction({ type: "autocomplete", query, results });
      debug.step("autocomplete", { query, resultsCount: results.length });

      return interaction.respond(results.slice(0, 25)).catch(err => {
        logger.error("AUTOCOMPLETE ERROR", err);
        debug.fail("autocomplete", err, { query });
      });
    }

    if (!interaction.isChatInputCommand()) return;

    const cmd = interaction.commandName;

    logger.interaction({ type: "command", cmd, user: interaction.user?.tag });
    debug.start(cmd, { user: interaction.user?.tag });

    if (cmd === "shoplist") {
      const items = shop.getShopList() || [];
      const msg = items.length
        ? items.map(i => `• ${i.name} (${i.type}) - $${i.price}`).join("\n")
        : "Shop empty";

      debug.ok(cmd, { items: items.length });
      return safeReply(interaction, { content: msg, ephemeral: true }, cmd);
    }

    if (cmd === "shopadditem") {
      const name = interaction.options.getString("name");
      const type = interaction.options.getString("type");
      const price = interaction.options.getInteger("price");

      const res = await shop.addItem(name, type, price);

      debug.ok(cmd, { name, type, price, reply: res.reply });
      return safeReply(interaction, { content: res.reply, ephemeral: true }, cmd);
    }

    if (cmd === "shopbuyitem") {
      const item = interaction.options.getString("item");
      const qty = interaction.options.getInteger("quantity");
      const x = interaction.options.getInteger("x");
      const z = interaction.options.getInteger("z");

      const res = await shop.buyItem(item, qty, x, z);

      debug.ok(cmd, { item, qty, x, z, reply: res.reply });
      return safeReply(interaction, { content: res.reply, ephemeral: true }, cmd);
    }

    if (cmd === "shopremoveitem") {
      const name = interaction.options.getString("name");
      const res = await shop.deleteItem(name);

      debug.ok(cmd, { name, reply: res.reply });
      return safeReply(interaction, { content: res.reply, ephemeral: true }, cmd);
    }

    if (cmd === "shopeditprice") {
      const name = interaction.options.getString("name");
      const price = interaction.options.getInteger("price");
      const res = await shop.editPrice(name, price);

      debug.ok(cmd, { name, price, reply: res.reply });
      return safeReply(interaction, { content: res.reply, ephemeral: true }, cmd);
    }

    if (cmd === "shopeditname") {
      const name = interaction.options.getString("name");
      const newname = interaction.options.getString("newname");
      const res = await shop.editName(name, newname);

      debug.ok(cmd, { name, newname, reply: res.reply });
      return safeReply(interaction, { content: res.reply, ephemeral: true }, cmd);
    }

    if (cmd === "shopqueue") {
      const orders = shop.getOrders() || [];
      const msg = orders.length
        ? orders.map(o => `• ${o.item} x${o.qty} @ (${o.x},${o.z}) [${o.status}]`).join("\n")
        : "No orders";

      debug.ok(cmd, { orders: orders.length });
      return safeReply(interaction, { content: msg, ephemeral: true }, cmd);
    }

    if (cmd === "shopclearqueue") {
      const res = await shop.clearOrders();

      debug.ok(cmd, { reply: res.reply });
      return safeReply(interaction, { content: res.reply, ephemeral: true }, cmd);
    }

    if (cmd === "shopbuildxml") {
      const res = await shop.buildXML();

      debug.ok(cmd, { reply: res.reply });
      return safeReply(interaction, { content: res.reply || "XML built successfully", ephemeral: true }, cmd);
    }

    if (cmd === "shopviewxml") {
      const res = await shop.viewXML();

      debug.ok(cmd, { replyLen: String(res.reply || "").length });
      return safeReply(interaction, { content: res.reply, ephemeral: true }, cmd);
    }

    if (cmd === "shoppushxml") {
      const res = await shop.pushXML();

      debug.ok(cmd, { reply: res.reply });
      return safeReply(interaction, { content: res.reply, ephemeral: true }, cmd);
    }

    if (cmd === "shophelp") {
      const msg = [
        "shoplist - list all shop items",
        "shopbuyitem - buy an item",
        "shopadditem - add a new item",
        "shopremoveitem - remove an item",
        "shopeditprice - change an item price",
        "shopeditname - rename an item",
        "shopqueue - view queued purchases",
        "shopclearqueue - clear queued purchases",
        "shopbuildxml - build XML files",
        "shopviewxml - view built XML",
        "shoppushxml - push XML output",
        "shopstatus - show status",
        "shopreload - reload data"
      ].join("\n");

      debug.ok(cmd, { lines: 14 });
      return safeReply(interaction, { content: msg, ephemeral: true }, cmd);
    }

    if (cmd === "shopstatus") {
      const items = shop.getShopList() || [];
      const orders = shop.getOrders() || [];
      const msg = `Items: ${items.length}\nOrders: ${orders.length}`;

      debug.ok(cmd, { items: items.length, orders: orders.length });
      return safeReply(interaction, { content: msg, ephemeral: true }, cmd);
    }

    if (cmd === "shopreload") {
      const res = await shop.reloadData();

      debug.ok(cmd, { reply: res.reply });
      return safeReply(interaction, { content: res.reply, ephemeral: true }, cmd);
    }

    debug.step(cmd, { note: "no handler matched" });
  } catch (err) {
    logger.error("INTERACTION ERROR", err);
    debug.fail(interaction.commandName || "unknown", err, { user: interaction.user?.tag });

    return safeReply(interaction, { content: "Error executing command", ephemeral: true }, interaction.commandName || "unknown");
  }
});

client.login(process.env.DISCORD_TOKEN);
