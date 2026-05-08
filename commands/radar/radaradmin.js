const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { addRadarAdmin, removeRadarAdmin } = require("../../modules/playerradars");

function replyEphemeral(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("radaradmin")
    .setDescription("Add or remove radar admins.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub
        .setName("add")
        .setDescription("Add a radar admin.")
        .addStringOption(opt =>
          opt.setName("name").setDescription("Radar name").setRequired(true)
        )
        .addUserOption(opt =>
          opt.setName("user").setDescription("User to add").setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("remove")
        .setDescription("Remove a radar admin.")
        .addStringOption(opt =>
          opt.setName("name").setDescription("Radar name").setRequired(true)
        )
        .addUserOption(opt =>
          opt.setName("user").setDescription("User to remove").setRequired(true)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const name = interaction.options.getString("name", true).trim();
    const user = interaction.options.getUser("user", true);

    try {
      if (sub === "add") {
        const res = await addRadarAdmin(name, user.id);
        return replyEphemeral(interaction, res.reply || `Added ${user.tag} as a radar admin.`);
      }

      if (sub === "remove") {
        const res = await removeRadarAdmin(name, user.id);
        return replyEphemeral(interaction, res.reply || `Removed ${user.tag} from radar admins.`);
      }

      return replyEphemeral(interaction, "Invalid subcommand.");
    } catch (err) {
      return replyEphemeral(interaction, err.message || "Failed to update radar admins.");
    }
  }
};
