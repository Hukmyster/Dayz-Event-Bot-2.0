const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require("discord.js");
const casino = require("../../modules/casino/casino");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("addroulette")
    .setDescription("Create a Roulette game panel in this channel")
    .setDefaultMemberPermissions(0x0000000008),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const embed = casino.roulette?.createLauncherEmbed
      ? casino.roulette.createLauncherEmbed()
      : new EmbedBuilder()
          .setTitle("🎲 Roulette")
          .setDescription("Click **Play** to start your private roulette session.")
          .setColor(0x000000);

    const playButton = new ButtonBuilder()
      .setCustomId("casino:roulette:play")
      .setLabel("🎮 Play")
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(playButton);

    const msg = await interaction.channel.send({
      embeds: [embed],
      components: [row]
    });

    await interaction.editReply({ content: `✅ Roulette panel created: ${msg.url}` });
  }
};
