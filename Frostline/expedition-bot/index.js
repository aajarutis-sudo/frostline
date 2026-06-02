require('dotenv').config();
const { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Events } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const schedule = require('node-schedule');
const path = require('path');
const fs = require('fs');

const token = process.env.DISCORD_TOKEN;
const ANNOUNCE_CHANNEL_ID = process.env.ANNOUNCE_CHANNEL_ID;
const STAFF_CHANNEL_ID = process.env.STAFF_CHANNEL_ID;
const STAFF_LOG_CHANNEL_ID = process.env.STAFF_LOG_CHANNEL_ID;

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages], partials: [Partials.Channel] });

function colorForCategory(cat){
  const m = cat.toLowerCase();
  if(m.includes('casual')) return 0x57F287; // green
  if(m.includes('hardcore')) return 0xED4245; // red
  if(m.includes('event')) return 0x3B82F6; // blue
  return 0x5865F2;
}

function saveExpedition(exp){
  db.save(exp);
  // schedule reminders
  try{
    const start = new Date(exp.date_time);
    if(isNaN(start)) return;
    const t24 = new Date(start.getTime() - 24*60*60*1000);
    const t1 = new Date(start.getTime() - 60*60*1000);
    if(t24 > new Date()) schedule.scheduleJob(t24, ()=>sendReminder(exp.id, '24 hours'));
    if(t1 > new Date()) schedule.scheduleJob(t1, ()=>sendReminder(exp.id, '1 hour'));
  }catch(e){console.error(e);}
}

async function sendReminder(expId, label){
  const exp = db.get(expId);
  if(!exp) return;
  const channel = await client.channels.fetch(exp.announce_channel_id).catch(()=>null);
  if(channel) channel.send({content:`🔔 Reminder (${label}): Expedition **${exp.id}** starts at ${exp.date_time}`});
  // DM attendees
  for(const id of exp.attendees||[]){
    try{
      const user = await client.users.fetch(id);
      if(exp.reminders_opt_out && exp.reminders_opt_out.includes(id)) continue;
      await user.send(`Reminder: The expedition (${exp.id}) starts at ${exp.date_time}.`);
    }catch(e){console.warn('DM failed for', id);}
  }
}

client.once('ready', ()=>{
  console.log('Ready');
  // reschedule existing reminders
  const exps = db.all();
  for(const e of exps) saveExpedition(e);
});

client.on(Events.InteractionCreate, async interaction =>{
  if(interaction.isChatInputCommand()){
    const name = interaction.commandName;
    // basic staff check: require MANAGE_GUILD permission or role membership
    const member = interaction.member;
    const isStaff = member.permissions.has('ManageGuild') || (member.roles && member.roles.cache.some(r=>r.name && r.name.toLowerCase().includes('staff')));
    if(!isStaff){
      await interaction.reply({ephemeral:true, content:'You must be staff to use this command.'});
      return;
    }
    if(interaction.channelId !== ANNOUNCE_CHANNEL_ID){
      await interaction.reply({ephemeral:true, content:'This command can only be used in the designated announcement channel.'});
      return;
    }

    if(name === 'expedition'){
      const message = interaction.options.getString('message');
      const link = interaction.options.getString('private_server_link');
      const max = interaction.options.getInteger('max_capacity');
      const date_time = interaction.options.getString('date_time');
      const location = interaction.options.getString('location');
      const difficulty = interaction.options.getString('difficulty');
      const gear = interaction.options.getString('gear_requirements') || 'None';
      const category = interaction.options.getString('category');

      const id = uuidv4().split('-')[0];
      const embed = new EmbedBuilder()
        .setTitle('Expedition Announcement')
        .setDescription(message)
        .addFields(
          {name:'Date & Time', value: date_time, inline:true},
          {name:'Location', value: location, inline:true},
          {name:'Difficulty', value: difficulty, inline:true},
          {name:'Gear', value: gear, inline:false},
          {name:'Capacity', value: `0/${max}`, inline:true},
          {name:'Category', value: category, inline:true}
        )
        .setColor(colorForCategory(category))
        .setFooter({text:`Expedition ID: ${id}`});

      const joinBtn = new ButtonBuilder()
        .setCustomId(`join_${id}`)
        .setLabel('✅ Join Expedition')
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(joinBtn);

      const msg = await interaction.channel.send({embeds:[embed], components:[row]});

      const exp = {
        id,
        message,
        private_server_link: link,
        max_capacity: max,
        date_time,
        location,
        difficulty,
        gear_requirements: gear,
        category,
        announce_channel_id: interaction.channelId,
        message_id: msg.id,
        attendees: [],
        waitlist: [],
        reminders_opt_out: [],
        created_by: interaction.user.id,
        cancelled: false,
        created_at: new Date().toISOString()
      };
      saveExpedition(exp);
      // staff log
      if(STAFF_LOG_CHANNEL_ID){
        const log = await client.channels.fetch(STAFF_LOG_CHANNEL_ID).catch(()=>null);
        if(log) log.send(`Expedition created: ${id} by ${interaction.user.tag}`);
      }

      await interaction.reply({ephemeral:true, content:`Expedition created with ID ${id}`});
    }

    if(name === 'expedition-list'){
      const id = interaction.options.getString('expedition_id');
      const exp = db.get(id);
      if(!exp) return interaction.reply({ephemeral:true, content:'Expedition not found.'});
      const a = exp.attendees || [];
      const w = exp.waitlist || [];
      await interaction.reply({ephemeral:true, content:`Attendees (${a.length}): ${a.join(', ') || 'None'}\nWaitlist (${w.length}): ${w.join(', ') || 'None'}`});
    }

    if(name === 'expedition-cancel'){
      const id = interaction.options.getString('expedition_id');
      const exp = db.get(id);
      if(!exp) return interaction.reply({ephemeral:true, content:'Not found.'});
      exp.cancelled = true;
      db.save(exp);
      // notify all
      for(const uid of (exp.attendees||[]).concat(exp.waitlist||[])){
        try{ const u = await client.users.fetch(uid); await u.send(`Expedition ${id} has been cancelled.`); }catch(e){}
      }
      // update message
      try{
        const ch = await client.channels.fetch(exp.announce_channel_id);
        const m = await ch.messages.fetch(exp.message_id);
        const e = EmbedBuilder.from(m.embeds[0]).setTitle('CANCELLED: ' + m.embeds[0].title);
        await m.edit({embeds:[e], components:[]});
      }catch(e){}
      if(STAFF_LOG_CHANNEL_ID){ const log = await client.channels.fetch(STAFF_LOG_CHANNEL_ID).catch(()=>null); if(log) log.send(`Expedition ${id} cancelled by ${interaction.user.tag}`); }
      await interaction.reply({ephemeral:true, content:'Expedition cancelled.'});
    }

    if(name === 'expedition-kick'){
      const id = interaction.options.getString('expedition_id');
      const user = interaction.options.getUser('user');
      const exp = db.get(id);
      if(!exp) return interaction.reply({ephemeral:true, content:'Not found.'});
      const idx = (exp.attendees||[]).indexOf(user.id);
      if(idx === -1) return interaction.reply({ephemeral:true, content:'User not in attendees.'});
      exp.attendees.splice(idx,1);
      // promote waitlist
      if(exp.waitlist && exp.waitlist.length>0){
        const promoted = exp.waitlist.shift();
        exp.attendees.push(promoted);
        try{ const u = await client.users.fetch(promoted); await u.send(`You've been promoted from the waitlist for expedition ${id}. Link: ${exp.private_server_link}`); }catch(e){}
      }
      db.save(exp);
      try{ await user.send(`You've been removed from expedition ${id} by staff.`); }catch(e){}
      await interaction.reply({ephemeral:true, content:'User removed.'});
    }

  } else if(interaction.isButton()){
    const id = interaction.customId.replace('join_','');
    const exp = db.get(id);
    if(!exp) return interaction.reply({ephemeral:true, content:'Expedition not found.'});
    if(exp.cancelled) return interaction.reply({ephemeral:true, content:'This expedition is cancelled.', ephemeral:true});

    const uid = interaction.user.id;
    if((exp.attendees||[]).includes(uid)){
      // allow leaving: remove and promote
      exp.attendees = (exp.attendees||[]).filter(x=>x!==uid);
      if(exp.waitlist && exp.waitlist.length>0){
        const promoted = exp.waitlist.shift();
        exp.attendees.push(promoted);
        try{ const u = await client.users.fetch(promoted); await u.send(`You've been promoted from the waitlist for expedition ${id}. Link: ${exp.private_server_link}`); }catch(e){}
      }
      db.save(exp);
      // update embed capacity field
      try{ const ch = await client.channels.fetch(exp.announce_channel_id); const m = await ch.messages.fetch(exp.message_id); const e = EmbedBuilder.from(m.embeds[0]); const fields = e.data.fields.map(f=> f.name==='Capacity' ? {name:'Capacity', value:`${(exp.attendees||[]).length}/${exp.max_capacity}`, inline:true} : f); e.setFields(fields); await m.edit({embeds:[e]}); }catch(e){}
      return interaction.reply({ephemeral:true, content:'You have left the expedition.'});
    }

    // trying to join
    if((exp.attendees||[]).length < exp.max_capacity){
      exp.attendees.push(uid);
      db.save(exp);
      // DM the user the private link and include opt-out button
      try{
        const dm = await interaction.user.send({content:`You've signed up for expedition ${id}! Here's your private server link: ${exp.private_server_link}`});
      }catch(e){
        // can't DM
        await interaction.reply({ephemeral:true, content:"Couldn't DM you. Please enable DMs from server members."});
        return;
      }
      // update embed capacity
      try{ const ch = await client.channels.fetch(exp.announce_channel_id); const m = await ch.messages.fetch(exp.message_id); const e = EmbedBuilder.from(m.embeds[0]); const fields = e.data.fields.map(f=> f.name==='Capacity' ? {name:'Capacity', value:`${(exp.attendees||[]).length}/${exp.max_capacity}`, inline:true} : f); e.setFields(fields); await m.edit({embeds:[e]}); }catch(e){console.warn('update embed failed');}
      await interaction.reply({ephemeral:true, content:"✅ You're in! Check your DMs"});
      // staff dashboard/log update
      if(STAFF_CHANNEL_ID){ const ch = await client.channels.fetch(STAFF_CHANNEL_ID).catch(()=>null); if(ch) ch.send(`Signup: ${interaction.user.tag} -> ${id}`); }
      return;
    } else {
      // full -> add to waitlist
      if(!exp.waitlist) exp.waitlist = [];
      if(exp.waitlist.includes(uid)) return interaction.reply({ephemeral:true, content:'You are already on the waitlist.'});
      exp.waitlist.push(uid);
      db.save(exp);
      await interaction.reply({ephemeral:true, content:'Expedition full — you have been added to the waitlist.'});
      return;
    }
  }
});

client.login(token);
