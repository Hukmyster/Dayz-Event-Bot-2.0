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

async function addRadarIgnore(radarName, playerName) {
  const res = await readRadar(radarName);
  if (!res.ok) return res;

  const radar = res.data;
  if (!radar.ignored) radar.ignored = [];

  const alreadyIgnored = radar.ignored.includes(playerName);
  if (alreadyIgnored) {
    return { reply: `Player "${playerName}" is already ignored.`, success: false };
  }

  radar.ignored.push(playerName);

  const saveRes = await writeRadar(radar);
  if (!saveRes.ok) return saveRes;

  return { reply: `✅ Added "${playerName}" to radar ignore.` };
}

async function removeRadarIgnore(radarName, playerName) {
  const res = await readRadar(radarName);
  if (!res.ok) return res;

  const radar = res.data;
  if (!radar.ignored) radar.ignored = [];

  const idx = radar.ignored.indexOf(playerName);
  if (idx === -1) {
    return { reply: `Player "${playerName}" is not currently ignored.`, success: false };
  }

  radar.ignored.splice(idx, 1);

  const saveRes = await writeRadar(radar);
  if (!saveRes.ok) return saveRes;

  return { reply: `✅ Removed "${playerName}" from radar ignore.` };
}

async function listRadars() {
  try {
    const dirExistsStat = fs.statSync(radarDir);
    if (!dirExistsStat.isDirectory()) {
      return [];
    }
  } catch (errDir) {
    return [];
  }

  const files = await fs.promises.readdir(radarDir);

  const radars = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;

    const filePath = path.join(radarDir, file);
    try {
      const text = await fs.promises.readFile(filePath, "utf8");
      const data = JSON.parse(text);

      if (data.name && data.x != null && data.z != null && data.radius) {
        radars.push(data);
      }
    } catch (err) {
      console.error("Failed to read radar file:", filePath, err);
    }
  }

  return radars;
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
        const radar = radars[0];   // you can decide: first radar, or one per channel

        if (!radar) {
          return replyEphemeral(interaction, "No radar config found.");
        }

        const list = Array.isArray(radar.ignored) && radar.ignored.length
          ? radar.ignored.join(", ")
          : "None";

        return replyEphemeral(interaction, `Ignored players: ${list}`);
      }

      const name = interaction.options.getString("name", true).trim();

      // here I’m using "default" as a dummy radar name for legacy compat;
      // you can remove it once you fully migrate to per‑radar names
      const radarName = "default";   // you can change this to match your naming

      if (sub === "add") {
        const res = await addRadarIgnore(radarName, name);
        if (!res.ok && !res.reply.includes("already ignored")) throw new Error(res.error || res.reply);

        return replyEphemeral(interaction, res.reply || `Added ${name} to radar ignore.`);
      }

      if (sub === "remove") {
        const res = await removeRadarIgnore(radarName, name);
        if (!res.ok && !res.reply.includes("not currently")) throw new Error(res.error || res.reply);

        return replyEphemeral(interaction, res.reply || `Removed ${name} from radar ignore.`);
      }

      return replyEphemeral(interaction, "Invalid subcommand.");
    } catch (err) {
      return replyEphemeral(interaction, err.message || "Failed to update radar ignore list.");
    }
  }
};
