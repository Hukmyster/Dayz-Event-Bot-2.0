const { MessageFlags, PermissionFlagsBits } = require("discord.js");

const shop = require("./modules/shop");
const storage = require("./services/storage");
const logger = require("./utils/logger");
const debug = require("./utils/debug");
const casino = require("./modules/casino/casino");

async function handleReactionRoleButton(interaction) {
  const idPart = String(interaction.customId || "").split(":")[1];
  const id = Number(idPart);
  if (!Number.isInteger(id) || id < 1) {
    return interaction.deferUpdate().catch(() => {});
  }

  await interaction.deferUpdate().catch(() => {});

  const config = await storage.loadJson(`reaction${id}`).catch(() => null);
  if (!config) return;

  if (config.guild_id && config.guild_id !== interaction.guildId) return;
  if (config.message_id && interaction.message?.id && config.message_id !== interaction.message.id) return;

  const guild = interaction.guild;
  const roleId = config.role_id;
  const role =
    guild.roles.cache.get(roleId) ||
    await guild.roles.fetch(roleId).catch(() => null);

  if (!role) return;

  const member =
    interaction.member ||
    await guild.members.fetch(interaction.user.id).catch(() => null);

  if (!member) return;

  const me =
    guild.members.me ||
    await guild.members.fetchMe().catch(() => null);

  if (!me?.permissions?.has?.(PermissionFlagsBits.ManageRoles)) return;
  if (me.roles?.highest?.comparePositionTo?.(role) <= 0) return;

  const hasRole = member.roles.cache.has(role.id);

  try {
    if (hasRole) {
      debug.step("reactionrole", { action: "already", id, role: role.id, user: interaction.user.id });
      return;
    }

    await member.roles.add(role.id);
    debug.step("reactionrole", { action: "add", id, role: role.id, user: interaction.user.id });
    return;
  } catch (err) {
    logger.error("REACTIONROLE BUTTON ERROR", err);
    debug.fail("reactionrole", err, { id, role: role.id, user: interaction.user.id });
    return;
  }
}

async function handleAutocomplete(interaction) {
  const cmd = interaction.commandName;
  const focused = interaction.options.getFocused();
  const query = typeof focused === "string" ? focused : "";

  debug.step("autocomplete", { cmd, query });

  const results = await shop.autocomplete(query);
  logger.interaction({ type: "autocomplete", query, results });
  debug.step("autocomplete", { cmd, query, resultsCount: results.length });

  return interaction.respond(results.slice(0, 25)).catch(err => {
    logger.error("AUTOCOMPLETE ERROR", err);
    debug.fail("autocomplete", err, { cmd, query });
  });
}

async function handleInteraction(interaction) {
  if (interaction.isAutocomplete()) {
    return handleAutocomplete(interaction);
  }

  const casinoResult = await casino.handleCasinoInteraction(interaction).catch(() => false);
  if (casinoResult) return casinoResult;

  if (interaction.isButton()) {
    if (String(interaction.customId || "").startsWith("reactionrole:")) {
      return handleReactionRoleButton(interaction);
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

module.exports = {
  handleInteraction,
  replyOnce,
  handleAutocomplete
};
