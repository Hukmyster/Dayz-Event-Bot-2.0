const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType } = require('discord.js');
const economy = require('../../modules/economy');
const shop = require('../../modules/shop');
const shopPurchase = require('../../modules/shopPurchase');

const useLocationRow = new ActionRowBuilder()
  .addComponents(
    new ButtonBuilder()
      .setCustomId('use_location')
      .setLabel('Use my last position')
      .setStyle(ButtonStyle.Primary)
  );

const modalId = 'shopbuy_location_modal';
const xId = 'shopbuy_x';
const yId = 'shopbuy_y';
const zId = 'shopbuy_z';

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
      if (!economy.hasAccess(interaction.member)) {
        return interaction.reply({
          content: 'You do not have the required role to use shop commands.',
          ephemeral: true
        });
      }

      const itemName = interaction.options.getString('item', true);
      const quantity = interaction.options.getInteger('quantity', true);
      let x = interaction.options.getInteger('x', true);
      let y = interaction.options.getInteger('y') ?? null;
      let z = interaction.options.getInteger('z', true);
      const method = interaction.options.getString('method') || 'wallet';

      if (quantity <= 0) {
        return interaction.reply({
          content: 'Quantity must be greater than 0.',
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
          { name: 'Location', value: `X: ${x}, Y: ${y ?? 0}, Z: ${z}`, inline: false }
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
  },


  async handleButton(interaction) {
    if (interaction.customId !== 'use_location') return;

    try {
      const last = await getPlayerLastLocation(interaction.user.id, interaction.guildId);
      if (!last) {
        return interaction.reply({
          content: 'No recent location found for you. Please enter coordinates manually.',
          ephemeral: true
        });
      }

      const modal = new ModalBuilder()
        .setCustomId(modalId)
        .setTitle('Confirm Coordinates');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(xId)
            .setLabel('X Coordinate')
            .setStyle(TextInputStyle.Short)
            .setValue(String(last.x))
            .setRequired(true)
        )
      );

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(yId)
            .setLabel('Y Coordinate (optional)')
            .setStyle(TextInputStyle.Short)
            .setValue(String(last.y ?? 0))
            .setRequired(false)
        )
      );

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(zId)
            .setLabel('Z Coordinate')
            .setStyle(TextInputStyle.Short)
            .setValue(String(last.z))
            .setRequired(true)
        )
      );

      await interaction.showModal(modal);
    } catch (err) {
      console.error('shopbuyitem use_location modal error:', err);
      await interaction.reply({
        content: 'An error occurred while fetching your location.',
        ephemeral: true
      });
    }
  },


  async handleModal(interaction) {
    if (interaction.customId !== modalId) return;

    const fields = {
      x: interaction.fields.getTextInputValue(xId),
      y: interaction.fields.getTextInputValue(yId) || null,
      z: interaction.fields.getTextInputValue(zId)
    };

    const x = Number(fields.x);
    const y = fields.y ? Number(fields.y) : null;
    const z = Number(fields.z);

    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      return interaction.reply({
        content: 'Please provide valid X and Z coordinates.',
        ephemeral: true
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('Coordinates Set')
      .setDescription(`Using location: X=${x}, Y=${y ?? 0}, Z=${z} for your next purchase.`)
      .setColor(0x2ecc71);

    await interaction.reply({ embeds: [embed], ephemeral: true });

    interaction.client.lastLocationCache = interaction.client.lastLocationCache || {};
    interaction.client.lastLocationCache[`${interaction.user.id}-${interaction.guildId}`] = { x, y, z };
  }
};


async function getPlayerLastLocation(userId, guildId) {
  const cached = await (async () => {
    const k = `${userId}-${guildId}`;
    const cache = global.locationCache || (global.locationCache = {});
    if (cache[k]?.expiresAt > Date.now()) return cache[k].data;
    return null;
  })();

  if (cached) return cached;

  const now = Date.now();
  const thirtyMinsAgo = now - 30 * 60 * 1000;

  const rows = await getNitradoLogEntries(userId, guildId, thirtyMinsAgo);
  const latest = rows
    .filter(r => r.timestamp >= thirtyMinsAgo)
    .sort((a, b) => b.timestamp - a.timestamp)[0];

  if (!latest) return null;

  const data = {
    x: Number(latest.location_x) || 0,
    y: Number(latest.location_y) || 0,
    z: Number(latest.location_z) || 0
  };

  const cache = global.locationCache || (global.locationCache = {});
  const k = `${userId}-${guildId}`;
  cache[k] = {
    data,
    expiresAt: now + 5 * 60 * 1000
  };

  return data;
}

async function getNitradoLogEntries(userId, guildId, fromTimestamp) {
  return []; // stub; you’ll plug in your real Nitrado log reader here
}
