const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags
} = require("discord.js");

const { pendingToggleCreates, buildToggleModal } = require("../../indexcommands");

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

      pendingToggleCreates.set(interaction.user.id, {
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        roleId,
        roleName: role.name
      });

      const modal = buildToggleModal(interaction.user.id, role.id, role.name);
      await selected.showModal(modal);

      return;
    } catch (error) {
      console.error("createtoggle command error:", error);
      return replyEphemeral(interaction, error.message || "Failed to start toggle creation.");
    }
  }
};
