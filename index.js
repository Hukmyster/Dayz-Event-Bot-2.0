const { Client, GatewayIntentBits, Events, MessageFlags } = require("discord.js");
require("dotenv").config();

const shop = require("./modules/shop");
const economy = require("./modules/economy");
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
        "shopreload - reload data",
        "balance - show your wallet and bank balance",
        "deposit - move money from wallet to bank",
        "withdraw - move money from bank to wallet",
        "send - send money to another member",
        "leaderboard - show richest players",
        "account - show full account",
        "addmoney - admin add money",
        "removemoney - admin remove money",
        "resetuser - admin reset user"
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

  if (cmd === "balance") {
    const targetUser = interaction.options.getUser("member") || interaction.user;
    const account = await economy.getOrCreateAccount(targetUser.id, interaction.guildId, targetUser.username);
    const wallet = Number(account.wallet || 0);
    const bank = Number(account.bank || 0);
    return send({
      reply: `${targetUser.username}\nWallet: ${economy.formatMoney(wallet)}\nBank: ${economy.formatMoney(bank)}\nTotal: ${economy.formatMoney(wallet + bank)}`
    });
  }

  if (cmd === "deposit") {
    const amount = interaction.options.getInteger("amount", true);
    const updated = await economy.transferWalletToBank(interaction.user.id, interaction.guildId, amount, interaction.user.username, { notes: "User deposit" });
    return send({ reply: `Deposited ${economy.formatMoney(amount)}. Wallet: ${economy.formatMoney(updated.wallet)} Bank: ${economy.formatMoney(updated.bank)}` });
  }

  if (cmd === "withdraw") {
    const amount = interaction.options.getInteger("amount", true);
    const updated = await economy.transferBankToWallet(interaction.user.id, interaction.guildId, amount, interaction.user.username, { notes: "User withdraw" });
    return send({ reply: `Withdrew ${economy.formatMoney(amount)}. Wallet: ${economy.formatMoney(updated.wallet)} Bank: ${economy.formatMoney(updated.bank)}` });
  }

  if (cmd === "send") {
    const member = interaction.options.getUser("member", true);
    const amount = interaction.options.getInteger("amount", true);

    const sender = await economy.getOrCreateAccount(interaction.user.id, interaction.guildId, interaction.user.username);
    if (Number(sender.wallet || 0) < amount) return send({ reply: `You only have ${economy.formatMoney(sender.wallet)} in your wallet.` });

    const receiver = await economy.getOrCreateAccount(member.id, interaction.guildId, member.username);

    const updatedSender = await economy.updateAccount(interaction.user.id, interaction.guildId, {
      wallet: Number(sender.wallet || 0) - amount
    });

    const updatedReceiver = await economy.updateAccount(member.id, interaction.guildId, {
      wallet: Number(receiver.wallet || 0) + amount
    });

    await economy.logTransaction({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      username: interaction.user.username,
      type: "send",
      amount: -amount,
      balanceAfter: updatedSender.wallet,
      targetUserId: member.id,
      targetUsername: member.username,
      notes: `Sent to ${member.username}`
    });

    await economy.logTransaction({
      guildId: interaction.guildId,
      userId: member.id,
      username: member.username,
      type: "receive",
      amount,
      balanceAfter: updatedReceiver.wallet,
      targetUserId: interaction.user.id,
      targetUsername: interaction.user.username,
      notes: `Received from ${interaction.user.username}`
    });

    return send({ reply: `Sent ${economy.formatMoney(amount)} to ${member.username}.` });
  }

  if (cmd === "leaderboard") {
    const { data, error } = await economy.supabase
      .from("economy_accounts")
      .select("user_id, username, wallet, bank")
      .eq("guild_id", interaction.guildId);

    if (error) throw error;

    const sorted = (data || [])
      .map(x => ({
        username: x.username || "Unknown",
        total: Number(x.wallet || 0) + Number(x.bank || 0)
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    return send({
      reply: sorted.length
        ? sorted.map((u, i) => `${i + 1}. ${u.username} - ${economy.formatMoney(u.total)}`).join("\n")
        : "No economy accounts found yet."
    });
  }

  if (cmd === "account") {
    const targetUser = interaction.options.getUser("member") || interaction.user;
    const account = await economy.getOrCreateAccount(targetUser.id, interaction.guildId, targetUser.username);
    const wallet = Number(account.wallet || 0);
    const bank = Number(account.bank || 0);
    return send({
      reply: `${targetUser.username}\nWallet: ${economy.formatMoney(wallet)}\nBank: ${economy.formatMoney(bank)}\nTotal: ${economy.formatMoney(wallet + bank)}`
    });
  }

  if (cmd === "addmoney") {
    const member = interaction.options.getUser("member", true);
    const amount = interaction.options.getInteger("amount", true);
    const updated = await economy.adminAdjustWallet(member.id, interaction.guildId, amount, member.username, { notes: `Admin addmoney by ${interaction.user.username}` });
    return send({ reply: `Added ${economy.formatMoney(amount)} to ${member.username}. Wallet now ${economy.formatMoney(updated.wallet)}` });
  }

  if (cmd === "removemoney") {
    const member = interaction.options.getUser("member", true);
    const amount = interaction.options.getInteger("amount", true);
    const updated = await economy.adminAdjustWallet(member.id, interaction.guildId, -amount, member.username, { notes: `Admin removemoney by ${interaction.user.username}` });
    return send({ reply: `Removed ${economy.formatMoney(amount)} from ${member.username}. Wallet now ${economy.formatMoney(updated.wallet)}` });
  }

  if (cmd === "resetuser") {
    const member = interaction.options.getUser("member", true);
    const account = await economy.getOrCreateAccount(member.id, interaction.guildId, member.username);
    await economy.updateAccount(member.id, interaction.guildId, { wallet: 0, bank: 0 });
    await economy.logTransaction({
      guildId: interaction.guildId,
      userId: member.id,
      username: member.username,
      type: "reset",
      amount: 0,
      balanceAfter: 0,
      notes: `Account reset by ${interaction.user.username}`,
      metadata: { old_wallet: account.wallet, old_bank: account.bank, admin: true }
    });
    return send({ reply: `Reset ${member.username} to zero.` });
  }

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
