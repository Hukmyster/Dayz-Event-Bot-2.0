const { SlashCommandBuilder } = require("discord.js");
const casino = require("../../modules/casino/casino");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("addroulette")
    .setDescription("Create a Casino panel in this channel")
    .setDefaultMemberPermissions(0x0000000008),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const msg = await interaction.channel.send({
      embeds: [casino.createCasinoEmbed()],
      components: [casino.createCasinoRow()]
    });

    await interaction.editReply({ content: `✅ Casino panel created: ${msg.url}` });
  }
};
