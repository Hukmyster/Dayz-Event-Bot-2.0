const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const storage = require("../../modules/storage");

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

async function addRadarIgnore(radarName, playerName) {
  const res = await readRadar(radarName);
  if (!res.ok) return res;

  const radar = res.data;
  const key = String(playerName || "").trim();
  if (!key) return { reply: "Missing player name.", success: false };

  const exists = radar.ignore.some(x => String(x).toLowerCase() === key.toLowerCase()) ||
    radar.ignored.some(x => String(x).toLowerCase() === key.toLowerCase());

  if (exists) {
    return { reply: `Player "${key}" is already ignored.`, success: false };
  }

  radar.ignore.push(key);
  radar.ignored.push(key);

  const saveRes = await writeRadar(res.radars, radar);
  if (!saveRes.ok) return saveRes;

  return { reply: `✅ Added "${key}" to radar ignore.`, success: true };
}

async function removeRadarIgnore(radarName, playerName) {
  const res = await readRadar(radarName);
  if (!res.ok) return res;

  const radar = res.data;
  const key = String(playerName || "").trim();
  if (!key) return { reply: "Missing player name.", success: false };

  const before = radar.ignore.length + radar.ignored.length;
  radar.ignore = radar.ignore.filter(x => String(x).toLowerCase() !== key.toLowerCase());
  radar.ignored = radar.ignored.filter(x => String(x).toLowerCase() !== key.toLowerCase());

  const after = radar.ignore.length + radar.ignored.length;
  if (before === after) {
    return { reply: `Player "${key}" is not currently ignored.`, success: false };
  }

  const saveRes = await writeRadar(res.radars, radar);
  if (!saveRes.ok) return saveRes;

  return { reply: `✅ Removed "${key}" from radar ignore.`, success: true };
}

async function listRadars() {
  const radars = await loadRadars();
  return Object.entries(radars).map(([name, radar]) => {
    const r = normalizeRadar(radar);
    return {
      name,
      x: r.x,
      z: r.z,
      radius: r.radius,
      channelId: r.channelId,
      admins: r.admins,
      ignore: r.ignore,
      ignored: r.ignored
    };
  });
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
      const radarName = "default";

      if (sub === "add") {
        const res = await addRadarIgnore(radarName, name);
        if (!res.success && !res.reply.includes("already ignored")) throw new Error(res.error || res.reply);
        return replyEphemeral(interaction, res.reply || `Added ${name} to radar ignore.`);
      }

      if (sub === "remove") {
        const res = await removeRadarIgnore(radarName, name);
        if (!res.success && !res.reply.includes("not currently")) throw new Error(res.error || res.reply);
        return replyEphemeral(interaction, res.reply || `Removed ${name} from radar ignore.`);
      }

      return replyEphemeral(interaction, "Invalid subcommand.");
    } catch (err) {
      return replyEphemeral(interaction, err.message || "Failed to update radar ignore list.");
    }
  }
};
