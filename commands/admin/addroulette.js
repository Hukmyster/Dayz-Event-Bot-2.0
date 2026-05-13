const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("addroulette")
    .setDescription("Create a Roulette game panel in this channel")
    .setDefaultMemberPermissions(0x0000000008),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const embed = new EmbedBuilder()
      .setTitle("🎲 Roulette")
      .setDescription(
        "**How to play**\n" +
        "1. Click the `Play` button.\n" +
        "2. Open your private session.\n" +
        "3. Set bet amount, choose bet type, then spin.\n\n" +
        "**Payouts**\n" +
        "🟢 Green (0): 10x your bet\n" +
        "🔴 Red (1-18): 2x your bet\n" +
        "⚫ Black (19-36): 2x your bet\n\n" +
        "**Session**\n" +
        "• Each player gets their own private session.\n" +
        "• You can spin again and change your bet anytime before timeout.\n" +
        "• Session expires after inactivity.\n\n" +
        "Maximum bet: 100,000.\n" +
        "You must have enough in your wallet for your bet."
      )
      .setColor(0x000000)
      .addFields(
        { name: "Bet", value: "0", inline: true },
        { name: "Number", value: "–", inline: true },
        { name: "Wallet", value: "0", inline: true }
      );

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
