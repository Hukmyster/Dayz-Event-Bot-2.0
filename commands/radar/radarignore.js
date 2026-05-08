const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { addRadarIgnore, removeRadarIgnore, listRadars } = require("../../modules/playerradars");

function replyEphemeral(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("radarignore")
    .setDescription("Add or remove players from the radar ignore list.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub
        .setName("add")
        .setDescription("Ignore a player.")
        .addStringOption(opt =>
          opt.setName("name").setDescription("Player name").setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("remove")
        .setDescription("Unignore a player.")
        .addStringOption(opt =>
          opt.setName("name").setDescription("Player name").setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("list")
        .setDescription("List ignored players.")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    try {
      if (sub === "list") {
        const radars = await listRadars();
        const radar = radars[0];

        if (!radar) {
          return replyEphemeral(interaction, "No radar config found.");
        }

        const list = Array.isArray(radar.ignore) && radar.ignore.length
          ? radar.ignore.join(", ")
          : "None";

        return replyEphemeral(interaction, `Ignored players: ${list}`);
      }

      const name = interaction.options.getString("name", true).trim();

      if (sub === "add") {
        const res = await addRadarIgnore("default", name);
        return replyEphemeral(interaction, res.reply || `Added ${name} to radar ignore.`);
      }

      if (sub === "remove") {
        const res = await removeRadarIgnore("default", name);
        return replyEphemeral(interaction, res.reply || `Removed ${name} from radar ignore.`);
      }

      return replyEphemeral(interaction, "Invalid subcommand.");
    } catch (err) {
      return replyEphemeral(interaction, err.message || "Failed to update radar ignore list.");
    }
  }
};
