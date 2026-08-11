// ===================== BOT ป้องกันสแปม + ป้องกัน Raid =====================
// วิธีใช้: ดูไฟล์ README.md ประกอบ

require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  EmbedBuilder,
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
  SPAM_MESSAGE_LIMIT: 5,      // จำนวนข้อความสูงสุดที่ส่งได้
  SPAM_TIME_WINDOW: 6000,     // ภายในกี่มิลลิวินาที (6000 = 6 วินาที)
  SPAM_TIMEOUT_MS: 5 * 60 * 1000, // ระยะเวลาที่โดน timeout (5 นาที)
  SPAM_DUPLICATE_LIMIT: 3,    // ส่งข้อความซ้ำติดกันกี่ครั้งถึงนับว่าสแปม

  // --- กัน Raid (บัญชีใหม่เข้าพร้อมกันจำนวนมาก) ---
  RAID_JOIN_LIMIT: 6,         // จำนวนคนเข้าเซิร์ฟเวอร์สูงสุดในช่วงเวลาที่กำหนด
  RAID_TIME_WINDOW: 10000,    // ภายในกี่มิลลิวินาที (10000 = 10 วินาที)
  RAID_MIN_ACCOUNT_AGE_MS: 3 * 24 * 60 * 60 * 1000, // บัญชีอายุน้อยกว่า 3 วัน = น่าสงสัย
  RAID_ACTION: 'kick',        // 'kick' หรือ 'ban'

  // ช่องที่จะให้บอทส่ง log การทำงาน (ใส่ชื่อช่อง ไม่ใส่ # ก็ได้)
  LOG_CHANNEL_NAME: 'mod-log',
};

// ===================== เก็บสถานะระหว่างรัน =====================
const messageHistory = new Map(); // userId -> [{content, timestamp}]
const joinHistory = [];           // [{userId, timestamp}]
let raidModeUntil = 0;            // ล็อกดาวน์จนถึงเวลานี้ (timestamp)

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
  // ยกเว้นแอดมิน/ผู้ดูแล ไม่โดนเช็คสแปม
  if (member?.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;

  const userId = message.author.id;
  const now = Date.now();

  if (!messageHistory.has(userId)) messageHistory.set(userId, []);
  const history = messageHistory.get(userId);

  history.push({ content: message.content, timestamp: now });

  // ลบข้อความเก่าที่พ้นช่วงเวลาที่ตั้งไว้
  while (history.length && now - history[0].timestamp > CONFIG.SPAM_TIME_WINDOW) {
    history.shift();
  }

  // เช็คสแปมแบบ "ส่งถี่เกินไป"
  const tooFast = history.length > CONFIG.SPAM_MESSAGE_LIMIT;

  // เช็คสแปมแบบ "ข้อความซ้ำติดกัน"
  const lastFew = history.slice(-CONFIG.SPAM_DUPLICATE_LIMIT);
  const allSame =
    lastFew.length === CONFIG.SPAM_DUPLICATE_LIMIT &&
    lastFew.every((m) => m.content === lastFew[0].content && m.content.length > 0);

  if (tooFast || allSame) {
    // ลบข้อความสแปมทั้งหมดของ user นี้ในช่องนี้ (ย้อนหลังไม่กี่ข้อความ)
    try {
      const recentMsgs = await message.channel.messages.fetch({ limit: 20 });
      const toDelete = recentMsgs.filter(
        (m) => m.author.id === userId && now - m.createdTimestamp < CONFIG.SPAM_TIME_WINDOW
      );
      await message.channel.bulkDelete(toDelete, true).catch(() => {});
    } catch (e) {}

    // timeout ผู้ใช้
    try {
      if (member && member.moderatable) {
        await member.timeout(CONFIG.SPAM_TIMEOUT_MS, 'ตรวจพบการสแปมข้อความ');
      }
    } catch (e) {}

    messageHistory.set(userId, []); // เคลียร์ประวัติหลังลงโทษ

    await sendLog(
      message.guild,
      '🚫 ตรวจพบสแปม',
      `ผู้ใช้ <@${userId}> (${message.author.tag}) ถูก timeout ${CONFIG.SPAM_TIMEOUT_MS / 60000} นาที เนื่องจากส่งข้อความสแปมในช่อง <#${message.channel.id}>`
    );
  }
});

// ===================== กัน Raid (บัญชีเข้าเซิร์ฟเวอร์พร้อมกันจำนวนมาก) =====================
client.on('guildMemberAdd', async (member) => {
  const now = Date.now();
  joinHistory.push({ userId: member.id, timestamp: now });

  while (joinHistory.length && now - joinHistory[0].timestamp > CONFIG.RAID_TIME_WINDOW) {
    joinHistory.shift();
  }

  const accountAge = now - member.user.createdTimestamp;
  const isNewAccount = accountAge < CONFIG.RAID_MIN_ACCOUNT_AGE_MS;

  // ถ้ามีคนเข้าจำนวนมากในเวลาสั้นๆ ให้เปิดโหมด raid
  if (joinHistory.length > CONFIG.RAID_JOIN_LIMIT) {
    raidModeUntil = now + 60 * 1000; // ล็อกดาวน์ 1 นาที
    await sendLog(
      member.guild,
      '🚨 ตรวจพบสัญญาณ Raid!',
      `มีสมาชิกเข้าเซิร์ฟเวอร์ ${joinHistory.length} คน ภายใน ${CONFIG.RAID_TIME_WINDOW / 1000} วินาที กำลังเปิดโหมดป้องกันชั่วคราว`,
      0xff0000
    );
  }

  const inRaidMode = now < raidModeUntil;

  if (inRaidMode && isNewAccount) {
    try {
      if (CONFIG.RAID_ACTION === 'ban') {
        await member.ban({ reason: 'ระบบป้องกัน raid: บัญชีใหม่เข้าช่วง raid' });
      } else {
        await member.kick('ระบบป้องกัน raid: บัญชีใหม่เข้าช่วง raid');
      }
      await sendLog(
        member.guild,
        '🛡️ ดำเนินการกับผู้ต้องสงสัย',
        `${member.user.tag} (บัญชีอายุ ${Math.floor(accountAge / (24 * 60 * 60 * 1000))} วัน) ถูก${CONFIG.RAID_ACTION === 'ban' ? 'แบน' : 'เตะ'}อัตโนมัติ เนื่องจากเข้าเซิร์ฟเวอร์ระหว่างสัญญาณ raid`
      );
    } catch (e) {}
  }
});

// ===================== คำสั่งพื้นฐาน =====================
client.on('messageCreate', (message) => {
  if (message.author.bot || !message.guild) return;

  if (message.content === '!status') {
    const embed = new EmbedBuilder()
      .setTitle('🛡️ สถานะระบบป้องกัน')
      .addFields(
        { name: 'กันสแปม', value: `≤ ${CONFIG.SPAM_MESSAGE_LIMIT} ข้อความ / ${CONFIG.SPAM_TIME_WINDOW / 1000} วิ`, inline: true },
        { name: 'กัน Raid', value: `≤ ${CONFIG.RAID_JOIN_LIMIT} คนเข้า / ${CONFIG.RAID_TIME_WINDOW / 1000} วิ`, inline: true },
        { name: 'โหมด Raid ตอนนี้', value: Date.now() < raidModeUntil ? '🔴 กำลังล็อกดาวน์' : '🟢 ปกติ', inline: true }
      )
      .setColor(0x7c5cfc);
    message.channel.send({ embeds: [embed] });
  }
});

client.login(process.env.DISCORD_TOKEN);
