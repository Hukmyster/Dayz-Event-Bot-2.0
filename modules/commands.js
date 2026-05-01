const { SlashCommandBuilder } = require("discord.js");

module.exports = [

    new SlashCommandBuilder().setName("shop").setDescription("View shop"),

    new SlashCommandBuilder().setName("additem").setDescription("Add item"),

    new SlashCommandBuilder()
        .setName("buy")
        .setDescription("Buy item")
        .addStringOption(o =>
            o.setName("item").setDescription("Item").setAutocomplete(true).setRequired(true)
        )
        .addIntegerOption(o =>
            o.setName("x").setDescription("X coord").setRequired(true)
        )
        .addIntegerOption(o =>
            o.setName("z").setDescription("Z coord").setRequired(true)
        ),

    new SlashCommandBuilder().setName("orders").setDescription("View orders"),
    new SlashCommandBuilder().setName("queue").setDescription("Queue orders"),
    new SlashCommandBuilder().setName("build").setDescription("Build XML"),
    new SlashCommandBuilder().setName("cycle").setDescription("Complete orders"),
    new SlashCommandBuilder().setName("viewxml").setDescription("View XML")
];
