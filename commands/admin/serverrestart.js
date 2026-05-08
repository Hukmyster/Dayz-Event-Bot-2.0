const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { runRestartProcedure } = require('../../restart');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverrestart')
    .setDescription('Run the JSON build, upload, and restart process now.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    try {
      await interaction.reply({
        content: 'Starting server restart process now...',
        ephemeral: true
      });

      await runRestartProcedure('manual');

      return interaction.followUp({
        content: '✅ Server restart process completed.',
        ephemeral: true
      });
    } catch (err) {
      console.error('serverrestart command error:', err);

      const message = `❌ Restart process failed: ${err.message || 'Unknown error'}`;

      if (interaction.replied || interaction.deferred) {
        return interaction.followUp({
          content: message,
          ephemeral: true
        });
      }

      return interaction.reply({
        content: message,
        ephemeral: true
      });
    }
  }
};
