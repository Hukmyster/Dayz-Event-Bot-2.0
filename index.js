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
  { name: "shop", description: "Alias for shophelp" },
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

function formatMsg(content) {
  return content.length > 1900 ? content.slice(0, 1900) + "..." : content;
}

async function replyOnce(interaction, payload, label = "reply") {
  const data = { ...payload };
  if (data.ephemeral) {
    delete data.ephemeral;
    data.flags = MessageFlags.Ephemeral;
  }
  debug.step(label, { action: "send", command: interaction.commandName, replied: interaction.replied, deferred: interaction.deferred });
  if (interaction.replied || interaction.deferred) return interaction.followUp(data);
  return interaction.reply(data);
}

async function handleCommand(interaction) {
  const cmd = interaction.commandName;
  debug.start(cmd, { user: interaction.user?.tag });

  if (cmd === "shop" || cmd === "shophelp") {
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
    return replyOnce(interaction, { content: msg, ephemeral: true }, cmd);
  }

  if (cmd === "shoplist") {
    const items = shop.getShopList() || [];
    const msg = items.length ? items.map(i => `• ${i.name} (${i.type}) - $${i.price}`).join("\n") : "Shop empty";
    return replyOnce(interaction, { content: formatMsg(msg), ephemeral: true }, cmd);
  }

  if (cmd === "shopadditem") {
    const res = await shop.addItem(interaction.options.getString("name"), interaction.options.getString("type"), interaction.options.getInteger("price"));
    return replyOnce(interaction, { content: res.reply, ephemeral: true }, cmd);
  }

  if (cmd === "shopbuyitem") {
    const res = await shop.buyItem(interaction.options.getString("item"), interaction.options.getInteger("quantity"), interaction.options.getInteger("x"), interaction.options.getInteger("z"));
    return replyOnce(interaction, { content: res.reply, ephemeral: true }, cmd);
  }

  if (cmd === "shopremoveitem") {
    const res = await shop.deleteItem(interaction.options.getString("name"));
    return replyOnce(interaction, { content: res.reply, ephemeral: true }, cmd);
  }

  if (cmd === "shopeditprice") {
    const res = await shop.editPrice(interaction.options.getString("name"), interaction.options.getInteger("price"));
    return replyOnce(interaction, { content: res.reply, ephemeral: true }, cmd);
  }

  if (cmd === "shopeditname") {
    const res = await shop.editName(interaction.options.getString("name"), interaction.options.getString("newname"));
    return replyOnce(interaction, { content: res.reply, ephemeral: true }, cmd);
  }

  if (cmd === "shopqueue") {
    const orders = shop.getOrders() || [];
    const msg = orders.length ? orders.map(o => `• ${o.item} x${o.qty} @ (${o.x},${o.z}) [${o.status}]`).join("\n") : "No orders";
    return replyOnce(interaction, { content: formatMsg(msg), ephemeral: true }, cmd);
  }

  if (cmd === "shopclearqueue") {
    const res = await shop.clearOrders();
    return replyOnce(interaction, { content: res.reply, ephemeral: true }, cmd);
  }

  if (cmd === "shopbuildxml") {
    const res = await shop.buildXML();
    return replyOnce(interaction, { content: res.reply || "XML built successfully", ephemeral: true }, cmd);
  }

  if (cmd === "shopviewxml") {
    const res = await shop.viewXML();
    return replyOnce(interaction, { content: formatMsg(res.reply), ephemeral: true }, cmd);
  }

  if (cmd === "shoppushxml") {
    const res = await shop.pushXML();
    return replyOnce(interaction, { content: res.reply, ephemeral: true }, cmd);
  }

  if (cmd === "shopstatus") {
    const items = shop.getShopList() || [];
    const orders = shop.getOrders() || [];
    return replyOnce(interaction, { content: `Items: ${items.length}\nOrders: ${orders.length}`, ephemeral: true }, cmd);
  }

  if (cmd === "shopreload") {
    const res = await shop.reloadData();
    return replyOnce(interaction, { content: res.reply, ephemeral: true }, cmd);
  }

  debug.step(cmd, { note: "no handler matched" });
  return replyOnce(interaction, { content: "Unknown command", ephemeral: true }, cmd);
}

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);
  debug.start("startup", { bot: client.user.tag });
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log("[DISCORD] Clearing old GUILD commands...");
    await rest.put(Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID), { body: [] });
    console.log("[DISCORD] Registering GUILD commands...");
    await rest.put(Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID), { body: commands });
    const cmds = await rest.get(Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID));
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
    if (!interaction.guild) return;

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

    logger.interaction({ type: "command", cmd: interaction.commandName, user: interaction.user?.tag });
    return handleCommand(interaction).catch(err => {
      logger.error("COMMAND ERROR", err);
      debug.fail(interaction.commandName || "unknown", err, { user: interaction.user?.tag });
      return replyOnce(interaction, { content: "Error executing command", ephemeral: true }, interaction.commandName || "unknown");
    });
  } catch (err) {
    logger.error("INTERACTION ERROR", err);
    debug.fail(interaction.commandName || "unknown", err, { user: interaction.user?.tag });
    return replyOnce(interaction, { content: "Error executing command", ephemeral: true }, interaction.commandName || "unknown");
  }
});

client.login(process.env.DISCORD_TOKEN);
