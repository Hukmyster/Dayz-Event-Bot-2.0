const shop = require("./modules/shop");
const economy = require("./modules/economy");
const daily = require("./commands/shop/daily");
const whereami = require("./commands/economy/whereami");
const linkgamertag = require("./commands/economy/linkgamertag");
const radaradd = require("./commands/radar/radaradd");
const radarremove = require("./commands/radar/radarremove");
const radarview = require("./commands/radar/radarview");
const radaradmin = require("./commands/radar/radaradmin");
const radarignore = require("./commands/radar/radarignore");
const createtoggle = require("./commands/admin/createtoggle");
const removetoggle = require("./commands/admin/removetoggle");
const serverstate = require("./modules/serverstate");
const logger = require("./utils/logger");
const debug = require("./utils/debug");

const { loadToggles, saveToggles, getPanelId, serializeOptions, replyOnce } = require("./indexcommands");
const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require("discord.js");

async function handleCommand(interaction, send, sendError) {
  const cmd = interaction.commandName;
  const opts = serializeOptions(interaction);

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
    });
  }

  if (cmd === "killfeed") {
    return replyOnce(interaction, {
      content: "Killfeed runs automatically on bot startup.",
      ephemeral: true
    });
  }

  if (cmd === "eventfeed") {
    return replyOnce(interaction, {
      content: "Eventfeed runs automatically on bot startup.",
      ephemeral: true
    });
  }

  if (cmd === "serverstate") {
    return replyOnce(interaction, {
      content: JSON.stringify(serverstate.state, null, 2),
      ephemeral: true
    });
  }

  if (cmd === "whereami") return whereami.execute(interaction);
  if (cmd === "linkgamertag") return linkgamertag.execute(interaction);

  if (cmd === "radaradd") return radaradd.execute(interaction);
  if (cmd === "radarremove") return radarremove.execute(interaction);
  if (cmd === "radarview") return radarview.execute(interaction);
  if (cmd === "radaradmin") return radaradmin.execute(interaction);
  if (cmd === "radarignore") return radarignore.execute(interaction);

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
    const items = await shop.getShopList();
    debug.step("shoplist", { count: items.length });
    return send({
      reply: items.length
        ? items.map(i => `• ${i.name} (${i.type}) - $${i.price}`).join("\n")
        : "Shop empty"
    });
  }

  if (cmd === "shopadditem") {
    return send(await shop.addItem(
      interaction.options.getString("name"),
      interaction.options.getString("type"),
      interaction.options.getInteger("price")
    ));
  }

  if (cmd === "shopbuyitem") {
    const account = await economy.getOrCreateAccount(
      interaction.user.id,
      interaction.guildId,
      interaction.user.username
    );
    const method = interaction.options.getString("method") || "wallet";
    const available = method === "bank" ? Number(account.bank || 0) : Number(account.wallet || 0);

    return send(await shop.buyItem(
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
    return send(await shop.deleteItem(interaction.options.getString("name")));
  }

  if (cmd === "shopeditprice") {
    return send(await shop.editPrice(
      interaction.options.getString("name"),
      interaction.options.getInteger("price")
    ));
  }

  if (cmd === "shopstatus") {
    const items = await shop.getShopList();
    const orders = shop.getOrders() || [];
    debug.step("shopstatus", { items: items.length, orders: orders.length });
    return send({ reply: `Items: ${items.length}\nOrders: ${orders.length}` });
  }

  if (cmd === "shopreload") {
    return send(await shop.reloadData());
  }

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
    if (amount <= 0) return send({ reply: "Deposit amount must be a positive number." });

    try {
      const account = await economy.getOrCreateAccount(interaction.user.id, interaction.guildId, interaction.user.username);
      const wallet = Number(account.wallet || 0);

      if (wallet < amount) {
        return send({
          reply: `Insufficient funds. You only have ${economy.formatMoney(wallet)} in your wallet.`
        });
      }

      const updated = await economy.transferWalletToBank(
        interaction.user.id,
        interaction.guildId,
        amount,
        interaction.user.username,
        { notes: "User deposit" }
      );

      return send({
        reply: `Deposited ${economy.formatMoney(amount)}. Wallet: ${economy.formatMoney(updated.wallet)} Bank: ${economy.formatMoney(updated.bank)}`
      });
    } catch (err) {
      debug.fail("deposit", err, { user: interaction.user?.tag });
      return sendError("Deposit failed.");
    }
  }

  if (cmd === "withdraw") {
    const amount = interaction.options.getInteger("amount", true);
    if (amount <= 0) return send({ reply: "Withdraw amount must be a positive number." });

    try {
      const account = await economy.getOrCreateAccount(interaction.user.id, interaction.guildId, interaction.user.username);
      const bank = Number(account.bank || 0);

      if (bank < amount) {
        return send({
          reply: `Insufficient funds. You only have ${economy.formatMoney(bank)} in your bank.`
        });
      }

      const updated = await economy.transferBankToWallet(
        interaction.user.id,
        interaction.guildId,
        amount,
        interaction.user.username,
        { notes: "User withdraw" }
      );

      return send({
        reply: `Withdrew ${economy.formatMoney(amount)}. Wallet: ${economy.formatMoney(updated.wallet)} Bank: ${economy.formatMoney(updated.bank)}`
      });
    } catch (err) {
      debug.fail("withdraw", err, { user: interaction.user?.tag });
      return sendError("Withdraw failed.");
    }
  }

  if (cmd === "send") {
    const member = interaction.options.getUser("member", true);
    const amount = interaction.options.getInteger("amount", true);

    if (amount <= 0) return send({ reply: "Amount must be a positive number." });

    const sender = await economy.getOrCreateAccount(interaction.user.id, interaction.guildId, interaction.user.username);
    if (Number(sender.wallet || 0) < amount) {
      return send({ reply: `You only have ${economy.formatMoney(sender.wallet)} in your wallet.` });
    }

    const receiver = await economy.getOrCreateAccount(member.id, interaction.guildId, member.username);

    const updatedSender = await economy.updateAccount(interaction.user.id, interaction.guildId, {
