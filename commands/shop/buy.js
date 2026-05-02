const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const economy = require('../../modules/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Buy an item from the shop')
    .addStringOption(option =>
      option
        .setName('item')
        .setDescription('The item you want to buy')
        .setRequired(true)
    ),

  async execute(interaction) {
    try {
      if (!economy.hasAccess(interaction.member)) {
        return interaction.reply({
          content: 'You do not have the required role to use shop commands.',
          ephemeral: true
        });
      }

      const itemName = interaction.options.getString('item', true).trim();
      const guildId = interaction.guildId;
      const userId = interaction.user.id;
      const username = interaction.user.username;

      const shopItem = await economy.findShopItemByName(itemName);

      if (!shopItem) {
        return interaction.reply({
          content: `I could not find an item called "${itemName}".`,
          ephemeral: true
        });
      }

      const account = await economy.getOrCreateAccount(userId, guildId, username);
      const price = Number(shopItem.price || 0);
      const wallet = Number(account.wallet || 0);

      if (wallet < price) {
        return interaction.reply({
          content: `You need ${economy.formatMoney(price)}, but you only have ${economy.formatMoney(wallet)}.`,
          ephemeral: true
        });
      }

      await economy.chargeWallet(userId, guildId, price, username, {
        notes: `Purchased ${shopItem.name}`,
        item_id: shopItem.id,
        item_name: shopItem.name
      });

      const updatedAccount = await economy.getAccount(userId, guildId);

      const embed = new EmbedBuilder()
        .setTitle('Purchase successful')
        .setDescription(`You bought **${shopItem.name}** for **${economy.formatMoney(price)}**.`)
        .addFields(
          { name: 'Wallet', value: economy.formatMoney(updatedAccount.wallet), inline: true },
          { name: 'Item', value: shopItem.name, inline: true }
        )
        .setColor(0x2ecc71)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('buy command error:', error);
      return interaction.reply({
        content: 'Something went wrong while processing that purchase.',
        ephemeral: true
      });
    }
  }
};
