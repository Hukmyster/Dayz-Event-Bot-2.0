const fs = require("fs");
const path = require("path");
const { MessageFlags, PermissionFlagsBits } = require("discord.js");

const userRouletteBets = new Map();

const shop = require("./modules/shop");
const economy = require("./modules/economy");
const storage = require("./services/storage");
const logger = require("./utils/logger");
const debug = require("./utils/debug");

async function handleReactionRoleButton(interaction) {
  const idPart = String(interaction.customId || "").split(":")[1];
  const id = Number(idPart);
  if (!Number.isInteger(id) || id < 1) {
    return interaction.deferUpdate().catch(() => {});
  }

  await interaction.deferUpdate().catch(() => {});

  const config = await storage.loadJson(`reaction${id}`).catch(() => null);
  if (!config) {
    return;
  }

  if (config.guild_id && config.guild_id !== interaction.guildId) {
    return;
  }

  if (config.message_id && interaction.message?.id && config.message_id !== interaction.message.id) {
    return;
  }

  const guild = interaction.guild;
  const roleId = config.role_id;
  const role =
    guild.roles.cache.get(roleId) ||
    await guild.roles.fetch(roleId).catch(() => null);

  if (!role) {
    return;
  }

  const member =
    interaction.member ||
    await guild.members.fetch(interaction.user.id).catch(() => null);

  if (!member) {
    return;
  }

  const me =
    guild.members.me ||
    await guild.members.fetchMe().catch(() => null);

  if (!me?.permissions?.has?.(PermissionFlagsBits.ManageRoles)) {
    return;
  }

  if (me.roles?.highest?.comparePositionTo?.(role) <= 0) {
    return;
  }

  const hasRole = member.roles.cache.has(role.id);

  try {
    if (hasRole) {
      debug.step("reactionrole", { action: "already", id, role: role.id, user: interaction.user.id });
      return;
    }

    await member.roles.add(role.id);
    debug.step("reactionrole", { action: "add", id, role: role.id, user: interaction.user.id });
    return interaction.followUp({ content: `Added role: ${role.name}`, ephemeral: true }).catch(() => {});
  } catch (err) {
    logger.error("REACTIONROLE BUTTON ERROR", err);
    debug.fail("reactionrole", err, { id, role: role.id, user: interaction.user.id });
    return interaction.followUp({ content: `Failed to update role: ${err.message}`, ephemeral: true }).catch(() => {});
  }
}

async function spinEmbedAnimation(interaction, msg, embed) {
  const displaySpins = [
    "🟢 │ 🟡 │ 🔴",
    "🟡 │ 🔴 │ 🟢",
    "🔴 │ 🟢 │ 🟡",
    "🟢 │ 🟡 │ 🔴",
    "🟡 │ 🔴 │ 🟢"
  ];

  for (const text of displaySpins) {
    await new Promise(r => setTimeout(r, 300));
    embed.description = text;
    await msg.edit({ embeds: [embed] }).catch(() => {});
  }
}

function getWinChance(bet) {
  if (bet <= 500) return 0.48;
  if (bet <= 2000) return 0.40;
  if (bet <= 5000) return 0.35;
  if (bet <= 50000) return 0.25;
  return 0.15;
}

async function getRouletteResult(user, guildId, bet) {
  const maxBet = 100000;
  if (bet > maxBet) throw new Error(`Maximum bet is ${economy.formatMoney(maxBet)}`);

  const account = await economy.getOrCreateAccount(user.id, guildId, user.username);
  const wallet = Number(account.wallet || 0);

  if (wallet < bet) {
    throw new Error(`Insufficient funds. You have ${economy.formatMoney(wallet)}`);
  }

  const winChance = getWinChance(bet);
  const spin = Math.floor(Math.random() * 37);

  let color = "black";
  if (spin === 0) color = "green";
  else if (spin >= 1 && spin <= 18) color = "red";
  else color = "black";

  const win = Math.random() < winChance;

  let multiplier = 1;
  if (win) {
    if (color === "green") multiplier = 10;
    else multiplier = 2;
  }

  const payout = win ? Math.floor(bet * multiplier) : 0;
  const delta = payout - bet;

  return { spin, color, bet, payout, delta, winChance, wallet };
}

async function handleRouletteSpin(interaction) {
  const user = interaction.user;
  const guildId = interaction.guildId;
  const channel = interaction.channel;
  const msg = interaction.message;

  await interaction.deferUpdate();

  const reply = await interaction.followUp({
    content: "Enter your bet amount (1–100000).",
    fetchReply: true
  });

  const collector = channel.createMessageCollector({
    filter: m => m.author.id === user.id,
    max: 1,
    time: 15000
  });

  collector.on("collect", async m => {
    if (!m.content) return m.delete().catch(() => {});
    const amount = Number(m.content.trim().split(/\s+/)[0]);

    m.delete().catch(() => {});

    if (isNaN(amount) || amount < 1 || !Number.isInteger(amount)) {
      return reply.edit({
        content: "Invalid bet. Enter a valid number from 1–100000.",
        components: []
      });
    }

    try {
      const result = await getRouletteResult(user, guildId, amount);
      const { spin, color, bet, payout, delta, winChance, wallet } = result;

      const embed = msg.embeds[0].toJSON();
      await spinEmbedAnimation(interaction, msg, embed);

      const icon = color === "green" ? "🟢" : color === "red" ? "🔴" : "⚫";
      const payoutText = winChance >= 0.35 ? "high" : winChance >= 0.25 ? "medium" : "low";

      embed.description =
        `**Roulette Result**\n` +
        `Bet: ${economy.formatMoney(bet)} (${payoutText} chance - ${Math.round(winChance * 100)}%)\n` +
        `Number: ${icon} ${spin} (${color})\n` +
        `Result: ${delta >= 0 ? "✅ WIN" : "❌ LOSS"}\n\n` +
        `Payout: ${economy.formatMoney(payout)}\n` +
        `Net: ${delta >= 0 ? "+" : ""}${economy.formatMoney(delta)}\n` +
        `Wallet: ${economy.formatMoney(wallet + delta)}`;

      await economy.logTransaction({
        guildId,
        userId: user.id,
        username: user.username,
        type: "roulette_spin",
        amount: delta,
        balanceAfter: wallet + delta,
        metadata: {
          spin,
          color,
          bet,
          payout,
          winChance
        }
      });

      await msg.edit({ embeds: [embed] });
      userRouletteBets.delete(user.id);
      reply.delete().catch(() => {});
    } catch (err) {
      reply.edit({
        content: `❌ Error: ${err.message}`,
        components: []
      }).catch(() => {});
    }
  });

  collector.on("end", (_, reason) => {
    if (reason === "time") {
      reply.delete().catch(() => {});
    }
  });
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

async function handleInteraction(interaction) {
  if (interaction.isAutocomplete()) {
    return handleAutocomplete(interaction);
  }

  if (interaction.isButton()) {
    if (interaction.customId === "roulette:spin") {
      return handleRouletteSpin(interaction);
    }
    if (String(interaction.customId || "").startsWith("reactionrole:")) {
      return handleReactionRoleButton(interaction);
    }
  }

  if (!interaction.isChatInputCommand()) return;

  const cmd = interaction.commandName;

  if (cmd === "reactionrolecreate") {
    const reactionrolecreate = require("./commands/admin/reactionrolecreate");
    return reactionrolecreate.execute(interaction);
  }

  if (cmd === "removetoggle") {
    const removetoggle = require("./commands/admin/removetoggle");
    return removetoggle.execute(interaction);
  }

  debug.start(cmd, { user: interaction.user?.tag });

  const send = (res, label = cmd) =>
    replyOnce(interaction, { content: res.reply || String(res), ephemeral: true }, label);

  const sendError = (msg) =>
    replyOnce(interaction, { content: msg, ephemeral: true });

  const { handleCommand } = require("./indexcommandslist");
  return handleCommand(interaction, send, sendError);
}

module.exports = {
  handleInteraction,
  replyOnce,
  handleAutocomplete
};
