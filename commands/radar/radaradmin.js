const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const storage = require("../../services/storage");

function replyEphemeral(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

async function loadRadars() {
  const data = await storage.loadJson("radars");
  if (Array.isArray(data)) {
    const obj = {};
    for (const radar of data) {
      if (radar?.name) obj[radar.name] = radar;
    }
    return obj;
  }
  return data && typeof data === "object" ? data : {};
}

async function saveRadars(radars) {
  await storage.saveJson("radars", radars);
}

function normalizeRadar(radar) {
  if (!radar || typeof radar !== "object") return null;
  radar.admins = Array.isArray(radar.admins) ? radar.admins : [];
  radar.ignore = Array.isArray(radar.ignore) ? radar.ignore : [];
  radar.ignored = Array.isArray(radar.ignored) ? radar.ignored : [];
  return radar;
}

async function readRadar(radarName) {
  const radars = await loadRadars();
  const radar = normalizeRadar(radars[String(radarName || "").trim()]);
  if (!radar) return { ok: false, error: `Could not load radar "${radarName}".` };
  return { ok: true, data: radar, radars };
}

async function writeRadar(radars, data) {
  radars[data.name] = normalizeRadar(data);
  await saveRadars(radars);
  return { ok: true };
}

async function addRadarAdmin(radarName, userId) {
  const res = await readRadar(radarName);
  if (!res.ok) return res;

  const radar = res.data;
  radar.adminId = userId;
  if (!radar.admins.includes(userId)) radar.admins.push(userId);

  const saveRes = await writeRadar(res.radars, radar);
  if (!saveRes.ok) return saveRes;

  return { reply: `✅ ${radar.name} admin is now <@${userId}>.`, success: true };
}

async function removeRadarAdmin(radarName, userId) {
  const res = await readRadar(radarName);
  if (!res.ok) return res;

  const radar = res.data;
  const wasAdmin = radar.adminId === userId;

  radar.adminId = null;
  radar.admins = radar.admins.filter(id => id !== userId);

  const saveRes = await writeRadar(res.radars, radar);
  if (!saveRes.ok) return saveRes;

  if (!wasAdmin) {
    return { reply: `❌ User is not currently an admin for this radar.`, success: false };
  }

  return { reply: `✅ Radar "${radar.name}" admin removed.`, success: true };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("radaradmin")
    .setDescription("Add or remove radar admins and transfer ownership.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub
        .setName("add")
        .setDescription("Add or transfer radar admin.")
        .addStringOption(opt =>
          opt.setName("name").setDescription("Radar name").setRequired(true)
        )
        .addUserOption(opt =>
          opt.setName("user").setDescription("User to promote as admin").setRequired(true)
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

    if (sub === "add") {
      const { ok, data: radar, error, radars } = await readRadar(name);
      if (!ok) return replyEphemeral(interaction, error);

      const currentAdminId = radar.adminId;
      const newAdminId = user.id;

      if (currentAdminId && currentAdminId !== interaction.user.id) {
        return replyEphemeral(
          interaction,
          `Radar "${name}" already has an admin (<@${currentAdminId}>). Only that admin can transfer ownership.`
        );
      }

      if (currentAdminId && currentAdminId === interaction.user.id) {
        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`radaradmin_confirm_${name}`)
            .setLabel("Confirm ownership handover")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId("radaradmin_cancel")
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Danger)
        );

        const question = `Do you want to transfer admin of radar **${name}** to ${user.tag}?`;
        const msg = await interaction.reply({
          content: question,
          components: [confirmRow],
          ephemeral: true,
          fetchReply: true
        });

        const filter = (i) => {
          if (i.customId === "radaradmin_cancel") return i.user.id === interaction.user.id;
          return i.customId === `radaradmin_confirm_${name}` && i.user.id === interaction.user.id;
        };

        try {
          const button = await msg.awaitMessageComponent({ filter, time: 30_000 });

          if (button.customId === "radaradmin_cancel") {
            await button.update({ content: "Ownership transfer cancelled.", components: [] });
            return;
          }

          radar.adminId = newAdminId;
          if (!radar.admins.includes(newAdminId)) radar.admins.push(newAdminId);

          const saveRes = await writeRadar(radars, radar);
          if (!saveRes.ok) {
            return button.update({ content: saveRes.error || "Failed to save radar config.", components: [] });
          }

          await button.update({
            content: `✅ Radar "${name}" admin is now <@${newAdminId}>.`,
            components: []
          });
        } catch (err) {
          if (err.message === "Collector received no items before ending with reason: time") {
            await interaction.editReply({
              content: "Ownership transfer timed out. No changes made.",
              components: []
            });
          } else {
            await interaction.editReply({
              content: err.message || "An error occurred.",
              components: []
            });
          }
        }

        return;
      }

      const res = await addRadarAdmin(name, user.id);
      if (!res.success && !res.reply.includes("now")) throw new Error(res.error || res.reply);

      return replyEphemeral(interaction, res.reply || `Added ${user.tag} as a radar admin.`);
    }

    if (sub === "remove") {
      const res = await removeRadarAdmin(name, user.id);
      if (!res.success && !res.reply.includes("not currently")) throw new Error(res.error || res.reply);

      return replyEphemeral(interaction, res.reply || `Removed ${user.tag} from radar admins.`);
    }

    return replyEphemeral(interaction, "Invalid subcommand.");
  }
};
