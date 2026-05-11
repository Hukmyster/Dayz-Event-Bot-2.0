const shop = require("./modules/shop");
const economy = require("./modules/economy");
const shopPurchase = require("./modules/shopPurchase");
const daily = require("./commands/shop/daily");
const whereami = require("./commands/economy/whereami");
const linkgamertag = require("./commands/economy/linkgamertag");
const radaradd = require("./commands/radar/radaradd");
const radarremove = require("./commands/radar/radarremove");
const radarview = require("./commands/radar/radarview");
const radaradmin = require("./commands/radar/radaradmin");
const radarignore = require("./commands/radar/radarignore");
const logger = require("./utils/logger");
const debug = require("./utils/debug");

const {
  loadToggles,
  saveToggles,
  getPanelId,
  serializeOptions,
  replyOnce
} = require("./indexcommands");

const {
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  MessageFlags
} = require("discord.js");

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
      flags: MessageFlags.Ephemeral
    });
  }

  if (cmd === "killfeed") {
    return replyOnce(interaction, { content: "Killfeed runs automatically on bot startup.", flags: MessageFlags.Ephemeral });
  }

  if (cmd === "eventfeed") {
    return replyOnce(interaction, { content: "Eventfeed runs automatically on bot startup.", flags: MessageFlags.Ephemeral });
  }

  if (cmd === "serverstate") {
    const serverstate = require("./modules/serverstate");
    return replyOnce(interaction, { content: JSON.stringify(serverstate.state, null, 2), flags: MessageFlags.Ephemeral });
  }

  if (cmd === "whereami") return whereami.execute(interaction);
  if (cmd === "linkgamertag") return linkgamertag.execute(interaction);

  if (cmd === "radaradd") return radaradd.execute(interaction);
  if (cmd === "radarremove") return radarremove.execute(interaction);
  if (cmd === "radarview") return radarview.execute(interaction);
  if (cmd === "radaradmin") return radaradmin.execute(interaction);
  if (cmd === "radarignore") return radarignore.execute(interaction);

  if (cmd === "createtoggle") {
    if (!interaction.guild || !interaction.channel) {
      return replyOnce(interaction, {
        content: "This command can only be used in a server channel.",
        flags: MessageFlags.Ephemeral
      });
    }

    const roles = interaction.guild.roles.cache
      .filter(r => r.id !== interaction.guild.id && !r.managed)
      .sort((a, b) => b.position - a.position)
      .map(role => ({
        label: role.name.slice(0, 100),
        value: role.id,
        description: role.id.slice(0, 100)
      }))
      .slice(0, 25);

    if (!roles.length) {
      return replyOnce(interaction, {
        content: "No selectable roles were found in this server.",
        flags: MessageFlags.Ephemeral
      });
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`toggle_role_select:${interaction.user.id}`)
      .setPlaceholder("Select a role to toggle")
      .addOptions(roles);

    const row = new ActionRowBuilder().addComponents(menu);

    await interaction.reply({
      content: "Pick the role you want this toggle to give:",
      components: [row],
      flags: MessageFlags.Ephemeral
    });

    const promptMsg = await interaction.fetchReply();

    try {
      const selected = await promptMsg.awaitMessageComponent({
        time: 60000,
        filter: i =>
          i.user.id === interaction.user.id &&
          i.customId === `toggle_role_select:${interaction.user.id}`
      });

      const roleId = selected.values[0];
      const role = interaction.guild.roles.cache.get(roleId);

      if (!role) {
        return selected.update({
          content: "That role no longer exists.",
          components: []
        });
      }

      await selected.reply({
      content: `Selected **${role.name}**. Type the panel title below:`,
      flags: MessageFlags.Ephemeral
      });

      const prompt = await interaction.channel.send({
        content: `**${interaction.user.username}** please type the panel title/message now.`
      });

      const collected = await interaction.channel.awaitMessages({
        filter: m =>
          m.author.id === interaction.user.id &&
          m.channel.id === interaction.channel.id,
        max: 1,
        time: 60000
      });

      const message = collected.first();
      await prompt.delete().catch(() => {});

      if (!message) {
        return replyOnce(interaction, {
          content: "Timed out waiting for the toggle message text.",
          flags: MessageFlags.Ephemeral
        });
      }

      const title = message.content.trim();
      await message.delete().catch(() => {});

      if (!title) {
        return replyOnce(interaction, {
          content: "No title/message was provided. Toggle creation cancelled.",
          flags: MessageFlags.Ephemeral
        });
      }

      const button = new ButtonBuilder()
        .setCustomId(`toggle:${role.id}`)
        .setLabel(role.name)
        .setStyle(ButtonStyle.Success);

      const row2 = new ActionRowBuilder().addComponents(button);

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(0x57F287)
        .setDescription(`Click the button below to toggle **${role.name}**.`);

      const panelMsg = await interaction.channel.send({
        embeds: [embed],
        components: [row2]
      });

      const data = loadToggles();
      data.panels = Array.isArray(data.panels) ? data.panels : [];
      data.panels.push({
        panelId: getPanelId(interaction),
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        messageId: panelMsg.id,
        roleId: role.id,
        roleName: role.name,
        title,
        createdBy: interaction.user.id,
        createdAt: new Date().toISOString()
      });
      saveToggles(data);

      return replyOnce(interaction, {
        content: `✅ Toggle created for **${role.name}**.`,
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      return replyOnce(interaction, {
        content: error.message || "Failed to create the toggle panel.",
        flags: MessageFlags.Ephemeral
      });
    }
  }

  if (cmd === "removetoggle") {
    const data = loadToggles();
    const panels = Array.isArray(data.panels) ? data.panels : [];
    const matches = panels.filter(
      p => p.guildId === interaction.guildId && p.channelId === interaction.channelId
    );

    if (!matches.length) {
      return replyOnce(interaction, {
        content: "No toggles found in this channel.",
        flags: MessageFlags.Ephemeral
      });
    }

    const first = matches[0];
    const lines = matches
      .map((p, i) => `${i + 1}. ${p.roleName} (${p.messageId || "no message id"})`)
      .join("\n");

    if (first && first.messageId) {
      try {
        const msg = await interaction.channel.messages.fetch(first.messageId);
        await msg.delete().catch(() => {});
      } catch {}
    }

    data.panels = panels.filter(
      p => !(p.guildId === interaction.guildId && p.channelId === interaction.channelId && p.roleId === first.roleId)
    );
    saveToggles(data);

    return replyOnce(interaction, {
      content: `✅ Removed the first toggle found in this channel.\n\nFound:\n${lines}`,
      flags: MessageFlags.Ephemeral
    });
  }

  if (cmd === "addmoney" || cmd === "removemoney") {
    const target = interaction.options.getUser("member", true);
    const amount = interaction.options.getInteger("amount", true);
    const adminUser = interaction.user.username;

    if (amount <= 0) {
      return send({ reply: "Amount must be greater than 0." });
    }

    const account = await economy.getOrCreateAccount(target.id, interaction.guildId, target.username);
    const wallet = Number(account.wallet || 0);

    const type = cmd === "addmoney" ? "admin_add" : "admin_remove";
    const delta = type === "admin_add" ? amount : -amount;

    if (wallet + delta < 0) {
      return send({ reply: "Insufficient funds. Wallet cannot go negative." });
    }

    const updated = await economy.updateAccount(target.id, interaction.guildId, { wallet: wallet + delta });
    await economy.logTransaction({
      guildId: interaction.guildId,
      userId: target.id,
      username: target.username,
      type: type,
      amount: delta,
      balanceAfter: updated.wallet,
      notes: `Admin ${cmd} by ${adminUser}`,
      metadata: { adminId: interaction.user.id }
    });

    return send({
      reply: `✅ ${cmd === "addmoney" ? "Added" : "Removed"} ${economy.formatMoney(Math.abs(delta))} to/from **${target.username}**.\nWallet: ${economy.formatMoney(updated.wallet)} Bank: ${economy.formatMoney(updated.bank)}`
    });
  }

  if (cmd === "resetuser") {
    const target = interaction.options.getUser("member", true);
    const account = await economy.getOrCreateAccount(target.id, interaction.guildId, target.username);
    const wallet = Number(account.wallet || 0);
    const bank = Number(account.bank || 0);
    const total = wallet + bank;

    const updated = await economy.updateAccount(target.id, interaction.guildId, { wallet: 0, bank: 0 });
    await economy.logTransaction({
      guildId: interaction.guildId,
      userId: target.id,
      username: target.username,
      type: "reset_all",
      amount: total,
      balanceAfter: 0,
      notes: `Admin resetuser by ${interaction.user.username}`,
      metadata: { old_wallet: wallet, old_bank: bank, admin: true }
    });

    return send({
      reply: `✅ Reset **${target.username}** to zero.\nWallet: ${economy.formatMoney(updated.wallet)} Bank: ${economy.formatMoney(updated.bank)}`
    });
  }

  if (cmd === "serverrestart") {
    await interaction.reply({
      content: "Starting server restart process now...",
      flags: MessageFlags.Ephemeral
    });

    try {
      const restart = require("../../restart");
      await restart.runRestartProcedure("manual");
      return interaction.followUp({
        content: "✅ Server restart process completed.",
        flags: MessageFlags.Ephemeral
      });
    } catch (err) {
      debug.fail("serverrestart", err, { user: interaction.user.tag });
      return interaction.followUp({
        content: `❌ Restart process failed: ${err.message || "Unknown error"}`,
        flags: MessageFlags.Ephemeral
      });
    }
  }

  if (cmd === "shoplist") {
    const items = await shop.getShopList();
    debug.step("shoplist", { count: items.length });
    return send({
      reply: items.length ? items.map(i => `• ${i.name} (${i.type}) - $${i.price}`).join("\n") : "Shop empty"
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
    const itemName = interaction.options.getString("item", true);
    const quantity = interaction.options.getInteger("quantity", true);
    const x = interaction.options.getInteger("x", true);
    const y = interaction.options.getInteger("y") ?? 0;
    const z = interaction.options.getInteger("z", true);
    const method = interaction.options.getString("method") || "wallet";
    const attachments = [];

    const result = await shopPurchase.buyItem({
      itemName,
      quantity,
      x,
      y,
      z,
      method,
      playerId: interaction.user.id,
      guildId: interaction.guildId,
      username: interaction.user.username,
      attachments
    });
    return send(result);
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
        return send({ reply: `Insufficient funds. You only have ${economy.formatMoney(wallet)} in your wallet.` });
      }
      const updated = await economy.transferWalletToBank(interaction.user.id, interaction.guildId, amount, interaction.user.username, { notes: "User deposit" });
      return send({ reply: `Deposited ${economy.formatMoney(amount)}. Wallet: ${economy.formatMoney(updated.wallet)} Bank: ${economy.formatMoney(updated.bank)}` });
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
        return send({ reply: `Insufficient funds. You only have ${economy.formatMoney(bank)} in your bank.` });
      }
      const updated = await economy.transferBankToWallet(interaction.user.id, interaction.guildId, amount, interaction.user.username, { notes: "User withdraw" });
      return send({ reply: `Withdrew ${economy.formatMoney(amount)}. Wallet: ${economy.formatMoney(updated.wallet)} Bank: ${economy.formatMoney(updated.bank)}` });
    } catch (err) {
      debug.fail("withdraw", err, { user: interaction.user?.tag });
      return sendError("Withdraw failed.");
    }
  }

  if (cmd === "send") {
    const member = interaction.options.getUser("member", true);
    const amount = interaction.options.getInteger("amount", true);
    if (amount <= 0) return send({ reply: "Amount must be a positive number." });
    try {
      const result = await economy.transferWallet(interaction.user.id, member.id, interaction.guildId, amount, interaction.user.username, member.username);
      return send({ reply: `✅ Sent ${economy.formatMoney(amount)} to **${member.username}**.\nYour new wallet: ${economy.formatMoney(result.sender.wallet)}` });
    } catch (err) {
      debug.fail("send", err, { user: interaction.user?.tag });
      return sendError(err.message || "Send failed.");
    }
  }

  if (cmd === "daily") {
    return daily.execute(interaction);
  }

  return sendError(`Command **${cmd}** is not fully implemented yet.`);
}

module.exports = {
  handleCommand
};
