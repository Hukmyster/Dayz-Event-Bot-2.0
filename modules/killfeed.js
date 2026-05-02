require("dotenv").config();
const { SlashCommandBuilder, hyperlink } = require("@discordjs/builders");
const fs = require("fs");
const ini = require("ini");
const { Client, Intents, MessageEmbed } = require("discord.js");
const axios = require("axios");
const path = require("path");
const readline = require("readline");
const colors = require("colors");
const moment = require("moment-timezone");

let config = ini.parse(fs.readFileSync("./config.ini", "utf-8"));
let admRegex = null;
let admPlat = null;
let { GUILDID, PLATFORM, ID1, ID2, NITRATOKEN, REGION } = require("../config.json");
const bot = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MEMBERS] });

const LOCAL_DIR = path.resolve("./logs");
const LOCAL_LOG = path.join(LOCAL_DIR, "log.ADM");
const STAGING_LOG = path.join(LOCAL_DIR, "serverlog.ADM");
const options = { separator: /[\r]{0,1}\n/, fromBeginning: false, useWatchFile: true, flushAtEOF: true, fsWatchOptions: {}, follow: true, nLines: false, logger: console };

let logStats = 0;
let logBytes = 0;
let logSize = 0;
let logSizeRef = 0;
let lineCount = 0;
let lineRef = 0;
let dt0 = 0;
let valueRef = new Set();
let iso;
let linkLoc = " ";
let kfChannel = " ";
let locChannel = " ";
let alarmChannel = " ";
let logDt = " ";
let dt = new Date();
let todayRef = " ";
let today = " ";
let feedStart = false;
let tail = null;
let feedInterval = null;
let phrases = [") killed by ", "AdminLog started on ", "from", ") bled out", ") with (MeleeFist)", ") committed suicide", "[HP: 0] hit by FallDamage", ") was teleported from:"];

function trace(step, data) {
  if (process.env.KILLFEED_DEBUG !== "true") return;
  console.log(`[killfeed][${new Date().toISOString()}][trace] ${step}`, data);
}

function getTimezone() {
  switch ((REGION || "").toUpperCase()) {
    case "FRANKFURT": return "Europe/Berlin";
    case "LOS ANGELES": return "America/Los_Angeles";
    case "LONDON": return "Europe/London";
    case "MIAMI":
    case "NEW YORK": return "America/New_York";
    case "SINGAPORE": return "Asia/Singapore";
    case "SYDNEY": return "Australia/Sydney";
    case "MOSCOW": return "Europe/Moscow";
    default: return "UTC";
  }
}

function ensureLogsDir() {
  fs.mkdirSync(LOCAL_DIR, { recursive: true });
}

function currentPlatformDir() {
  if (/XBOX|xbox|Xbox/i.test(PLATFORM)) return "/noftp/dayzxb/config";
  if (/PLAYSTATION|PS4|PS5|playstation|Playstation/i.test(PLATFORM)) return "/noftp/dayzps/config";
  return "/ftproot/dayzstandalone/config";
}

function currentAdmRegex() {
  if (/XBOX|xbox|Xbox/i.test(PLATFORM)) return /^DayZServer_X1_x64_(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})\.ADM$/;
  if (/PLAYSTATION|PS4|PS5|playstation|Playstation/i.test(PLATFORM)) return /^DayZServer_PS4_x64_(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})\.ADM$/;
  return /^DayZServer_X1_x64_(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})\.ADM$/;
}

async function setfeed(key, value) {
  if (key === "kfChan") config.kfChan = String(value);
  if (key === "locChan") config.locChan = String(value);
  if (key === "alrmChan") config.alrmChan = String(value);
  fs.writeFileSync("./config.ini", ini.stringify(config, { name: `${value}` }));
  console.log(key + " Channel Set!");
}

function pveEmbed(e, n, o, a) {
  const i = hyperlink("Sign-up for DayZero", "https://thecodegang.com");
  const emb = new MessageEmbed().setColor("0xDD0000").setTitle("Killfeed Notification").setThumbnail("attachment://crown.png").setDescription(e + ` **${n}** ` + o).addFields({ name: "Get Your Free Killfeed!", value: "" + i, inline: false });
  if (a) emb.addFields({ name: "🌐", value: "" + linkLoc + a, inline: false });
  return emb;
}

function pvpEmbed(e, n, o, a, i) {
  const t = hyperlink("Sign-up for DayZero", "https://thecodegang.com");
  const emb = new MessageEmbed().setColor("0xDD0000").setTitle("Killfeed Notification").setThumbnail("attachment://crown.png").setDescription(e + ` **${n}** Killed **${o}** ` + a).addFields({ name: "Get Your Free Killfeed!", value: "" + t, inline: false });
  if (i) emb.addFields({ name: "🌐", value: "" + linkLoc + i, inline: false });
  return emb;
}

function teleportEmbed(e, n, o, a) {
  const emb = new MessageEmbed().setColor("0xDD0000").setTitle("Teleport Notification").setThumbnail("attachment://crown.png").setDescription(n + ` **${o}** ` + a);
  e.guild.channels.cache.get(config.teleFeed).send({ embeds: [emb], files: ["./images/crown.png"] }).catch(console.log);
}

function getLocation(e) {
  return e ? e.split(/[|" '<>(),>]/).join(";") : null;
}

function getLatestADMEntry(entries) {
  let best = null;
  let bestKey = null;
  for (const a of entries || []) {
    if (a.type !== "file" || typeof a.name !== "string") continue;
    const m = a.name.match(admRegex);
    if (!m) continue;
    const key = m[1].replace(/[-_]/g, "");
    if (bestKey === null || key > bestKey) {
      bestKey = key;
      best = a;
    }
  }
  return best;
}

async function downloadLatestToLocal() {
  ensureLogsDir();
  const listUrl = `https://api.nitrado.net/services/${ID1}/gameservers/file_server/list?dir=${encodeURIComponent(currentPlatformDir())}`;
  const listRes = await axios.get(listUrl, {
    responseType: "application/json",
    headers: { Authorization: `Bearer ${NITRATOKEN}`, Accept: "application/json" }
  });
  const entry = getLatestADMEntry(listRes.data?.data?.entries);
  if (!entry) throw new Error("Unable to determine logfile name!");
  const downloadUrl = `https://api.nitrado.net/services/${ID1}/gameservers/file_server/download?file=${encodeURIComponent(currentPlatformDir() + "/" + entry.name)}`;
  trace("latest adm chosen", { name: entry.name, downloadUrl });
  const streamRes = await axios.get(downloadUrl, {
    responseType: "stream",
    headers: { Authorization: `Bearer ${NITRATOKEN}`, Accept: "application/octet-stream" }
  });
  const tmp = fs.createWriteStream(STAGING_LOG);
  await new Promise((resolve, reject) => {
    streamRes.data.pipe(tmp);
    tmp.on("finish", resolve);
    tmp.on("error", reject);
  });
  fs.copyFileSync(STAGING_LOG, LOCAL_LOG);
  const stats = fs.statSync(LOCAL_LOG);
  logStats = stats;
  logBytes = stats.size;
  logSize = logBytes / 1e6;
  trace("local log updated", { local: LOCAL_LOG, bytes: logBytes, mb: logSize, source: entry.name });
  return { entry, localPath: LOCAL_LOG, bytes: logBytes };
}

function parseLocalFileIntoNotifications(o) {
  const e = readline.createInterface({ input: fs.createReadStream(LOCAL_LOG) });
  e.on("line", async line => {
    lineCount++;
    lineRef = lineCount;
    if (line.includes(phrases[1])) {
      logDt = line.slice(20, 30);
      todayRef = today.slice(0, 10);
      trace("log date detected", { logDt, todayRef });
    }
    if (phrases.some(p => line.includes(p) && p !== phrases[1])) {
      if (!valueRef.has(line)) {
        valueRef.add(line);
        iso = line.split(/[|"'<>]/);
        await handleKillfeedNotification(o);
      }
    }
  });
  e.on("close", () => {});
  e.on("error", console.error);
}

async function handleKillfeedNotification(e) {
  if (!iso) return;
  let n, o, a, i, t, l, s, c, r, d, g, f = iso[iso.length - 1].slice(2);
  if (iso[9] && iso[5].includes(phrases[0])) {
    if (f.includes(phrases[2])) {
      try {
        const p = iso[4].toString().split(/[|" "<(),>]/);
        const u = iso[8].toString().split(/[|" "<(),>]/);
        const S = f;
        const w = `${p[0]};${p[2]};${p[4]}`;
        const y = iso[0].toString();
        const C = iso[6].toString();
        const D = iso[2].toString();
        if (1 === config.showLoc) {
          const h = pvpEmbed(y, C, D, S, w);
          e.guild.channels.cache.get(config.kfChan).send({ embeds: [h], files: ["./images/crown.png"] });
        } else {
          const m = pvpEmbed(y, C, D, S);
          e.guild.channels.cache.get(config.kfChan).send({ embeds: [m], files: ["./images/crown.png"] });
        }
      } catch (err) { console.error(err); }
    } else {
      try {
        const p = iso[4].toString().split(/[|" "<(),>]/);
        const u = iso[8].toString().split(/[|" "<(),>]/);
        const S = f;
        const w = `${p[0]};${p[2]};${p[4]}`;
        const y = iso[0].toString();
        const C = iso[6].toString();
        const D = iso[2].toString();
        if (1 === config.showLoc) {
          const o2 = pvpEmbed(y, C, D, S, w);
          e.guild.channels.cache.get(config.kfChan).send({ embeds: [o2], files: ["./images/crown.png"] });
        } else {
          const a2 = pvpEmbed(y, C, D, S);
          e.guild.channels.cache.get(config.kfChan).send({ embeds: [a2], files: ["./images/crown.png"] });
        }
      } catch (err) { console.error(err); }
    }
  } else if (!iso[6] && iso[5].includes(phrases[0])) {
    try {
      const y = iso[0].toString();
      const C = iso[2].toString();
      const D = f;
      const n2 = iso[iso.length - 2].split(/[|" "<(),>]/);
      const x1 = n2[0], y1 = n2[2], z1 = n2[4];
      const w = x1.concat(`;${y1};` + z1);
      if (1 === config.showLoc) {
        const i2 = pvpEmbed(y, C, D, w);
        e.guild.channels.cache.get(config.kfChan).send({ embeds: [i2], files: ["./images/crown.png"] });
      } else {
        const t2 = pvpEmbed(y, C, D);
        e.guild.channels.cache.get(config.kfChan).send({ embeds: [t2], files: ["./images/crown.png"] });
      }
    } catch (err) { console.error(err); }
  } else if (f.includes("Spawning")) {
    try { teleportEmbed(e, y = iso[0].toString(), C = iso[2].toString(), D = f); } catch (err) { console.error(err); }
  } else if (f.includes("bled out")) {
    try {
      const y = iso[0].toString();
      const C = iso[2].toString();
      const D = f;
      const n2 = iso[iso.length - 2].split(/[|" "<(),>]/);
      const x1 = n2[0], y1 = n2[2], z1 = n2[4];
      const w = x1.concat(`;${y1};` + z1);
      if (1 === config.showLoc) {
        const l2 = pveEmbed(y, C, D, w);
        e.guild.channels.cache.get(config.kfChan).send({ embeds: [l2], files: ["./images/crown.png"] });
      } else {
        const s2 = pveEmbed(y, C, D);
        e.guild.channels.cache.get(config.kfChan).send({ embeds: [s2], files: ["./images/crown.png"] });
      }
    } catch (err) { console.error(err); }
  } else if (f.includes("hit by FallDamage")) {
    try {
      const y = iso[0].toString();
      const C = iso[2].toString();
      const D = "fell to their death";
      const n2 = iso[iso.length - 3].split(/[|" "<(),>]/);
      const x1 = n2[0], y1 = n2[2], z1 = n2[4];
      const w = x1.concat(`;${y1};` + z1);
      if (1 === config.showLoc) {
        const c2 = pveEmbed(y, C, D, w);
        e.guild.channels.cache.get(config.kfChan).send({ embeds: [c2], files: ["./images/crown.png"] });
      } else {
        const r2 = pveEmbed(y, C, D);
        e.guild.channels.cache.get(config.kfChan).send({ embeds: [r2], files: ["./images/crown.png"] });
      }
    } catch (err) { console.error(err); }
  } else if (f.includes("committed suicide")) {
    try {
      const y = iso[0].toString();
      const C = iso[2].toString();
      const D = f;
      const n2 = iso[iso.length - 2].split(/[|" "<(),>]/);
      const x1 = n2[0], y1 = n2[2], z1 = n2[4];
      const w = x1.concat(`;${y1};` + z1);
      if (1 === config.showLoc) {
        const d2 = pveEmbed(y, C, D, w);
        e.guild.channels.cache.get(config.kfChan).send({ embeds: [d2], files: ["./images/crown.png"] });
      } else {
        const g2 = pveEmbed(y, C, D);
        e.guild.channels.cache.get(config.kfChan).send({ embeds: [g2], files: ["./images/crown.png"] });
      }
    } catch (err) { console.error(err); }
  }
}

async function handleClearCommand(e) {
  if (e.guildId && e.guildId === GUILDID) {
    const n = e.options.getInteger("value");
    if (100 < n) return e.reply("The max number of messages you can delete is 100").catch(console.error);
    await e.channel.bulkDelete(n).catch(console.error);
    await e.reply("clearing messages...").catch(console.error);
    await e.deleteReply().catch(console.error);
  }
}

async function handleMapChange(e) {
  if (e.guildId && e.guildId === GUILDID) {
    config = ini.parse(fs.readFileSync("./config.ini", "utf-8"));
    const n = e.options.getString("new-map");
    if (n === "cherno") {
      config.mapLoc = 0;
      fs.writeFileSync("./config.ini", ini.stringify(config, { mapLoc: "0" }));
      e.reply("Killfeed Map set to **Chernaus**").catch(console.log);
    } else if (n === "livonia") {
      config.mapLoc = 1;
      fs.writeFileSync("./config.ini", ini.stringify(config, { mapLoc: "1" }));
      e.reply("Killfeed Map set to **Livonia**").catch(console.log);
    } else if (n === "sakhal") {
      config.mapLoc = 2;
      fs.writeFileSync("./config.ini", ini.stringify(config, { mapLoc: "2" }));
      e.reply("Killfeed Map set to **Sakhal**").catch(console.log);
    }
  }
}

async function handleSetupCommand(e) {
  if (e.guildId && e.guildId === GUILDID) {
    await e.channel.send("....").catch(console.error);
    kfChannel = e.guild.channels.cache.find(x => x.name.includes("➖》💀-killfeed"));
    locChannel = e.guild.channels.cache.find(x => x.name.includes("➖》👀-locations"));
    alarmChannel = e.guild.channels.cache.find(x => x.name.includes("➖》🚨-alarm"));
    if (null == kfChannel) {
      await e.guild.channels.create("➖》💀-killfeed", { type: "text", permissionOverwrites: [{ id: e.guild.roles.everyone, allow: ["VIEW_CHANNEL", "SEND_MESSAGES", "READ_MESSAGE_HISTORY"], deny: ["ADMINISTRATOR"] }] }).catch(console.error);
      kfChannel = e.guild.channels.cache.find(x => x.name.includes("➖》💀-killfeed"));
      await setfeed("kfChan", kfChannel.id).catch(console.log);
      await e.channel.send("Killfeed Channel Created Successfully!").catch(console.error);
    } else {
      await e.channel.send("Skipped Creating Killfeed Channel!").catch(console.error);
      await setfeed("kfChan", kfChannel.id).catch(console.log);
    }
    if (null == locChannel) {
      await e.guild.channels.create("➖》👀-locations", { type: "text", parent: parentCategory, permissionOverwrites: [{ id: everyoneRole, deny: ["VIEW_CHANNEL"] }] }).catch(console.log);
      locChannel = e.guild.channels.cache.find(x => x.name.includes("➖》👀-locations"));
      await setfeed("locChan", locChannel.id).catch(console.log);
      await e.channel.send("Locations Channel Created Successfully!").catch(console.log);
    } else {
      await e.channel.send("Skipped Creating Locations Channel!").catch(console.log);
      await setfeed("locChan", locChannel.id).catch(console.log);
    }
    if (null == alarmChannel) {
      await e.guild.channels.create("➖》🚨-alarm", { type: "text", parent: parentCategory, permissionOverwrites: [{ id: adminRoleId, allow: ["VIEW_CHANNEL", "SEND_MESSAGES", "READ_MESSAGE_HISTORY"], deny: ["ADMINISTRATOR"] }] }).catch(console.log);
      alarmChannel = e.guild.channels.cache.find(x => x.name.includes("➖》🚨-alarm"));
      await setfeed("alrmChan", alarmChannel.id).catch(console.log);
      await e.channel.send("Alarm Channel Created Successfully!").catch(console.log);
    } else {
      await e.channel.send("Skipped Creating Alarm Channel!").catch(console.log);
      await setfeed("alrmChan", alarmChannel.id).catch(console.log);
    }
    setTimeout(async () => { await e.channel.bulkDelete(4).catch(console.error); }, 5000);
    await e.reply("...").catch(console.error);
    await e.deleteReply().catch(console.error);
  }
}

async function handleStopCommand(e) {
  if (e.guildId && e.guildId === GUILDID && feedStart) {
    await e.reply("Terminating Project.....").catch(console.error);
    if (feedInterval) clearInterval(feedInterval);
    setTimeout(() => process.exit(22), 5000);
  } else {
    await e.reply("THE KILLFEED IS NOT CURRENTLY RUNNING!.....").catch(console.error);
  }
}

async function handleDeathlocCommand(e) {
  if (e.guildId && e.guildId === GUILDID && feedStart) {
    const n = e.options.getString("state");
    config.showLoc = n === "on" ? 1 : 0;
    fs.writeFileSync("./config.ini", ini.stringify(config));
    await e.reply(`Death Locations **${n === "on" ? "Enabled" : "Disabled"}!**`).catch(console.error);
  } else {
    await e.reply("THE KILLFEED IS NOT CURRENTLY RUNNING!.....").catch(console.error);
  }
}

async function handleStartCommand(e) {
  if (!(e.guildId && e.guildId === GUILDID)) return;
  kfChannel = e.guild.channels.cache.find(x => x.name.includes("➖》💀-killfeed"));
  if (feedStart) {
    await e.channel.send("THE KILLFEED IS ALREADY RUNNING!.....TRY RESETING IF YOU NEED TO RESTART").catch(console.error);
    return;
  }
  await e.reply("**Starting Killfeed....**").catch(console.error);
  feedStart = true;
  getDetails(e).catch(console.error);
}

async function getDetails(o) {
  ensureLogsDir();
  tail = null;
  if (feedInterval) clearInterval(feedInterval);

  const refreshLocal = async () => {
    if (!feedStart) return;
    today = moment().tz(getTimezone()).format();
    todayRef = today.slice(0, 10);
    try {
      const result = await downloadLatestToLocal();
      const data = fs.statSync(LOCAL_LOG);
      logStats = data;
      logBytes = data.size;
      logSize = logBytes / 1e6;
      console.log(`Current Log Size: ${logSize} / LogRef Size: ${logSizeRef}`);
      console.log(`Current LineRef: ${lineRef}`);
      if (logSize < logSizeRef) {
        logSizeRef = 0;
        valueRef.clear();
        lineCount = 0;
        lineRef = 0;
        trace("log rotation detected", { logSize, logSizeRef });
      } else {
        logSizeRef = logSize;
      }
      if (tail && tail.unwatch) {
        try { tail.unwatch(); } catch {}
      }
      if (tail && tail.close) {
        try { tail.close(); } catch {}
      }
      tail = new (require("tail").Tail)(LOCAL_LOG, options);
      tail.on("line", async n => {
        lineCount++;
        lineRef = lineCount;
        if (n.includes(phrases[1])) {
          logDt = n.slice(20, 30);
          console.log("This is the logDate: " + logDt);
          console.log("This is the current date: " + todayRef);
        }
        if (phrases.some(p => n.includes(p) && p !== phrases[1])) {
          if (!valueRef.has(n)) {
            valueRef.add(n);
            iso = n.split(/[|"'<>]/);
            await handleKillfeedNotification(o);
          }
        }
      });
      tail.on("error", console.error);
      trace("local source refreshed", { source: result.entry.name, local: LOCAL_LOG, bytes: logBytes });
    } catch (err) {
      console.error(err);
    }
  };

  await refreshLocal();
  feedInterval = setInterval(refreshLocal, 35000);
}

bot.once("ready", () => {
  console.log("[OK] [debug] { message: 'debug logger initialized' }");
  console.log("Logged in as " + bot.user.tag);
  console.log("  loopInterval: " + LOOP_INTERVAL + ",");
  console.log("[DEBUG] [startup] { step: 'start', debug: true, bot: '" + bot.user.tag + "', webhookEnabled: " + !!WEBHOOK_URL + ", pid: " + process.pid + ", remoteDir: '" + REMOTE_DIR + ", cwd: '" + process.cwd() + "', huntDelayMs: " + HUNT_DELAY_MS + ", staleLimit: " + STALE_LIMIT + " }");
  console.log("[DISCORD] Bot is ready. Commands are handled from Discord now.");
  console.log("[KILLFEED] module started");
  console.log(`This is dt: ${dt}`);
});

bot.on("interactionCreate", async e => {
  if (!e.isCommand()) return;
  const n = e.options.getSubcommand();
  config = ini.parse(fs.readFileSync("./config.ini", "utf-8"));
  switch (n) {
    case "clear": await handleClearCommand(e); break;
    case "map": await handleMapChange(e); break;
    case "setup": await handleSetupCommand(e); break;
    case "stop": await handleStopCommand(e); break;
    case "deathloc": await handleDeathlocCommand(e); break;
    case "start": await handleStartCommand(e); break;
  }
});

admPlat = /XBOX|Xbox|xbox/i.test(PLATFORM) ? "/noftp/dayzxb/config" : /PLAYSTATION|PS4|PS5|playstation|Playstation/i.test(PLATFORM) ? "/noftp/dayzps/config" : "/ftproot/dayzstandalone/config";
if (parseInt(config.mapLoc) === 1) linkLoc = "https://www.izurvive.com/livonia/#location=";
else if (parseInt(config.mapLoc) === 2) linkLoc = "https://www.izurvive.com/sakhal/#location=";
else linkLoc = "https://www.izurvive.com/#location=";

module.exports = {
  data: (new SlashCommandBuilder())
    .setName("admin")
    .setDescription("Contains all Admin Killfeed commands")
    .setDefaultMemberPermissions("0")
    .addSubcommandGroup(e => e
      .setName("killfeed")
      .setDescription("Admin Killfeed Commands")
      .addSubcommand(e => e.setName("stop").setDescription("Kill Project"))
      .addSubcommand(e => e.setName("deathloc").setDescription("Toggle on display of death locations in Killfeed notifications").addStringOption(e => e.setName("state").setDescription("Select desired Alarm state").setRequired(true).addChoices({ name: "OFF", value: "off" }, { name: "ON", value: "on" })))
      .addSubcommand(e => e.setName("start").setDescription("Start Killfeed"))
      .addSubcommand(e => e.setName("clear").setDescription("Clear channel messages (limit 100)").addIntegerOption(e => e.setName("value").setDescription("Enter new value").setRequired(true)))
      .addSubcommand(e => e.setName("map").setDescription("Toggle Killfeed Mission Map").addStringOption(e => e.setName("new-map").setDescription("Select Map to be displayed in notifications").setRequired(true).addChoices({ name: "Chernarus", value: "cherno" }, { name: "Livonia", value: "livonia" }, { name: "Sakhal", value: "sakhal" })))
      .addSubcommand(e => e.setName("setup").setDescription("Set up Discord channels required by Killfeed"))),
  async execute(e) {
    const n = e.options.getSubcommand();
    config = ini.parse(fs.readFileSync("./config.ini", "utf-8"));
    switch (n) {
      case "clear": await handleClearCommand(e); break;
      case "map": await handleMapChange(e); break;
      case "setup": await handleSetupCommand(e); break;
      case "stop": await handleStopCommand(e); break;
      case "deathloc": await handleDeathlocCommand(e); break;
      case "start": await handleStartCommand(e); break;
    }
  }
};
