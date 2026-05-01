const { Client, GatewayIntentBits, Events, MessageFlags } = require("discord.js");
require("dotenv").config();

const shop = require("./modules/shop");
const logger = require("./utils/logger");
const debug = require("./utils/debug");

if (!process.env.DISCORD_TOKEN) {
  console.error("[FATAL] DISCORD_TOKEN missing");
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

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
  debug.step(label, {
    action: "send",
    command: interaction.commandName,
    replied: interaction.replied,
    deferred: interaction.deferred
  });
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

  const send = (res, label = cmd) =>
    replyOnce(interaction, { content: res.reply || String(res), ephemeral: true }, label);

  if (cmd === "shoplist") {
    const items = await shop.getShopList();
    debug.step("shoplist", { count: items.length });
    return send({
      reply: items.length
        ? items.map(i => `• ${i.name} (${i.type}) - $${i.price}`).join("\n")
        : "Shop empty"
    });
  }

  if (cmd === "shopadditem") {
    return send(
      await shop.addItem(
        interaction.options.getString("name"),
        interaction.options.getString("type"),
        interaction.options.getInteger("price")
      )
    );
  }

  if (cmd === "shopbuyitem") {
    return send(
      await shop.buyItem(
        interaction.options.getString("item"),
        interaction.options.getInteger("quantity"),
        interaction.options.getInteger("x"),
        interaction.options.getInteger("z")
      )
    );
  }

  if (cmd === "shopremoveitem") return send(await shop.deleteItem(interaction.options.getString("name")));
  if (cmd === "shopeditprice") return send(await shop.editPrice(interaction.options.getString("name"), interaction.options.getInteger("price")));
  if (cmd === "shopeditname") return send(await shop.editName(interaction.options.getString("name"), interaction.options.getString("newname")));

  if (cmd === "shopqueue") {
    const orders = shop.getOrders() || [];
    debug.step("shopqueue", { count: orders.length });
    return send({
      reply: orders.length
        ? orders.map(o => `• ${o.item} x${o.qty} @ (${o.x},${o.z}) [${o.status}]`).join("\n")
        : "No orders"
    });
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
  console.log("[DISCORD] Bot is ready. Commands are handled from Discord now.");
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
      debug.fail(interaction.commandName || "unknown", err, {
        user: interaction.user?.tag,
        options: serializeOptions(interaction)
      });
      return replyOnce(interaction, { content: "Error executing command", ephemeral: true }, interaction.commandName || "unknown");
    });
  } catch (err) {
    logger.error("INTERACTION ERROR", err);
    debug.fail(interaction.commandName || "unknown", err, {
      user: interaction.user?.tag,
      options: serializeOptions(interaction)
    });
    return replyOnce(interaction, { content: "Error executing command", ephemeral: true }, interaction.commandName || "unknown");
  }
});

client.login(process.env.DISCORD_TOKEN);
