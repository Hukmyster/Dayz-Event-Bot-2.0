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

const { loadToggles, saveToggles, getPanelId } = require("../../indexcommands");

const pendingToggleCreates = new Map(); // key: userId -> { guildId, channelId, roleId, roleName }

function replyEphemeral(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("createtoggle")
    .setDescription("Create a role toggle panel in this channel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  pendingToggleCreates,

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
    } catch (error) {
      console.error("createtoggle command error:", error);
      return replyEphemeral(interaction, error.message || "Failed to start toggle creation.");
    }
  }
};

module.exports.buildToggleModal = function buildToggleModal(userId, roleId, roleName) {
  const modal = new ModalBuilder()
    .setCustomId(`toggle_modal:${userId}:${roleId}`)
    .setTitle(`Create Toggle: ${roleName}`);

  const titleInput = new TextInputBuilder()
    .setCustomId("panel_title")
    .setLabel("Panel title / message")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Example: Click to join the Member role")
    .setRequired(true)
    .setMaxLength(100);

  const row = new ActionRowBuilder().addComponents(titleInput);
  modal.addComponents(row);

  return modal;
};

module.exports.finishToggleCreation = async function finishToggleCreation(interaction, roleId, roleName, title) {
  const button = new (require("discord.js").ButtonBuilder)()
    .setCustomId(`toggle:${roleId}`)
    .setLabel(roleName)
    .setStyle(require("discord.js").ButtonStyle.Success);

  const row = new (require("discord.js").ActionRowBuilder)().addComponents(button);

  const embed = new (require("discord.js").EmbedBuilder)()
    .setTitle(title)
    .setColor(0x57F287)
    .setDescription(`Click the button below to toggle **${roleName}**.`);

  const panelMsg = await interaction.channel.send({
    embeds: [embed],
    components: [row]
  });

  const data = loadToggles();
  data.panels = Array.isArray(data.panels) ? data.panels : [];
  data.panels.push({
    panelId: getPanelId(interaction),
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    messageId: panelMsg.id,
    roleId,
    roleName,
    title,
    createdBy: interaction.user.id,
    createdAt: new Date().toISOString()
  });
  saveToggles(data);

  return panelMsg;
};
