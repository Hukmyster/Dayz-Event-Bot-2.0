const fs = require("fs");
const path = require("path");
const { MessageFlags } = require("discord.js");

const userRouletteBets = new Map();

const shop = require("./modules/shop");
const economy = require("./modules/economy");
const logger = require("./utils/logger");
const debug = require("./utils/debug");

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
  }

  if (!interaction.isChatInputCommand()) return;

  const cmd = interaction.commandName;
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
