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

async function handleInteraction(interaction) {
  if (interaction.isAutocomplete()) {
    return handleAutocomplete(interaction);
  }

  if (interaction.isButton()) {
    const handled = await handleToggleButton(interaction);
    if (handled !== false) return handled;
  }

  if (!interaction.isChatInputCommand()) return;

  const cmd = interaction.commandName;
  debug.start(cmd, { user: interaction.user?.tag });

  const send = (res, label = cmd) =>
    replyOnce(interaction, { content: res.reply || String(res), ephemeral: true }, label);

  const sendError = (msg) =>
    replyOnce(interaction, { content: msg, ephemeral: true });

  // Defer the big body to indexcommandslist
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
