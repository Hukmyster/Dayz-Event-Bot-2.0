const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags
} = require("discord.js");

const { loadToggles, saveToggles, getPanelId } = require("../../indexcommands");

function replyEphemeral(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
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
        .sort((a, b) => b.position - a.position)
        .map(role => ({
          label: role.name.slice(0, 100),
          value: role.id,
          description: role.id.slice(0, 100)
        }))
        .slice(0, 25);

      if (!roles.length) {
        return replyEphemeral(interaction, "No selectable roles were found in this server.");
      }

      const menu = new StringSelectMenuBuilder()
        .setCustomId(`toggle_role_select:${interaction.user.id}`)
        .setPlaceholder("Select a role to toggle")
        .addOptions(roles);

      const row = new ActionRowBuilder().addComponents(menu);

      await interaction.reply({
        content: "Pick the role you want this toggle to give:",
        components: [row],
        flags: MessageFlags.Ephemeral
      });

      const promptMsg = await interaction.fetchReply();

      const selected = await promptMsg.awaitMessageComponent({
        time: 60000,
        filter: i => i.user.id === interaction.user.id && i.customId === `toggle_role_select:${interaction.user.id}`
      });

      const roleId = selected.values[0];
      const role = interaction.guild.roles.cache.get(roleId);

      if (!role) {
        return selected.update({
          content: "That role no longer exists.",
          components: []
        });
      }

      await selected.update({
        content: `Selected role: **${role.name}**\nNow type the custom title/message text for the toggle panel in this channel.`,
        components: []
      });

      const collected = await interaction.channel.awaitMessages({
        filter: m => m.author.id === interaction.user.id && m.channel.id === interaction.channel.id,
        max: 1,
        time: 60000
      });

      const message = collected.first();
      if (!message) {
        return replyEphemeral(interaction, "Timed out waiting for the panel text.");
      }

      const title = message.content.trim();
      await message.delete().catch(() => {});

      if (!title) {
        return replyEphemeral(interaction, "No text was entered.");
      }

      const button = new ButtonBuilder()
        .setCustomId(`toggle:${role.id}`)
        .setLabel(role.name)
        .setStyle(ButtonStyle.Success);

      const buttonRow = new ActionRowBuilder().addComponents(button);

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(0x57F287)
        .setDescription(`Click the button below to toggle **${role.name}**.`);

      const panelMsg = await interaction.channel.send({
        embeds: [embed],
        components: [buttonRow]
      });

      const data = loadToggles();
      data.panels = Array.isArray(data.panels) ? data.panels : [];
      data.panels.push({
        panelId: getPanelId(interaction),
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        messageId: panelMsg.id,
        roleId: role.id,
        roleName: role.name,
        title,
        createdBy: interaction.user.id,
        createdAt: new Date().toISOString()
      });
      saveToggles(data);

      return replyEphemeral(interaction, `✅ Toggle created for **${role.name}**.`);
    } catch (error) {
      console.error("createtoggle command error:", error);
      return replyEphemeral(interaction, error.message || "Failed to start toggle creation.");
    }
  }
};
