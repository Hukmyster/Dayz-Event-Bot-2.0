const fs = require("fs");
const path = require("path");

const radarDir = "/dayzps_missions/dayzOffline.chernarusplus/custom/server/radars";

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

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
      const { ok, data: radar, error } = await readRadar(name);
      if (!ok) return replyEphemeral(interaction, error);

      const currentAdminId = radar.adminId;
      const newAdminId = user.id;

      // If there is already an admin and they are not the one running the command
      if (currentAdminId && currentAdminId !== interaction.user.id) {
        return replyEphemeral(
          interaction,
          `Radar "${name}" already has an admin (<@${currentAdminId}>). Only that admin can transfer ownership.`
        );
      }

      // If there is already an admin AND it IS the one running the command → ask for confirmation
      if (currentAdminId && currentAdminId === interaction.user.id) {
        const confirmRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`radaradmin_confirm_${name}`)
              .setLabel("Confirm ownership handover")
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`radaradmin_cancel`)
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
          if (i.customId === `radaradmin_cancel`) {
            return i.user.id === interaction.user.id;
          }
          return i.customId === `radaradmin_confirm_${name}` && i.user.id === interaction.user.id;
        };

        try {
          const button = await msg.awaitMessageComponent({
            filter,
            time: 30_000
          });

          if (button.customId === `radaradmin_cancel`) {
            await button.update({ content: "Ownership transfer cancelled.", components: [] });
            return;
          }

          // User clicked OK → change admin
          radar.adminId = newAdminId;

          const saveRes = await writeRadar(radar);
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

      // No admin yet → just set it
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
  }
};
