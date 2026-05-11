const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionFlagsBits } = require('discord.js');
const storage = require('../../services/storage');
const logger = require('../../utils/logger');
const debug = require('../../utils/debug');

async function getNextReactionId() {
  let id = 1;
  while (await storage.loadJson(`reaction${id}`).catch(() => null)) id++;
  return id;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reactionrolecreate')
    .setDescription('Create a reaction role button')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option => 
      option.setName('message')
        .setDescription('Button label (1-80 chars)')
        .setRequired(true)
        .setMaxLength(80)
    )
    .addRoleOption(option =>
      option.setName('role')
        .setDescription('Role to assign on click')
        .setRequired(true)
    ),

  async execute(interaction) {
    try {
      debug.start('reactionrolecreate', { user: interaction.user.tag });

      await interaction.deferReply({ ephemeral: true });

      const message = interaction.options.getString('message').trim();
      const role = interaction.options.getRole('role');

      if (message.length < 1 || message.length > 80) {
        return interaction.editReply({ content: 'Message must be 1-80 characters.' });
      }

      const id = await getNextReactionId();
      const fileKey = `reaction${id}`;
      const label = message;

      const button = new ButtonBuilder()
        .setCustomId(`reactionrole:${id}`)
        .setLabel(label)
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅');

      const row = new ActionRowBuilder().addComponents(button);

      if (!interaction.channel) {
        return interaction.editReply({ content: 'This command can only be used in a server channel.' });
      }

      let sentMsg;
      try {
        sentMsg = await interaction.channel.send({ components: [row] });
      } catch {
        sentMsg = await interaction.channel.send({ content: '\u200b', components: [row] });
      }

      const config = {
        id,
        guild_id: interaction.guildId,
        channel_id: interaction.channelId,
        message_id: sentMsg.id,
        role_id: role.id,
        role_name: role.name,
        label: message,
        created_by: interaction.user.id,
        created: Date.now()
      };

      await storage.saveJson(fileKey, config);
      logger.info(`[REACTIONROLE] Created ${fileKey}`, config);

      await interaction.editReply({ content: `✅ Created **${fileKey}**` });

      debug.step('reactionrolecreate', { success: true, id });
    } catch (error) {
      logger.error('reactionrolecreate error', error);
      debug.fail('reactionrolecreate', error);
      const msg = `❌ Failed: ${error.message}`;
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: msg }).catch(() => {});
      } else {
        await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
      }
    }
  }
};
