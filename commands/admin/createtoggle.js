const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require("discord.js");
const storage = require("../../services/storage");

function replyEphemeral(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

async function waitForMessage(interaction, userId, time = 60_000) {
  const filter = m => m.author.id === userId && m.channel.id === interaction.channel.id;
  const collected = await interaction.channel.awaitMessages({ filter, max: 1, time, errors: ["time"] });
  return collected.first();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("createtoggle")
    .setDescription("Create a role toggle panel in this channel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    try {
      if (!interaction.guild || !interaction.channel) {
        return replyEphemeral(interaction, "This command can only be used in a server channel.");
      }

      const roles = interaction.guild.roles.cache
        .filter(r => r.id !== interaction.guild.id && !r.managed)
        .sort((a, b) => a դիրण - b դիրण);

      const roleOptions = roles.map(role => ({
        label: role.name.length > 100 ? role.name.slice(0, 97) + "..." : role.name,
        value: role.id,
        description: role.id
      })).slice(0, 25);

      if (!roleOptions.length) {
        return replyEphemeral(interaction, "No selectable roles were found in this server.");
      }

      const menu = new StringSelectMenuBuilder()
        .setCustomId(`toggle_role_select:${interaction.user.id}`)
        .setPlaceholder("Select a role to toggle")
        .addOptions(roleOptions);

      const row = new ActionRowBuilder().addComponents(menu);

      await interaction.reply({
        content: "Pick the role you want this toggle to give:",
        components: [row],
        flags: MessageFlags.Ephemeral
      });

      const selectionMsg = await interaction.fetchReply();

      const selected = await selectionMsg.awaitMessageComponent({
        time: 60_000,
        filter: i => i.user.id === interaction.user.id && i.customId === `toggle_role_select:${interaction.user.id}`
      });

      const roleId = selected.values[0];
      const role = interaction.guild.roles.cache.get(roleId);

      await selected.update({
        content: `Selected role: **${role.name}**\nNow send the custom button/message text for the toggle panel.`,
        components: []
      });

      const messagePrompt = await waitForMessage(interaction, interaction.user.id, 60_000);
      const panelText = messagePrompt.content.trim();

      if (!panelText) {
        return replyEphemeral(interaction, "No message text was provided. Toggle creation cancelled.");
      }

      const button = new ButtonBuilder()
        .setCustomId(`toggle:${role.id}`)
        .setLabel(role.name)
        .setStyle(ButtonStyle.Success);

      const row2 = new ActionRowBuilder().addComponents(button);

      const embed = new EmbedBuilder()
        .setTitle(panelText)
        .setColor(0x57F287)
        .setDescription(`Click the button below to toggle **${role.name}**.`);

      const panelMsg = await interaction.channel.send({
        embeds: [embed],
        components: [row2]
      });

      await storage.saveJson("toggle", {
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        messageId: panelMsg.id,
        roleId: role.id,
        roleName: role.name,
        title: panelText
      });

      return replyEphemeral(interaction, `✅ Toggle created for **${role.name}**.`);
    } catch (error) {
      console.error("createtoggle command error:", error);
      return replyEphemeral(interaction, error.message || "Failed to create the toggle panel.");
    }
  }
};
