const fs = require("fs");
const path = require("path");

const radarDir = "/dayzps_missions/dayzOffline.chernarusplus/custom/server/radars";

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");

function replyEphemeral(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

async function readRadar(radarName) {
  const filePath = path.join(radarDir, `${radarName}.json`);

  try {
    const text = await fs.promises.readFile(filePath, "utf8");
    const data = JSON.parse(text);

    if (!data.name || !data.x || !data.z || !data.radius) {
      return { ok: false, error: "Invalid radar data." };
    }

    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: `Could not load radar "${radarName}".` };
  }
}

async function writeRadar(data) {
  const filePath = path.join(radarDir, `${data.name}.json`);

  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: "Failed to save radar config." };
  }
}

async function addRadarAdmin(radarName, userId) {
  const res = await readRadar(radarName);
  if (!res.ok) return res;

  const radar = res.data;
  radar.adminId = userId;  // single admin, tied to this file

  const saveRes = await writeRadar(radar);
  if (!saveRes.ok) return saveRes;

  return {
    reply: `✅ ${radar.name} admin is now <@${userId}>.`
  };
}

async function removeRadarAdmin(radarName, userId) {
  const res = await readRadar(radarName);
  if (!res.ok) return res;

  const radar = res.data;
  const wasAdmin = radar.adminId === userId;

  radar.adminId = null;

  const saveRes = await writeRadar(radar);
  if (!saveRes.ok) return saveRes;

  if (!wasAdmin) {
    return { reply: `❌ User is not currently an admin for this radar.` };
  }

  return { reply: `✅ Radar "${radar.name}" admin removed.` };
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
        if (!res.ok) throw new Error(res.error || res.reply);

        return replyEphemeral(interaction, res.reply || `Added ${user.tag} as a radar admin.`);
      }

      if (sub === "remove") {
        const res = await removeRadarAdmin(name, user.id);
        if (!res.ok && !res.reply.includes("not currently")) throw new Error(res.error || res.reply);

        return replyEphemeral(interaction, res.reply || `Removed ${user.tag} from radar admins.`);
      }

      return replyEphemeral(interaction, "Invalid subcommand.");
    } catch (err) {
      return replyEphemeral(interaction, err.message || "Failed to update radar admins.");
    }
  }
};
