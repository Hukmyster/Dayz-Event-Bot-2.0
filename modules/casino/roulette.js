const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  MessageFlags
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

function createSessionEmbed(session, user) {
  return new EmbedBuilder()
    .setTitle("🎲 Roulette")
    .setColor(0x000000)
    .addFields(
      {
        name: "Bet",
        value: session.betAmount ? economy.formatMoney(session.betAmount) : "0",
        inline: true
      },
      {
        name: "Type",
        value: session.betType || "-",
        inline: true
      },
      {
        name: "Choice",
        value: session.betChoiceLabel || "-",
        inline: true
      }
    )
    .setFooter({ text: user.username });
}

function createSessionRows(session) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("casino:roulette:amount")
        .setLabel("Amount")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("casino:roulette:bet")
        .setLabel("Bet")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("casino:roulette:spin")
        .setLabel("Spin")
        .setStyle(ButtonStyle.Success)
        .setDisabled(!session.betAmount || session.betChoice == null || !session.betType)
    )
  ];
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
    flags: MessageFlags.Ephemeral
  });
}

async function handleAmountButton(interaction) {
  const modal = new ModalBuilder()
    .setCustomId("casino:roulette:amountmodal")
    .setTitle("Set bet amount");

  const input = new TextInputBuilder()
    .setCustomId("amount")
    .setLabel("Bet amount")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("1 - 100000");

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return interaction.showModal(modal);
}

async function handleAmountModal(interaction) {
  const session = sessionStore.getSession(interaction.user.id);
  if (!session) {
    return interaction.reply({ content: "Session expired.", flags: MessageFlags.Ephemeral });
  }

  const raw = String(interaction.fields.getTextInputValue("amount") || "").trim();
  const amount = Number(raw);

  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_BET) {
    return interaction.reply({
      content: `Enter a valid amount between 1 and ${MAX_BET}.`,
      flags: MessageFlags.Ephemeral
    });
  }

  sessionStore.updateSession(interaction.user.id, { betAmount: amount });
  sessionStore.touchSession(interaction.user.id, SESSION_IDLE_MS);

  const updated = sessionStore.getSession(interaction.user.id);

  return interaction.reply({
    embeds: [createSessionEmbed(updated, interaction.user)],
    components: createSessionRows(updated),
    flags: MessageFlags.Ephemeral
  });
}

function createBetSelectMenu() {
  const options = [
    { label: "Red", value: "red" },
    { label: "Black", value: "black" }
  ];

  for (let i = 0; i <= 36; i++) {
    options.push({ label: String(i), value: `number:${i}` });
  }

  return new StringSelectMenuBuilder()
    .setCustomId("casino:roulette:betselect")
    .setPlaceholder("Choose red, black, or a number")
    .addOptions(options);
}

async function handleBetButton(interaction) {
  const row = new ActionRowBuilder().addComponents(createBetSelectMenu());

  return interaction.reply({
    content: "Choose your bet.",
    components: [row],
    flags: MessageFlags.Ephemeral
  });
}

async function handleBetSelect(interaction) {
  const session = sessionStore.getSession(interaction.user.id);
  if (!session) {
    return interaction.reply({ content: "Session expired.", flags: MessageFlags.Ephemeral });
  }

  const value = interaction.values?.[0];
  if (!value) {
    return interaction.reply({ content: "Invalid selection.", flags: MessageFlags.Ephemeral });
  }

  if (value === "red" || value === "black") {
    sessionStore.updateSession(interaction.user.id, {
      betType: "colour",
      betChoice: value,
      betChoiceLabel: value
    });
  } else if (value.startsWith("number:")) {
    const num = Number(value.split(":")[1]);
    if (!Number.isInteger(num) || num < 0 || num > 36) {
      return interaction.reply({ content: "Invalid number.", flags: MessageFlags.Ephemeral });
    }

    sessionStore.updateSession(interaction.user.id, {
      betType: "number",
      betChoice: num,
      betChoiceLabel: String(num)
    });
  } else {
    return interaction.reply({ content: "Invalid selection.", flags: MessageFlags.Ephemeral });
  }

  sessionStore.touchSession(interaction.user.id, SESSION_IDLE_MS);
  const updated = sessionStore.getSession(interaction.user.id);

  return interaction.update({
    embeds: [createSessionEmbed(updated, interaction.user)],
    components: createSessionRows(updated)
  });
}

async function handleSpin(interaction) {
  const session = sessionStore.getSession(interaction.user.id);
  if (!session) {
    return interaction.reply({ content: "Session expired.", flags: MessageFlags.Ephemeral });
  }

  if (!session.betAmount || session.betChoice == null || !session.betType) {
    return interaction.reply({
      content: "Set amount and bet choice first.",
      flags: MessageFlags.Ephemeral
    });
  }

  const account = await economy.getOrCreateAccount(
    interaction.user.id,
    interaction.guildId,
    interaction.user.username
  );

  const wallet = Number(account.wallet || 0);

  if (wallet < session.betAmount) {
    return interaction.reply({
      content: `Insufficient funds. You have ${economy.formatMoney(wallet)}.`,
      flags: MessageFlags.Ephemeral
    });
  }

  const number = Math.floor(Math.random() * 37);
  const color = getColor(number);

  let win = false;
  let multiplier = 0;

  if (session.betType === "colour") {
    win = session.betChoice === color;
    multiplier = 2;
  } else if (session.betType === "number") {
    win = Number(session.betChoice) === number;
    multiplier = 36;
  }

  const payout = win ? session.betAmount * multiplier : 0;
  const delta = payout - session.betAmount;
  const newWallet = wallet + delta;

  await economy.updateAccount(interaction.user.id, interaction.guildId, { wallet: newWallet });

  sessionStore.updateSession(interaction.user.id, {
    lastResult: `${win ? "WIN" : "LOSS"} ${delta >= 0 ? "+" : ""}${economy.formatMoney(delta)} — ${number} (${color})`
  });

  const updated = sessionStore.getSession(interaction.user.id);

  return interaction.reply({
    content: `${win ? "✅ You won" : "❌ You lost"} ${economy.formatMoney(Math.abs(delta))}.`,
    embeds: [createSessionEmbed(updated, interaction.user)],
    components: createSessionRows(updated),
    flags: MessageFlags.Ephemeral
  });
}

async function handleCasinoInteraction(interaction) {
  if (interaction.isButton()) {
    const id = String(interaction.customId || "");

    if (id === "casino:roulette:play") return openPrivateSession(interaction);
    if (id === "casino:roulette:amount") return handleAmountButton(interaction);
    if (id === "casino:roulette:bet") return handleBetButton(interaction);
    if (id === "casino:roulette:spin") return handleSpin(interaction);
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "casino:roulette:betselect") {
      return handleBetSelect(interaction);
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId === "casino:roulette:amountmodal") {
      return handleAmountModal(interaction);
    }
  }

  return false;
}

module.exports = {
  openPrivateSession,
  handleCasinoInteraction,
  handleAmountButton,
  handleAmountModal,
  handleBetButton,
  handleBetSelect,
  handleSpin
};
