const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder
} = require("discord.js");

const economy = require("../economy");
const sessionStore = require("./sessionStore");

const SESSION_IDLE_MS = 10 * 60 * 1000;
const MAX_BET = 100000;

function getColor(number) {
  if (number === 0) return "green";
  if (number >= 1 && number <= 18) return "red";
  return "black";
}

function getBetLabel(session) {
  if (!session.betType) return "-";
  if (session.betType === "number") return session.betChoice == null ? "-" : String(session.betChoice);
  if (session.betType === "colour") return session.betChoice || "-";
  return "-";
}

function createCasinoEmbed() {
  return new EmbedBuilder()
    .setTitle("🎲 Casino")
    .setDescription("🟢 Roulette")
    .setColor(0x000000);
}

function createCasinoRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("casino:roulette:play")
      .setLabel("Play")
      .setStyle(ButtonStyle.Success)
  );
}

function createSessionEmbed(session, user) {
  return new EmbedBuilder()
    .setTitle("🎲 Roulette")
    .setColor(0x000000)
    .addFields(
      { name: "Bet", value: session.betAmount ? economy.formatMoney(session.betAmount) : "0", inline: true },
      { name: "Type", value: session.betType || "-", inline: true },
      { name: "Choice", value: getBetLabel(session), inline: true }
    )
    .setFooter({ text: user.username });
}

function createSessionRows(session) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("casino:roulette:setbet")
      .setLabel("Bet")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("casino:roulette:setchoice")
      .setLabel("Choice")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("casino:roulette:spin")
      .setLabel("Spin")
      .setStyle(ButtonStyle.Success)
      .setDisabled(!session.betAmount || !session.betType || !session.betChoice)
  );

  return [row];
}

async function openPrivateSession(interaction) {
  let session = sessionStore.getSession(interaction.user.id);
  if (!session) {
    session = sessionStore.createSession(interaction.user.id, {
      channelId: interaction.channelId
    });
  }

  sessionStore.touchSession(interaction.user.id, SESSION_IDLE_MS);

  return interaction.reply({
    embeds: [createSessionEmbed(session, interaction.user)],
    components: createSessionRows(session),
    ephemeral: true
  });
}

async function handleSetBet(interaction) {
  const modal = new ModalBuilder()
    .setCustomId("casino:roulette:betmodal")
    .setTitle("Set bet amount");

  const input = new TextInputBuilder()
    .setCustomId("betAmount")
    .setLabel("Bet amount")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("1 - 100000");

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return interaction.showModal(modal);
}

async function handleBetModalSubmit(interaction) {
  const session = sessionStore.getSession(interaction.user.id);
  if (!session) {
    return interaction.reply({ content: "Session expired.", ephemeral: true });
  }

  const amount = Number(String(interaction.fields.getTextInputValue("betAmount") || "").trim());

  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_BET) {
    return interaction.reply({
      content: `Enter a valid bet between 1 and ${MAX_BET}.`,
      ephemeral: true
    });
  }

  sessionStore.updateSession(interaction.user.id, { betAmount: amount });
  sessionStore.touchSession(interaction.user.id, SESSION_IDLE_MS);

  return interaction.reply({
    content: `Bet set to ${economy.formatMoney(amount)}.`,
    ephemeral: true
  });
}

async function handleSetChoice(interaction) {
  const session = sessionStore.getSession(interaction.user.id);
  if (!session) {
    return interaction.reply({ content: "Session expired.", ephemeral: true });
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId("casino:roulette:choicemenu")
    .setPlaceholder("Choose bet type")
    .addOptions(
      { label: "Number", value: "number" },
      { label: "Colour", value: "colour" }
    );

  const row = new ActionRowBuilder().addComponents(menu);

  return interaction.reply({
    content: "Choose your bet type.",
    components: [row],
    ephemeral: true
  });
}

async function handleChoiceMenu(interaction) {
  const session = sessionStore.getSession(interaction.user.id);
  if (!session) {
    return interaction.reply({ content: "Session expired.", ephemeral: true });
  }

  const choice = interaction.values?.[0];
  if (!choice || !["number", "colour"].includes(choice)) {
    return interaction.reply({ content: "Invalid choice.", ephemeral: true });
  }

  if (choice === "number") {
    sessionStore.updateSession(interaction.user.id, { betType: "number", betChoice: "0" });
    sessionStore.touchSession(interaction.user.id, SESSION_IDLE_MS);
    return interaction.reply({
      content: "Bet type set to Number. Set your number by editing the choice later if needed.",
      ephemeral: true
    });
  }

  sessionStore.updateSession(interaction.user.id, { betType: "colour", betChoice: "red" });
  sessionStore.touchSession(interaction.user.id, SESSION_IDLE_MS);

  return interaction.reply({
    content: "Bet type set to Colour.",
    ephemeral: true
  });
}

async function handleSpin(interaction) {
  const session = sessionStore.getSession(interaction.user.id);
  if (!session) {
    return interaction.reply({ content: "Session expired.", ephemeral: true });
  }

  if (!session.betAmount || !session.betType || !session.betChoice) {
    return interaction.reply({
      content: "Set bet amount, type, and choice first.",
      ephemeral: true
    });
  }

  const account = await economy.getOrCreateAccount(interaction.user.id, interaction.guildId, interaction.user.username);
  const wallet = Number(account.wallet || 0);

  if (wallet < session.betAmount) {
    return interaction.reply({
      content: `Insufficient funds. You have ${economy.formatMoney(wallet)}.`,
      ephemeral: true
    });
  }

  const number = Math.floor(Math.random() * 37);
  const color = getColor(number);
  const win = session.betType === "colour"
    ? session.betChoice === color
    : Number(session.betChoice) === number;

  const payout = win
    ? (session.betType === "colour" ? session.betAmount * 2 : session.betAmount * 36)
    : 0;

  const delta = payout - session.betAmount;
  const newWallet = wallet + delta;

  await economy.updateAccount(interaction.user.id, interaction.guildId, { wallet: newWallet });

  sessionStore.updateSession(interaction.user.id, {
    lastResult: `${win ? "WIN" : "LOSS"} ${delta >= 0 ? "+" : ""}${economy.formatMoney(delta)} — ${number} (${color})`
  });

  sessionStore.touchSession(interaction.user.id, SESSION_IDLE_MS);

  return interaction.reply({
    content: `${win ? "✅ You won" : "❌ You lost"} ${economy.formatMoney(Math.abs(delta))}.`,
    ephemeral: true
  });
}

module.exports = {
  openPrivateSession,
  handleSetBet,
  handleBetModalSubmit,
  handleSetChoice,
  handleChoiceMenu,
  handleSpin,
  createSessionEmbed,
  createSessionRows,
  createCasinoEmbed,
  createCasinoRow
};
