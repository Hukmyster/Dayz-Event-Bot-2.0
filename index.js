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

function serializeOptions(interaction) {
  const out = {};
  for (const opt of interaction.options.data || []) out[opt.name] = opt.value;
  return out;
}

async function replyOnce(interaction, payload, label = "reply") {
  const data = { ...payload };
  if (data.ephemeral) {
    delete data.ephemeral;
    data.flags = MessageFlags.Ephemeral;
  }
  debug.step(label, { action: "send", command: interaction.commandName, replied: interaction.replied, deferred: interaction.deferred });
  return (interaction.replied || interaction.deferred) ? interaction.followUp(data) : interaction.reply(data);
}

async function handleCommand(interaction) {
  const cmd = interaction.commandName;
  const opts = serializeOptions(interaction);
  debug.start(cmd, { user: interaction.user?.tag, options: opts });

  if (cmd === "shop" || cmd === "shophelp") {
    return replyOnce(interaction, {
      content: [
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
      ].join("\n"),
      ephemeral: true
    }, cmd);
  }

  const send = (res, label = cmd) => replyOnce(interaction, { content: res.reply || String(res), ephemeral: true }, label);

  if (cmd === "shoplist") {
    const items = await shop.getShopList();
    debug.step("shoplist", { count: items.length });
    return send({ reply: items.length ? items.map(i => `• ${i.name} (${i.type}) - $${i.price}`).join("\n") : "Shop empty" });
  }

  if (cmd === "shopadditem") return send(await shop.addItem(interaction.options.getString("name"), interaction.options.getString("type"), interaction.options.getInteger("price")));
  if (cmd === "shopbuyitem") return send(await shop.buyItem(interaction.options.getString("item"), interaction.options.getInteger("quantity"), interaction.options.getInteger("x"), interaction.options.getInteger("z")));
  if (cmd === "shopremoveitem") return send(await shop.deleteItem(interaction.options.getString("name")));
  if (cmd === "shopeditprice") return send(await shop.editPrice(interaction.options.getString("name"), interaction.options.getInteger("price")));
  if (cmd === "shopeditname") return send(await shop.editName(interaction.options.getString("name"), interaction.options.getString("newname")));

  if (cmd === "shopqueue") {
    const orders = shop.getOrders() || [];
    debug.step("shopqueue", { count: orders.length });
    return send({ reply: orders.length ? orders.map(o => `• ${o.item} x${o.qty} @ (${o.x},${o.z}) [${o.status}]`).join("\n") : "No orders" });
  }

  if (cmd === "shopclearqueue") return send(await shop.clearOrders());
  if (cmd === "shopbuildxml") return send(await shop.buildXML());
  if (cmd === "shopviewxml") return send(await shop.viewXML());
  if (cmd === "shoppushxml") return send(await shop.pushXML());

  if (cmd === "shopstatus") {
    const items = await shop.getShopList();
    const orders = shop.getOrders() || [];
    debug.step("shopstatus", { items: items.length, orders: orders.length });
    return send({ reply: `Items: ${items.length}\nOrders: ${orders.length}` });
  }

  if (cmd === "shopreload") return send(await shop.reloadData());

  debug.step(cmd, { note: "no handler matched" });
  return replyOnce(interaction, { content: "Unknown command", ephemeral: true }, cmd);
}

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);
  debug.start("startup", { bot: client.user.tag });
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  try {
    const appId = client.user.id;
    console.log("[DISCORD] Clearing GUILD commands...");
    await rest.put(Routes.applicationGuildCommands(appId, process.env.GUILD_ID), { body: [] });
    console.log("[DISCORD] Clearing GLOBAL commands...");
    await rest.put(Routes.applicationCommands(appId), { body: [] });
    console.log("[DISCORD] Registering GUILD commands...");
    await rest.put(Routes.applicationGuildCommands(appId, process.env.GUILD_ID), { body: commands });
    const cmds = await rest.get(Routes.applicationGuildCommands(appId, process.env.GUILD_ID));
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
      debug.step("autocomplete", { query });
      const results = await shop.autocomplete(query);
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
      debug.fail(interaction.commandName || "unknown", err, { user: interaction.user?.tag, options: serializeOptions(interaction) });
      return replyOnce(interaction, { content: "Error executing command", ephemeral: true }, interaction.commandName || "unknown");
    });
  } catch (err) {
    logger.error("INTERACTION ERROR", err);
    debug.fail(interaction.commandName || "unknown", err, { user: interaction.user?.tag, options: serializeOptions(interaction) });
    return replyOnce(interaction, { content: "Error executing command", ephemeral: true }, interaction.commandName || "unknown");
  }
});

client.login(process.env.DISCORD_TOKEN);
