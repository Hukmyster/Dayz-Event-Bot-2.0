const fs = require("fs");
const path = require("path");
const { MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

// Roulette state (per-user bet cache)
const userRouletteBets = new Map(); // userId -> bet

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

// Text‑based spinner animation (1.5–2s)
async function spinEmbedAnimation(interaction, msg, embed) {
  const displaySpins = [
    "🟢 │ 🟡 │ 🔴",
    "🟡 │ 🔴 │ 🟢",
    "🔴 │ 🟢 │ 🟡",
    "🟢 │ 🟡 │ 🔴",
    "🟡 │ 🔴 │ 🟢"
  ];

  for (const text of displaySpins) {
    await new Promise(r => setTimeout(r, 300)); // 0.3s per frame
    embed.description = text;
    await msg.edit({ embeds: [embed] }).catch(() => {});
  }
}

function getWinChance(bet) {
  if (bet <= 500) return 0.48;
  if (bet <= 2000) return 0.40;
  if (bet <= 5000) return 0.35;
  if (bet <= 50000) return 0.25;
  return 0.15; // 50001–100000
}

async function getRouletteResult(user, guildId, bet) {
  const maxBet = 100000;
  if (bet > maxBet) {
    throw new Error(`Maximum bet is ${economy.formatMoney(maxBet)}`);
  }

  const account = await economy.getOrCreateAccount(user.id, guildId, user.username);
  const wallet = Number(account.wallet || 0);

  if (wallet < bet) {
    throw new Error(`Insufficient funds. You have ${economy.formatNormally(wallet)}`);
  }

  const winChance = getWinChance(bet);
  const spin = Math.floor(Math.random() * 37); // 0–36

  // 0 = green, 1–18 = red, 19–36 = black
  let color = "black";
  if (spin === 0) {
    color = "green";
  } else if (spin >= 1 && spin <= 18) {
    color = "red";
  } else if (spin >= 19 && spin <= 36) {
    color = "black";
  }

  const winRoll = Math.random();
  const win = winRoll < winChance;

  let multiplier = 1; // default loss
  if (win) {
    if (color === "green" && spin === 0) {
      multiplier = 10;
    } else if (color === "red" && spin >= 1 && spin <= 18) {
      multiplier = 2;
    } else if (color === "black" && spin >= 19 && spin <= 36) {
      multiplier = 2;
    }
  }

  const payout = win ? Math.floor(bet * multiplier) : 0;
  const delta = payout - bet;

  return { spin, color, bet, payout, delta, winChance };
}

async function handleRouletteSpin(interaction) {
  const user = interaction.user;
  const guildId = interaction.guildId;
  const channel = interaction.channel;
  const msg = interaction.message;

  await interaction.deferUpdate(); // Just acknowledge the button click

  // Ask for bet amount (ephemeral)
  const reply = await interaction.followUp({
    content: "Enter your bet amount (1–100000).",
    fetchReply: true
  });

  const collector = channel.createMessageCollector({
    filter: m => m.author.id === user.id,
    max: 1,
    time: 15000 // 15s timeout
  });

  collector.on("collect", async m => {
    if (!m.content) return m.delete().catch(() => {});
    const text = m.content.trim();
    const amount = Number(text.split(/\s+/)[0]); // Handle possible extra text

    m.delete().catch(() => {});

    if (isNaN(amount) || amount < 1 || !Number.isInteger(amount)) {
      return reply.edit({
        content: "Invalid bet. Enter a valid number from 1–100000.",
        components: []
      });
    }

    try {
      const result = await getRouletteResult(user, guildId, amount);
      const { spin, color, bet, payout, delta, winChance } = result;

      // Text‑based spin animation (1.5–2s)
      const embed = msg.embeds[0].toJSON();
      await spinEmbedAnimation(interaction, msg, embed);

      // Final result
      const icon = color === "green" ? "🟢" : color === "red" ? "🔴" : "⚫";
      const payoutText = winChance >= 0.35 ? "high" : winChance >= 0.25 ? "medium" : "low";

      embed.description =
        `**Roulette Result**\n` +
        `Bet: ${economy.formatMoney(bet)} (${payoutText} chance - ${Math.round(winChance * 100)}%)\n` +
        `Number: ${icon} ${spin} (${color})\n` +
        `Result: ${delta >= 0 ? "✅ WIN" : "❌ LOSS"}\n\n` +
        `Payout: ${economy.formatMoney(payout)}\n` +
        `Net: ${delta >= 0 ? "+" : ""}${economy.formatMoney(delta)}\n` +
        `Wallet: ${economy.formatMoney(account.wallet + delta)}`;

      // Log transaction
      await economy.logTransaction({
        guildId,
        userId: user.id,
        username: user.username,
        type: "roulette_spin",
        amount: delta,
        balanceAfter: account.wallet + delta,
        metadata: {
          spin,
          color,
          bet,
          payout,
          winChance
        }
      });

      // Update message
      await msg.edit({ embeds: [embed] });

      // Clear user's bet
      userRouletteBets.delete(user.id);

      // Cleanup reply
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

async function handleInteraction(interaction) {
  if (interaction.isAutocomplete()) {
    return handleAutocomplete(interaction);
  }

  if (interaction.isButton()) {
    // Handle role toggle buttons
    const handled = await handleToggleButton(interaction);
    if (handled !== false) return handled;

    // Handle Roulette button
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
  serializeOptions,
  replyOnce,
  loadToggles,
  saveToggles,
  getPanelId,
  handleAutocomplete,
  handleButton: handleToggleButton
};
