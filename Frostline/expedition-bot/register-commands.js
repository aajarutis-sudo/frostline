require('dotenv').config();
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const { SlashCommandBuilder } = require('@discordjs/builders');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

const commands = [
  new SlashCommandBuilder()
    .setName('expedition')
    .setDescription('Create an expedition announcement (staff only)')
    .addStringOption(o => o.setName('message').setDescription('Announcement message').setRequired(true))
    .addStringOption(o => o.setName('private_server_link').setDescription('Private server link').setRequired(true))
    .addIntegerOption(o => o.setName('max_capacity').setDescription('Max attendees').setRequired(true))
    .addStringOption(o => o.setName('date_time').setDescription('Date and time (ISO)').setRequired(true))
    .addStringOption(o => o.setName('location').setDescription('Meeting location').setRequired(true))
    .addStringOption(o => o.setName('difficulty').setDescription('Difficulty').setRequired(true))
    .addStringOption(o => o.setName('gear_requirements').setDescription('Gear requirements').setRequired(false))
    .addStringOption(o => o.setName('category').setDescription('Category').setRequired(true)),

  new SlashCommandBuilder()
    .setName('expedition-list')
    .setDescription('Show signup and waitlist for an expedition')
    .addStringOption(o => o.setName('expedition_id').setRequired(true)),

  new SlashCommandBuilder()
    .setName('expedition-cancel')
    .setDescription('Cancel an expedition')
    .addStringOption(o => o.setName('expedition_id').setRequired(true)),

  new SlashCommandBuilder()
    .setName('expedition-kick')
    .setDescription('Remove a user from an expedition')
    .addStringOption(o => o.setName('expedition_id').setRequired(true))
    .addUserOption(o => o.setName('user').setDescription('User to remove').setRequired(true))
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('Registering commands...');
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log('Commands registered.');
  } catch (err) {
    console.error(err);
  }
})();
