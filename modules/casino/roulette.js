const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const economy = require("../economy");
const sessionStore = require("./sessionStore");

const SESSION_IDLE_MS = 10 * 60 * 1000;
const MAX_BET = 100000;

function getColorForNumber(n) {
  if (n === 0) return "green";
  if (n >= 1 && n <= 18) return "red";
  return "black";
}

function getRealRouletteResult() {
  const number = Math.floor(Math.random() * 37);
  const color = getColorForNumber(number);
  return { number, color };
}

function getBetOddsText() {
  return "Real roulette: Red/Black 18/37, Green 1/37";
}

function createLauncherEmbed() {
  return new EmbedBuilder()
    .setTitle("🎲 Roulette")
    .setDescription("Click **Play** to start your private roulette session.")
    .setColor(0x000000);
}

function createLauncherRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("casino:roulette:play")
      .setLabel("Play")
      .setStyle(ButtonStyle.Primary)
  );
}

function createSessionEmbed(session) {
  const lines = [];
  if (session.lastResult) {
    lines.push(`**Result:** ${session.lastResultText}`);
    lines.push("");
  }

  lines.push("Set your bet amount, choose your bet type, then spin.");
  lines.push(`**Current bet:** ${session.betAmount ? economy.formatMoney(session.betAmount) : "Not set"}`);
  lines.push(`**Bet type:** ${session.betType || "Not set"}`);
  lines.push(`**Choice:** ${session.betChoice || "Not set"}`);
  lines.push("");
  lines.push(getBetOddsText());

  return new EmbedBuilder()
    .setTitle("🎲 Roulette")
    .setDescription(lines.join("\n"))
    .setColor(0x000000);
}

function createSessionRows(session) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`casino:roulette:setbet:${session.userId}`)
      .setLabel("Set Bet")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`casino:roulette:spin:${session.userId}`)
      .setLabel("Spin")
      .setStyle(ButtonStyle.Success)
      .setDisabled(!session.betAmount || !session.betType || !session.betChoice)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`casino:roulette:bettype:${session.userId}`)
      .setPlaceholder("Choose bet type")
      .addOptions(
        { label: "Colour", value: "colour" },
        { label: "Number", value: "number" }
      )
  );

  return [row1, row2];
}

async function startSession(interaction) {
  const existing = sessionStore.getSession(interaction.user.id);
  if (existing?.active) {
    return interaction.reply({ content: "You already have an active roulette session.", ephemeral: true });
  }

  const session = sessionStore.createSession(interaction.user.id, {
    channelId: interaction.channelId
  });

  const msg = await interaction.reply({
    embeds: [createLauncherEmbed()],
    components: [createLauncherRow()],
    fetchReply: true
  });

  sessionStore.updateSession(interaction.user.id, {
    messageId: msg.id
  });

  return msg;
}

async function openPrivateSession(interaction) {
  const session = sessionStore.getSession(interaction.user.id);
  if (!session?.active) {
    return interaction.reply({ content: "Your roulette session has expired. Start again.", ephemeral: true });
  }

  sessionStore.touchSession(interaction.user.id, SESSION_IDLE_MS);

  return interaction.reply({
    embeds: [createSessionEmbed(session)],
    components: createSessionRows(session),
    ephemeral: true
  });
}

async function handleSetBet(interaction) {
  const session = sessionStore.getSession(interaction.user.id);
  if (!session?.active) {
    return interaction.reply({ content: "This roulette session has expired.", ephemeral: true });
  }

  sessionStore.touchSession(interaction.user.id, SESSION_IDLE_MS);

  const modal = new ModalBuilder()
    .setCustomId(`casino:roulette:betmodal:${interaction.user.id}`)
    .setTitle("Set bet amount");

  const amountInput = new TextInputBuilder()
    .setCustomId("betAmount")
    .setLabel("Bet amount")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("1 - 100000");

  modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
  return interaction.showModal(modal);
}

async function handleBetModalSubmit(interaction) {
  const session = sessionStore.getSession(interaction.user.id);
  if (!session?.active) {
    return interaction.reply({ content: "This roulette session has expired.", ephemeral: true });
  }

  const amountRaw = interaction.fields.getTextInputValue("betAmount");
  const amount = Number(String(amountRaw).trim());

  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_BET) {
    return interaction.reply({ content: `Enter a valid bet between 1 and ${MAX_BET}.`, ephemeral: true });
  }

  sessionStore.updateSession(interaction.user.id, { betAmount: amount });
  sessionStore.touchSession(interaction.user.id, SESSION_IDLE_MS);

  return interaction.reply({
    content: `Bet set to ${economy.formatMoney(amount)}.`,
    ephemeral: true
  });
}

async function handleBetTypeSelect(interaction) {
  const session = sessionStore.getSession(interaction.user.id);
  if (!session?.active) {
    return interaction.reply({ content: "This roulette session has expired.", ephemeral: true });
  }

  const value = interaction.values?.[0];
  if (!value || !["colour", "number"].includes(value)) {
    return interaction.reply({ content: "Invalid bet type.", ephemeral: true });
  }

  sessionStore.updateSession(interaction.user.id, { betType: value, betChoice: null });
  sessionStore.touchSession(interaction.user.id, SESSION_IDLE_MS);

  return interaction.reply({
    content: `Bet type set to **${value}**.`, 
    ephemeral: true
  });
}

async function handleSpin(interaction) {
  const session = sessionStore.getSession(interaction.user.id);
  if (!session?.active) {
    return interaction.reply({ content: "This roulette session has expired.", ephemeral: true });
  }

  if (!session.betAmount || !session.betType || !session.betChoice) {
    return interaction.reply({ content: "Set bet amount, bet type, and choice first.", ephemeral: true });
  }

  const account = await economy.getOrCreateAccount(interaction.user.id, interaction.guildId, interaction.user.username);
  const wallet = Number(account.wallet || 0);

  if (wallet < session.betAmount) {
    return interaction.reply({ content: `Insufficient funds. You have ${economy.formatMoney(wallet)} in your wallet.`, ephemeral: true });
  }

  const { number, color } = getRealRouletteResult();
  const win = session.betType === "colour"
    ? (session.betChoice === color)
    : (Number(session.betChoice) === number);

  let payout = 0;
  if (win) {
    payout = session.betType === "colour"
      ? session.betAmount * 2
      : session.betAmount * 36;
  }

  const delta = payout - session.betAmount;
  const updatedWallet = wallet + delta;

  await economy.updateAccount(interaction.user.id, interaction.guildId, { wallet: updatedWallet });
  await economy.logTransaction({
    guildId: interaction.guildId,
    userId: interaction.user.id,
    username: interaction.user.username,
    type: "roulette_spin",
    amount: delta,
    balanceAfter: updatedWallet,
    metadata: {
      number,
      color,
      betAmount: session.betAmount,
      betType: session.betType,
      betChoice: session.betChoice,
      payout
    }
  });

  sessionStore.updateSession(interaction.user.id, {
    lastResult: {
      number,
      color,
      win,
      payout,
      delta
    },
    lastResultText: `${win ? "WIN" : "LOSS"} ${delta >= 0 ? "+" : ""}${economy.formatMoney(delta)} — ${number} (${color})`
  });

  sessionStore.touchSession(interaction.user.id, SESSION_IDLE_MS);

  return interaction.reply({
    content: `${win ? "✅ You won" : "❌ You lost"} ${economy.formatMoney(Math.abs(delta))}. Number: ${number} (${color}).`,
    ephemeral: true
  });
}

async function renderSessionMessage(interaction) {
  const session = sessionStore.getSession(interaction.user.id);
  if (!session?.active) return;

  const embed = createSessionEmbed(session);
  const rows = createSessionRows(session);

  return interaction.message.edit({
    embeds: [embed],
    components: rows
  }).catch(() => {});
}

module.exports = {
  startSession,
  openPrivateSession,
  handleSetBet,
  handleBetModalSubmit,
  handleBetTypeSelect,
  handleSpin,
  renderSessionMessage,
  createLauncherEmbed,
  createLauncherRow,
  createSessionEmbed,
  createSessionRows
};
