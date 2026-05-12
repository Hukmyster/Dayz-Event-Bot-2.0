const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const storage = require('../../services/storage');
const logger = require('../../utils/logger');
const debug = require('../../utils/debug');

function normalizeKey(input) {
  const key = String(input || '').trim();
  const m = key.match(/^reaction(\d+)$/i);
  if (!m) return null;
  return `reaction${Number(m[1])}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reactionroleremove')
    .setDescription('Remove a reaction role panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option.setName('reaction')
        .setDescription('Reaction key (reaction1, reaction2, ...)')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async execute(interaction) {
    try {
      debug.start('reactionroleremove', { user: interaction.user.tag });
      await interaction.deferReply({ ephemeral: true });

      const key = normalizeKey(interaction.options.getString('reaction', true));
      if (!key) {
        return interaction.editReply({ content: 'Invalid selection.' });
      }

      const config = await storage.loadJson(key).catch(() => null);

      if (config?.guild_id && config.guild_id !== interaction.guildId) {
        return interaction.editReply({ content: 'This reaction role belongs to a different server.' });
      }

      if (config?.channel_id && config?.message_id) {
        const channel = await interaction.client.channels.fetch(config.channel_id).catch(() => null);
        const msg = channel?.messages?.fetch
          ? await channel.messages.fetch(config.message_id).catch(() => null)
          : null;
        if (msg?.delete) await msg.delete().catch(() => {});
      }

      await storage.deleteJson(key).catch(() => {});
      logger.info(`[REACTIONROLE] Removed ${key}`, { key, by: interaction.user.id });
      return interaction.editReply({ content: `✅ Removed **${key}**` });
    } catch (error) {
      logger.error('reactionroleremove error', error);
      debug.fail('reactionroleremove', error);
      const msg = `❌ Failed: ${error.message}`;
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: msg }).catch(() => {});
      } else {
        await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
      }
    }
  }
};
