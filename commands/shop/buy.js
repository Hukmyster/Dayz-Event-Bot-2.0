const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const economy = require('../../modules/economy');
const shop = require('../../modules/shop');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Buy an item from the shop')
    .addStringOption(option =>
      option
        .setName('item')
        .setDescription('Item name')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addIntegerOption(option =>
      option
        .setName('quantity')
        .setDescription('Quantity')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('x')
        .setDescription('X coordinate')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('z')
        .setDescription('Z coordinate')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('method')
        .setDescription('Purchase method')
        .setRequired(false)
        .addChoices(
          { name: 'Wallet', value: 'wallet' },
          { name: 'Bank', value: 'bank' }
        )
    ),

  async execute(interaction) {
    try {
      if (!economy.hasAccess(interaction.member)) {
        return interaction.reply({
          content: 'You do not have the required role to use economy commands.',
          ephemeral: true
        });
      }

      const itemName = interaction.options.getString('item', true);
      const quantity = interaction.options.getInteger('quantity', true);
      const x = interaction.options.getInteger('x', true);
      const z = interaction.options.getInteger('z', true);
      const method = interaction.options.getString('method') || 'wallet';

      if (quantity <= 0) {
        return interaction.reply({
          content: 'Quantity must be greater than 0.',
          ephemeral: true
        });
      }

      const items = await shop.getShopList();
      const item = items.find(i =>
        i.name.toLowerCase() === itemName.toLowerCase() ||
        i.name.toLowerCase().includes(itemName.toLowerCase())
      );

      if (!item) {
        return interaction.reply({
          content: 'Item not found.',
          ephemeral: true
        });
      }

      const totalCost = Number(item.price || 0) * Number(quantity || 0);
      const account = await economy.getOrCreateAccount(
        interaction.user.id,
        interaction.guildId,
        interaction.user.username
      );

      const available = method === 'bank'
        ? Number(account.bank || 0)
        : Number(account.wallet || 0);

      if (available < totalCost) {
        return interaction.reply({
          content: `You cannot afford this purchase using your ${method}. Cost: ${economy.formatMoney(totalCost)}. Available: ${economy.formatMoney(available)}.`,
          ephemeral: true
        });
      }

      const updated = await economy.chargeByMethod(
        interaction.user.id,
        interaction.guildId,
        totalCost,
        method,
        interaction.user.username,
        {
          notes: `Buy ${quantity}x ${item.name} using ${method}`,
          item: item.name,
          item_type: item.type,
          quantity,
          x,
          z
        }
      );

      const orderResult = await shop.buyItem(item.name, quantity, x, z);

      const embed = new EmbedBuilder()
        .setTitle('Purchase Queued')
        .setDescription(orderResult.reply || `Queued ${quantity}x ${item.name}.`)
        .addFields(
          { name: 'Item', value: item.name, inline: true },
          { name: 'Quantity', value: String(quantity), inline: true },
          { name: 'Total Cost', value: economy.formatMoney(totalCost), inline: true },
          { name: 'Method', value: method, inline: true },
          { name: 'Wallet', value: economy.formatMoney(updated.wallet), inline: true },
          { name: 'Bank', value: economy.formatMoney(updated.bank), inline: true }
        )
        .setColor(0x3498db)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('buy command error:', error);
      return interaction.reply({
        content: error.message || 'Something went wrong while buying the item.',
        ephemeral: true
      });
    }
  }
};
