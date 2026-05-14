const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const economy = require('../../modules/economy');
const shop = require('../../modules/shop');
const shopPurchase = require('../../modules/shopPurchase');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shopbuyitem')
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
        .setMinValue(1)
    )
    .addIntegerOption(option =>
      option
        .setName('x')
        .setDescription('X coordinate')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('y')
        .setDescription('Y coordinate (optional, defaults to 0)')
        .setRequired(false)
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

  async autocomplete(interaction) {
    try {
      const focused = interaction.options.getFocused(true);
      if (focused.name !== 'item') return interaction.respond([]);
      const results = await shop.autocomplete(focused.value);
      return interaction.respond(results);
    } catch (error) {
      console.error('shopbuyitem autocomplete error:', error);
      return interaction.respond([]);
    }
  },

  async execute(interaction) {
    try {
      if (!economy.hasAccess?.(interaction.member)) {
        return interaction.reply({
          content: 'You do not have the required role to use shop commands.',
          ephemeral: true
        });
      }

      const itemName = interaction.options.getString('item', true);
      const quantity = interaction.options.getInteger('quantity', true);
      const x = interaction.options.getInteger('x', true);
      const y = interaction.options.getInteger('y') ?? 0;
      const z = interaction.options.getInteger('z', true);
      const method = interaction.options.getString('method') || 'wallet';

      if (quantity <= 0) {
        return interaction.reply({
          content: 'Quantity must be greater than 0.',
          ephemeral: true
        });
      }

      if (quantity > 100) {
        return interaction.reply({
          content: 'Quantity is too large (max 100).',
          ephemeral: true
        });
      }

      const attachmentsEnabled = shop.supportsAttachments(itemName);
      const attachments = [];

      const result = await shopPurchase.buyItem({
        itemName,
        quantity,
        x,
        y,
        z,
        method,
        playerId: interaction.user.id,
        guildId: interaction.guildId,
        username: interaction.user.username,
        attachments
      });

      if (result.reply && result.reply !== `Purchase successful: ${quantity}x ${itemName}`) {
        return interaction.reply({ content: result.reply, ephemeral: true });
      }

      const updatedAccount = await economy.getOrCreateAccount(
        interaction.user.id,
        interaction.guildId,
        interaction.user.username
      );

      const embed = new EmbedBuilder()
        .setTitle('Purchase Queued')
        .setDescription(result.reply || `Queued ${quantity}x ${itemName}.`)
        .addFields(
          { name: 'Item', value: itemName, inline: true },
          { name: 'Quantity', value: String(quantity), inline: true },
          { name: 'Method', value: method, inline: true },
          { name: 'Attachments', value: attachmentsEnabled ? 'Enabled' : 'Disabled', inline: true },
          { name: 'Wallet', value: economy.formatMoney(updatedAccount.wallet), inline: true },
          { name: 'Bank', value: economy.formatMoney(updatedAccount.bank), inline: true },
          { name: 'Location', value: `X: ${x}, Y: ${y}, Z: ${z}`, inline: false }
        )
        .setColor(0x3498db)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('shopbuyitem command error:', error);
      return interaction.reply({
        content: error.message || 'Something went wrong while buying the item.',
        ephemeral: true
      });
    }
  }
};
