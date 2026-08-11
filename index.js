// ===================== BOT: กันสแปม + ระบบ Ticket + ระบบเครดิต =====================
// วิธีใช้: ดูไฟล์ README.md ประกอบ

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Message, Partials.Channel],
});

// ===================== ตั้งค่า (ปรับได้ตามต้องการ) =====================
const CONFIG = {
  // --- กันสแปม ---
  SPAM_MESSAGE_LIMIT: 5,
  SPAM_TIME_WINDOW: 6000,
  SPAM_TIMEOUT_MS: 5 * 60 * 1000,
  SPAM_DUPLICATE_LIMIT: 3,

  LOG_CHANNEL_NAME: 'mod-log',

  // --- ระบบ Ticket ---
  TICKET_CATEGORY_NAME: null,   // ใส่ชื่อ category ถ้าอยากให้ห้อง ticket ไปรวมกัน เช่น 'TICKETS'
  TICKET_STAFF_ROLE_NAME: null, // ใส่ชื่อโรลทีมงานถ้ามี เช่น 'Staff'

  // --- ระบบเครดิต ---
  // ใครสั่งเติม/หักเครดิตได้: ต้องมีสิทธิ์ Manage Server ขึ้นไป (เจ้าของ/แอดมินเท่านั้น)
};

// ===================== เก็บสถานะระหว่างรัน =====================
const messageHistory = new Map(); // userId -> [{content, timestamp}]

// ===================== ระบบเครดิต (เก็บลงไฟล์) =====================
const DATA_DIR = path.join(__dirname, 'data');
const CREDITS_FILE = path.join(DATA_DIR, 'credits.json');

function loadCredits() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(CREDITS_FILE)) fs.writeFileSync(CREDITS_FILE, '{}');
    return JSON.parse(fs.readFileSync(CREDITS_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveCredits(data) {
  try {
    fs.writeFileSync(CREDITS_FILE, JSON.stringify(data, null, 2));
  } catch (e) {}
}

function getCredit(userId) {
  const data = loadCredits();
  return data[userId] || 0;
}

function addCredit(userId, amount) {
  const data = loadCredits();
  data[userId] = (data[userId] || 0) + amount;
  saveCredits(data);
  return data[userId];
}

function isAdmin(member) {
  return member?.permissions.has(PermissionsBitField.Flags.ManageGuild);
}

client.once('ready', () => {
  console.log(`✅ บอทออนไลน์แล้ว: ${client.user.tag}`);
  client.user.setActivity('ป้องกันเซิร์ฟเวอร์ 🛡️');
});

// ===================== ฟังก์ชันช่วย =====================
function getLogChannel(guild) {
  return guild.channels.cache.find(
    (c) => c.name === CONFIG.LOG_CHANNEL_NAME && c.isTextBased()
  );
}

async function sendLog(guild, title, description, color = 0xff2e7e) {
  const ch = getLogChannel(guild);
  if (!ch) return;
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();
  ch.send({ embeds: [embed] }).catch(() => {});
}

// ===================== กันสแปมข้อความ =====================
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const member = message.member;
  if (member?.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    handleCommands(message);
    return;
  }

  const userId = message.author.id;
  const now = Date.now();

  if (!messageHistory.has(userId)) messageHistory.set(userId, []);
  const history = messageHistory.get(userId);
  history.push({ content: message.content, timestamp: now });

  while (history.length && now - history[0].timestamp > CONFIG.SPAM_TIME_WINDOW) {
    history.shift();
  }

  const tooFast = history.length > CONFIG.SPAM_MESSAGE_LIMIT;
  const lastFew = history.slice(-CONFIG.SPAM_DUPLICATE_LIMIT);
  const allSame =
    lastFew.length === CONFIG.SPAM_DUPLICATE_LIMIT &&
    lastFew.every((m) => m.content === lastFew[0].content && m.content.length > 0);

  if (tooFast || allSame) {
    try {
      const recentMsgs = await message.channel.messages.fetch({ limit: 20 });
      const toDelete = recentMsgs.filter(
        (m) => m.author.id === userId && now - m.createdTimestamp < CONFIG.SPAM_TIME_WINDOW
      );
      await message.channel.bulkDelete(toDelete, true).catch(() => {});
    } catch (e) {}

    try {
      if (member && member.moderatable) {
        await member.timeout(CONFIG.SPAM_TIMEOUT_MS, 'ตรวจพบการสแปมข้อความ');
      }
    } catch (e) {}

    messageHistory.set(userId, []);

    await sendLog(
      message.guild,
      '🚫 ตรวจพบสแปม',
      `ผู้ใช้ <@${userId}> (${message.author.tag}) ถูก timeout ${CONFIG.SPAM_TIMEOUT_MS / 60000} นาที เนื่องจากส่งข้อความสแปมในช่อง <#${message.channel.id}>`
    );
    return;
  }

  handleCommands(message);
});

// ===================== คำสั่งทั้งหมด =====================
function handleCommands(message) {
  const content = message.content.trim();
  const args = content.split(/\s+/);
  const cmd = args[0];

  // ---------- สถานะระบบ ----------
  if (cmd === '!status') {
    const embed = new EmbedBuilder()
      .setTitle('🛡️ สถานะระบบ')
      .addFields(
        { name: 'กันสแปม', value: `≤ ${CONFIG.SPAM_MESSAGE_LIMIT} ข้อความ / ${CONFIG.SPAM_TIME_WINDOW / 1000} วิ`, inline: true },
        { name: 'ระบบ Ticket', value: '🟢 พิมพ์ !ticket-panel', inline: true },
        { name: 'ระบบเครดิต', value: '🟢 พิมพ์ !credit', inline: true }
      )
      .setColor(0x7c5cfc);
    message.channel.send({ embeds: [embed] });
    return;
  }

  // ---------- ตั้งป้าย Ticket ----------
  if (cmd === '!ticket-panel') {
    postTicketPanel(message.channel);
    return;
  }

  // ---------- เช็คเครดิตของตัวเอง (หรือแอดมินเช็คของคนอื่น) ----------
  if (cmd === '!credit') {
    const target = message.mentions.users.first();
    if (target && !isAdmin(message.member)) {
      message.reply('เช็คเครดิตของคนอื่นได้เฉพาะแอดมินเท่านั้นครับ');
      return;
    }
    const userId = target ? target.id : message.author.id;
    const bal = getCredit(userId);
    const embed = new EmbedBuilder()
      .setTitle('💰 ยอดเครดิต')
      .setDescription(`<@${userId}> มีเครดิตอยู่ **${bal.toLocaleString()}** เครดิต`)
      .setColor(0x2fe6a7);
    message.channel.send({ embeds: [embed] });
    return;
  }

  // ---------- เติมเครดิต (แอดมินเท่านั้น) ----------
  if (cmd === '!addcredit') {
    if (!isAdmin(message.member)) {
      message.reply('คำสั่งนี้ใช้ได้เฉพาะแอดมิน (ต้องมีสิทธิ์ Manage Server)');
      return;
    }
    const target = message.mentions.users.first();
    const amount = parseInt(args[2], 10);
    if (!target || isNaN(amount) || amount <= 0) {
      message.reply('ใช้แบบนี้ครับ: `!addcredit @ลูกค้า จำนวน` เช่น `!addcredit @somchai 100`');
      return;
    }
    const newBal = addCredit(target.id, amount);
    const embed = new EmbedBuilder()
      .setTitle('✅ เติมเครดิตสำเร็จ')
      .setDescription(`เติม **${amount.toLocaleString()}** เครดิตให้ <@${target.id}>\nยอดคงเหลือ: **${newBal.toLocaleString()}** เครดิต`)
      .setColor(0x2fe6a7);
    message.channel.send({ embeds: [embed] });
    sendLog(
      message.guild,
      '💰 เติมเครดิต',
      `${message.author.tag} เติม ${amount} เครดิตให้ <@${target.id}> (ยอดใหม่ ${newBal})`
    );
    return;
  }

  // ---------- หักเครดิต (แอดมินเท่านั้น) ----------
  if (cmd === '!removecredit') {
    if (!isAdmin(message.member)) {
      message.reply('คำสั่งนี้ใช้ได้เฉพาะแอดมิน (ต้องมีสิทธิ์ Manage Server)');
      return;
    }
    const target = message.mentions.users.first();
    const amount = parseInt(args[2], 10);
    if (!target || isNaN(amount) || amount <= 0) {
      message.reply('ใช้แบบนี้ครับ: `!removecredit @ลูกค้า จำนวน`');
      return;
    }
    const newBal = addCredit(target.id, -amount);
    const embed = new EmbedBuilder()
      .setTitle('➖ หักเครดิตแล้ว')
      .setDescription(`หัก **${amount.toLocaleString()}** เครดิตจาก <@${target.id}>\nยอดคงเหลือ: **${newBal.toLocaleString()}** เครดิต`)
      .setColor(0xff2e7e);
    message.channel.send({ embeds: [embed] });
    sendLog(
      message.guild,
      '➖ หักเครดิต',
      `${message.author.tag} หัก ${amount} เครดิตจาก <@${target.id}> (ยอดใหม่ ${newBal})`
    );
    return;
  }
}

// ===================== ระบบ Ticket =====================
async function postTicketPanel(channel) {
  const embed = new EmbedBuilder()
    .setTitle('🎫 เปิดตั๋วซื้อของ / เติมเครดิต')
    .setDescription('กดปุ่มด้านล่างเพื่อเปิดห้องส่วนตัวคุยกับแอดมิน\nโอนเงินผ่าน QR แล้วแคปสลิปส่งในห้องที่เปิดได้เลย')
    .setColor(0x00e5ff);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('open_ticket')
      .setLabel('เปิดตั๋ว')
      .setEmoji('🎫')
      .setStyle(ButtonStyle.Primary)
  );

  await channel.send({ embeds: [embed], components: [row] });
}

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  // ----- เปิดตั๋ว -----
  if (interaction.customId === 'open_ticket') {
    const guild = interaction.guild;
    const user = interaction.user;

    const existing = guild.channels.cache.find((c) => c.topic === `ticket-owner:${user.id}`);
    if (existing) {
      await interaction.reply({ content: `คุณมีตั๋วที่เปิดอยู่แล้วที่ <#${existing.id}>`, ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const overwrites = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
        ],
      },
      {
        id: client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
        ],
      },
    ];

    if (CONFIG.TICKET_STAFF_ROLE_NAME) {
      const staffRole = guild.roles.cache.find((r) => r.name === CONFIG.TICKET_STAFF_ROLE_NAME);
      if (staffRole) {
        overwrites.push({
          id: staffRole.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        });
      }
    }

    let category = null;
    if (CONFIG.TICKET_CATEGORY_NAME) {
      category = guild.channels.cache.find(
        (c) => c.name === CONFIG.TICKET_CATEGORY_NAME && c.type === ChannelType.GuildCategory
      );
    }

    const safeName = user.username.toLowerCase().replace(/[^a-z0-9ก-๙]/gi, '').slice(0, 20) || 'user';

    try {
      const ticketChannel = await guild.channels.create({
        name: `ticket-${safeName}`,
        type: ChannelType.GuildText,
        parent: category ? category.id : undefined,
        topic: `ticket-owner:${user.id}`,
        permissionOverwrites: overwrites,
      });

      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('ปิดตั๋ว')
          .setEmoji('🔒')
          .setStyle(ButtonStyle.Danger)
      );

      const welcomeEmbed = new EmbedBuilder()
        .setTitle('🎫 ตั๋วของคุณ')
        .setDescription(
          `สวัสดี <@${user.id}> 👋\n\n` +
          `**วิธีซื้อ:** โอนเงินผ่าน QR ที่แอดมินแนบให้ → แคปสลิปส่งในห้องนี้ → รอแอดมินตรวจสอบและเติมเครดิต/ส่งของให้\n\n` +
          `เช็คยอดเครดิตของคุณได้ด้วยคำสั่ง \`!credit\`\n` +
          `กดปุ่ม "ปิดตั๋ว" ด้านล่างเมื่อเสร็จธุระแล้ว`
        )
        .setColor(0x7c5cfc);

      await ticketChannel.send({ embeds: [welcomeEmbed], components: [closeRow] });
      await interaction.editReply({ content: `เปิดตั๋วให้แล้วที่ <#${ticketChannel.id}>` });

      await sendLog(guild, '🎫 เปิดตั๋วใหม่', `${user.tag} เปิดตั๋วที่ <#${ticketChannel.id}>`, 0x00e5ff);
    } catch (e) {
      await interaction.editReply({ content: 'สร้างห้องตั๋วไม่สำเร็จ กรุณาเช็คสิทธิ์ของบอท (ต้องมี Manage Channels)' });
    }
  }

  // ----- ปิดตั๋ว -----
  if (interaction.customId === 'close_ticket') {
    await interaction.reply({ content: 'ห้องนี้จะถูกปิดใน 5 วินาที...' });
    setTimeout(() => {
      interaction.channel.delete().catch(() => {});
    }, 5000);
  }
});

client.login(process.env.DISCORD_TOKEN);
