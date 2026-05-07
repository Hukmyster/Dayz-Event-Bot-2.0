const fs = require("fs");
const path = require("path");
const { MessageFlags, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require("discord.js");

const shop = require("./modules/shop");
const economy = require("./modules/economy");
const logger = require("./utils/logger");
const debug = require("./utils/debug");

const TOGGLE_FILE = path.join(__dirname, "data", "toggles.json");

function ensureToggleFile() {
  const dir = path.dirname(TOGGLE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(TOGGLE_FILE)) fs.writeFileSync(TOGGLE_FILE, JSON.stringify({ panels: [] }, null, 2));
}

function loadToggles() {
  ensureToggleFile();
  try {
    const raw = fs.readFileSync(TOGGLE_FILE, "utf8");
    const parsed = JSON.parse(raw || "{}");
    if (!parsed.panels) parsed.panels = [];
    return parsed;
  } catch {
    return { panels: [] };
  }
}

function saveToggles(data) {
  ensureToggleFile();
  fs.writeFileSync(TOGGLE_FILE, JSON.stringify(data, null, 2));
}

function getPanelId(interaction) {
  return `${interaction.guildId}:${interaction.channelId}:${Date.now()}`;
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
  return (interaction.replied || interaction.deferred)
    ? interaction.followUp(data)
    : interaction.reply(data);
}

async function handleAutocomplete(interaction) {
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

async function handleToggleButton(interaction) {
  const customId = interaction.customId || "";
  if (!customId.startsWith("toggle:")) return false;

  const roleId = customId.split(":")[1];
  const role = interaction.guild.roles.cache.get(roleId);
  if (!role) {
    return interaction.reply({ content: "That role no longer exists.", ephemeral: true });
  }

  const member = interaction.member;
  const hasRole = member.roles.cache.has(roleId);

  if (hasRole) {
    await member.roles.remove(roleId);
    return interaction.reply({ content: `Removed ${role.name}.`, ephemeral: true });
  } else {
    await member.roles.add(roleId);
    return interaction.reply({ content: `Added ${role.name}.`, ephemeral: true });
  }
}

async function handleCommand(interaction) {
  const shopModule = require("./modules/shop");
  const economyModule = require("./modules/economy");
  const daily = require("./commands/shop/daily");
  const whereami = require("./commands/economy/whereami");
  const linkgamertag = require("./commands/economy/linkgamertag");
  const radaradd = require("./commands/radar/radaradd");
  const radarremove = require("./commands/radar/radarremove");
  const radarview = require("./commands/radar/radarview");
  const radaradmin = require("./commands/radar/radaradmin");
  const radarignore = require("./commands/radar/radarignore");
  const killfeed = require("./modules/killfeed");
  const eventfeed = require("./modules/eventfeed");
  const serverstate = require("./modules/serverstate");
  const createtoggle = require("./commands/admin/createtoggle");
  const removetoggle = require("./commands/admin/removetoggle");

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
        "shopstatus - show status",
        "shopreload - reload data",
        "balance - show your wallet and bank balance",
        "deposit - move money from wallet to bank",
        "withdraw - move money from bank to wallet",
        "send - send money to another member",
        "leaderboard - show richest players",
        "daily - claim your daily reward",
        "account - show full account",
        "addmoney - admin add money",
        "removemoney - admin remove money",
        "resetuser - admin reset user",
        "whereami - show your latest known location",
        "linkgamertag - link your in-game gamertag",
        "radaradd - add a player radar",
        "radarremove - remove a player radar",
        "radarview - view saved player radars",
        "radaradmin - add or remove radar admins",
        "radarignore - add or remove ignored players",
        "createtoggle - create a role toggle button",
        "removetoggle - remove a role toggle button"
      ].join("\n"),
      ephemeral: true
    }, cmd);
  }

  const send = (res, label = cmd) =>
    replyOnce(interaction, { content: res.reply || String(res), ephemeral: true }, label);

  if (cmd === "killfeed") {
    return replyOnce(interaction, {
      content: "Killfeed runs automatically on bot startup.",
      ephemeral: true
    }, cmd);
  }

  if (cmd === "eventfeed") {
    return replyOnce(interaction, {
      content: "Eventfeed runs automatically on bot startup.",
      ephemeral: true
    }, cmd);
  }

  if (cmd === "serverstate") {
    return replyOnce(interaction, {
      content: JSON.stringify(serverstate.state, null, 2),
      ephemeral: true
    }, cmd);
  }

  if (cmd === "whereami") {
    return whereami.execute(interaction);
  }

  if (cmd === "linkgamertag") {
    return linkgamertag.execute(interaction);
  }

  if (cmd === "radaradd") {
    return radaradd.execute(interaction);
  }

  if (cmd === "radarremove") {
    return radarremove.execute(interaction);
  }

  if (cmd === "radarview") {
    return radarview.execute(interaction);
  }

  if (cmd === "radaradmin") {
    return radaradmin.execute(interaction);
  }

  if (cmd === "radarignore") {
    return radarignore.execute(interaction);
  }

  if (cmd === "createtoggle") {
    const role = interaction.options.getRole("role", true);
    const panelId = getPanelId(interaction);

    const data = loadToggles();
    data.panels.push({
      panelId,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      messageId: null,
      roleId: role.id,
      roleName: role.name,
      createdBy: interaction.user.id,
      createdAt: new Date().toISOString()
    });
    saveToggles(data);

    const button = new ButtonBuilder()
      .setCustomId(`toggle:${role.id}`)
      .setLabel(role.name)
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(button);

    const msg = await interaction.channel.send({
      content: `Click to toggle **${role.name}**.`,
      components: [row]
    });

    const updated = loadToggles();
    const panel = updated.panels.find(p => p.panelId === panelId);
    if (panel) {
      panel.messageId = msg.id;
      saveToggles(updated);
    }

    return interaction.reply({
      content: `✅ Created toggle panel for **${role.name}**.`,
      ephemeral: true
    });
  }

  if (cmd === "removetoggle") {
    const data = loadToggles();
    const matches = (data.panels || []).filter(p => p.guildId === interaction.guildId && p.channelId === interaction.channelId);

    if (!matches.length) {
      return interaction.reply({ content: "No toggles found in this channel.", ephemeral: true });
    }

    const lines = matches
      .map((p, i) => `${i + 1}. ${p.roleName} (${p.messageId || "no message id"})`)
      .join("\n");

    const first = matches[0];
    if (first && first.messageId) {
      try {
        const msg = await interaction.channel.messages.fetch(first.messageId);
        await msg.delete();
      } catch {}
    }

    data.panels = data.panels.filter(p => !(p.guildId === interaction.guildId && p.channelId === interaction.channelId && p.roleId === first.roleId));
    saveToggles(data);

    return interaction.reply({
      content: `✅ Removed the first toggle found in this channel.\n\nFound:\n${lines}`,
      ephemeral: true
    });
  }

  if (cmd === "shoplist") {
    const items = await shopModule.getShopList();
    debug.step("shoplist", { count: items.length });
    return send({
      reply: items.length
        ? items.map(i => `• ${i.name} (${i.type}) - $${i.price}`).join("\n")
        : "Shop empty"
    });
  }

  if (cmd === "shopadditem") {
    return send(await shopModule.addItem(
      interaction.options.getString("name"),
      interaction.options.getString("type"),
      interaction.options.getInteger("price")
    ));
  }

  if (cmd === "shopbuyitem") {
    const account = await economyModule.getOrCreateAccount(
      interaction.user.id,
      interaction.guildId,
      interaction.user.username
    );
    const method = interaction.options.getString("method") || "wallet";
    const available = method === "bank" ? Number(account.bank || 0) : Number(account.wallet || 0);

    return send(await shopModule.buyItem(
      interaction.options.getString("item"),
      interaction.options.getInteger("quantity"),
      interaction.options.getInteger("x"),
      interaction.options.getInteger("y"),
      interaction.options.getInteger("z"),
      method,
      available,
      interaction.user.id,
      interaction.guildId
    ));
  }

  if (cmd === "shopremoveitem") {
    return send(await shopModule.deleteItem(interaction.options.getString("name")));
  }

  if (cmd === "shopeditprice") {
    return send(await shopModule.editPrice(
      interaction.options.getString("name"),
      interaction.options.getInteger("price")
    ));
  }

  if (cmd === "shopstatus") {
    const items = await shopModule.getShopList();
    const orders = shopModule.getOrders() || [];
    debug.step("shopstatus", { items: items.length, orders: orders.length });
    return send({ reply: `Items: ${items.length}\nOrders: ${orders.length}` });
  }

  if (cmd === "shopreload") {
    return send(await shopModule.reloadData());
  }

  if (cmd === "balance") {
    const targetUser = interaction.options.getUser("member") || interaction.user;
    const account = await economyModule.getOrCreateAccount(targetUser.id, interaction.guildId, targetUser.username);
    const wallet = Number(account.wallet || 0);
    const bank = Number(account.bank || 0);

    return send({
      reply: `${targetUser.username}\nWallet: ${economyModule.formatMoney(wallet)}\nBank: ${economyModule.formatMoney(bank)}\nTotal: ${economyModule.formatMoney(wallet + bank)}`
    });
  }

  if (cmd === "deposit") {
    const amount = interaction.options.getInteger("amount", true);
    if (amount <= 0) return send({ reply: "Deposit amount must be a positive number." });

    try {
      const account = await economyModule.getOrCreateAccount(interaction.user.id, interaction.guildId, interaction.user.username);
      const wallet = Number(account.wallet || 0);

      if (wallet < amount) {
        return send({
          reply: `Insufficient funds. You only have ${economyModule.formatMoney(wallet)} in your wallet.`
        });
      }

      const updated = await economyModule.transferWalletToBank(
        interaction.user.id,
        interaction.guildId,
        amount,
        interaction.user.username,
        { notes: "User deposit" }
      );

      return send({
        reply: `Deposited ${economyModule.formatMoney(amount)}. Wallet: ${economyModule.formatMoney(updated.wallet)} Bank: ${economyModule.formatMoney(updated.bank)}`
      });
    } catch (err) {
      debug.fail("deposit", err, { user: interaction.user?.tag, amount });
      return send({ reply: err.message || "Deposit failed." });
    }
  }

  if (cmd === "withdraw") {
    const amount = interaction.options.getInteger("amount", true);
    if (amount <= 0) return send({ reply: "Withdraw amount must be a positive number." });

    try {
      const account = await economyModule.getOrCreateAccount(interaction.user.id, interaction.guildId, interaction.user.username);
      const bank = Number(account.bank || 0);

      if (bank < amount) {
        return send({
          reply: `Insufficient funds. You only have ${economyModule.formatMoney(bank)} in your bank.`
        });
      }

      const updated = await economyModule.transferBankToWallet(
        interaction.user.id,
        interaction.guildId,
        amount,
        interaction.user.username,
        { notes: "User withdraw" }
      );

      return send({
        reply: `Withdrew ${economyModule.formatMoney(amount)}. Wallet: ${economyModule.formatMoney(updated.wallet)} Bank: ${economyModule.formatMoney(updated.bank)}`
      });
    } catch (err) {
      debug.fail("withdraw", err, { user: interaction.user?.tag, amount });
      return send({ reply: err.message || "Withdraw failed." });
    }
  }

  if (cmd === "send") {
    const member = interaction.options.getUser("member", true);
    const amount = interaction.options.getInteger("amount", true);

    if (amount <= 0) return send({ reply: "Amount must be a positive number." });

    const sender = await economyModule.getOrCreateAccount(interaction.user.id, interaction.guildId, interaction.user.username);
    if (Number(sender.wallet || 0) < amount) {
      return send({ reply: `You only have ${economyModule.formatMoney(sender.wallet)} in your wallet.` });
    }

    const receiver = await economyModule.getOrCreateAccount(member.id, interaction.guildId, member.username);

    const updatedSender = await economyModule.updateAccount(interaction.user.id, interaction.guildId, {
      wallet: Number(sender.wallet || 0) - amount
    });

    const updatedReceiver = await economyModule.updateAccount(member.id, interaction.guildId, {
      wallet: Number(receiver.wallet || 0) + amount
    });

    await economyModule.logTransaction({
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

    await economyModule.logTransaction({
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

    return send({ reply: `Sent ${economyModule.formatMoney(amount)} to ${member.username}.` });
  }

  if (cmd === "leaderboard") {
    const { data, error } = await economyModule.supabase
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
        ? sorted.map((u, i) => `${i + 1}. ${u.username} - ${economyModule.formatMoney(u.total)}`).join("\n")
        : "No economy accounts found yet."
    });
  }

  if (cmd === "daily") {
    return daily.execute(interaction);
  }

  if (cmd === "account") {
    const targetUser = interaction.options.getUser("member") || interaction.user;
    const account = await economyModule.getOrCreateAccount(targetUser.id, interaction.guildId, targetUser.username);
    const wallet = Number(account.wallet || 0);
    const bank = Number(account.bank || 0);

    return send({
      reply: `${targetUser.username}\nWallet: ${economyModule.formatMoney(wallet)}\nBank: ${economyModule.formatMoney(bank)}\nTotal: ${economyModule.formatMoney(wallet + bank)}`
    });
  }

  if (cmd === "addmoney") {
    const member = interaction.options.getUser("member", true);
    const amount = interaction.options.getInteger("amount", true);
    const updated = await economyModule.adminAdjustWallet(
      member.id,
      interaction.guildId,
      amount,
      member.username,
      { notes: `Admin addmoney by ${interaction.user.username}` }
    );
    return send({
      reply: `Added ${economyModule.formatMoney(amount)} to ${member.username}. Wallet now ${economyModule.formatMoney(updated.wallet)}`
    });
  }

  if (cmd === "removemoney") {
    const member = interaction.options.getUser("member", true);
    const amount = interaction.options.getInteger("amount", true);
    const updated = await economyModule.adminAdjustWallet(
      member.id,
      interaction.guildId,
      -amount,
      member.username,
      { notes: `Admin removemoney by ${interaction.user.username}` }
    );
    return send({
      reply: `Removed ${economyModule.formatMoney(amount)} from ${member.username}. Wallet now ${economyModule.formatMoney(updated.wallet)}`
    });
  }

  if (cmd === "resetuser") {
    const member = interaction.options.getUser("member", true);
    const account = await economyModule.getOrCreateAccount(member.id, interaction.guildId, member.username);
    await economyModule.updateAccount(member.id, interaction.guildId, { wallet: 0, bank: 0 });

    await economyModule.logTransaction({
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

module.exports = {
  handleAutocomplete,
  handleButton: handleToggleButton,
  handleCommand,
  serializeOptions,
  replyOnce,
  loadToggles,
  saveToggles,
  getPanelId
};
