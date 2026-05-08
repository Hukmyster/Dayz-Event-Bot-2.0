// commands/admin/addroulette.js
const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("addroulette")
    .setDescription("Create a Roulette game panel in this channel")
    .setDefaultMemberPermissions(0x0000000008), // Administrator only

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const embed = new EmbedBuilder()
      .setTitle("🎲 Roulette")
      .setDescription(
        "**How to play**\n" +
        "1. Click the `Spin` button.\n" +
        "2. Enter a bet amount when asked.\n" +
        "3. The wheel spins and settles on a number.\n\n" +
        "**Payouts**\n" +
        "🟢 Green (0): 10x your bet\n" +
        "🔴 Red   (1-18): 2x your bet\n" +
        "⚫ Black  (19-36): 2x your bet\n\n" +
        "**Win chance by bet size**\n" +
        "• ≤ 500: 48%\n" +
        "• 501-2000: 40%\n" +
        "• 2001-5000: 35%\n" +
        "• 5001-50000: 25%\n" +
        "• 50001-100000: 15%\n\n" +
        "Maximum bet: 100,000.\n" +
        "You must have enough in your wallet for your bet."
      )
      .setColor(0x000000)
      .addFields(
        { name: "Bet", value: "0", inline: true },
        { name: "Number", value: "–", inline: true },
        { name: "Wallet", value: "0", inline: true }
      );

    const spinButton = new ButtonBuilder()
      .setCustomId("roulette:spin")
      .setLabel("🔷 Spin")
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(spinButton);

    const msg = await interaction.channel.send({
      embeds: [embed],
      components: [row]
    });

    await interaction.editReply({ content: `✅ Roulette panel created: ${msg.url}` });
  }
};
