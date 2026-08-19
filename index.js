const {
  Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, MessageFlags, Events, PermissionFlagsBits, REST, Routes,
  SlashCommandBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const config = require('./config');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent, // ต้องเปิด Privileged Intent ใน Developer Portal ด้วย
  ],
  partials: [Partials.Channel], // จำเป็นสำหรับรับ event ข้อความ DM
});

// ===== ตั้งค่า =====
const COOLDOWN_MS = 60 * 60 * 1000; // 1 ชั่วโมง / คน

const CATEGORIES = ['day1', 'day2', 'day3'];
const WIN_CHANCE = { day1: 0.50, day2: 0.25, day3: 0.10 };
const LABEL = { day1: '1 วัน (50%)', day2: '2 วัน (25%)', day3: '3 วัน (10%)' };
const CHOICE_LABEL = { day1: '1 วัน', day2: '2 วัน', day3: '3 วัน' };

// ===== ระบบเก็บ Key (แยกตามประเภทวัน) =====
const DATA_DIR = path.join(__dirname, 'data');
const KEYS_FILE = path.join(DATA_DIR, 'keys.json');
const COOLDOWN_FILE = path.join(DATA_DIR, 'cooldowns.json');
const PANELS_FILE = path.join(DATA_DIR, 'panels.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadKeys() {
  try {
    if (fs.existsSync(KEYS_FILE)) {
      const data = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
      return {
        day1: Array.isArray(data.day1) ? data.day1 : [],
        day2: Array.isArray(data.day2) ? data.day2 : [],
        day3: Array.isArray(data.day3) ? data.day3 : [],
      };
    }
  } catch (e) {}
  return { day1: [], day2: [], day3: [] };
}

function saveKeys(keys) {
  try {
    fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
  } catch (e) {
    console.error('บันทึก Key ไม่สำเร็จ:', e.message);
  }
}

function loadCooldowns() {
  try {
    if (fs.existsSync(COOLDOWN_FILE)) {
      const data = JSON.parse(fs.readFileSync(COOLDOWN_FILE, 'utf8'));
      return data && typeof data === 'object' ? data : {};
    }
  } catch (e) {}
  return {};
}

function saveCooldowns(cooldowns) {
  try {
    fs.writeFileSync(COOLDOWN_FILE, JSON.stringify(cooldowns, null, 2));
  } catch (e) {
    console.error('บันทึกคูลดาวน์ไม่สำเร็จ:', e.message);
  }
}

function loadPanels() {
  try {
    if (fs.existsSync(PANELS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PANELS_FILE, 'utf8'));
      return Array.isArray(data.panels) ? data.panels : [];
    }
  } catch (e) {}
  return [];
}

function savePanels(panels) {
  try {
    fs.writeFileSync(PANELS_FILE, JSON.stringify({ panels }, null, 2));
  } catch (e) {
    console.error('บันทึกรายการหน้าต่างไม่สำเร็จ:', e.message);
  }
}

let keys = loadKeys(); // { day1: [...], day2: [...], day3: [...] }
let cooldowns = loadCooldowns(); // { userId: timestampLastSpin }
let panels = loadPanels(); // [{ channelId, messageId }]

// ป้องกันการกดสุ่มซ้อนกันระหว่างที่กำลังหมุนอยู่
const spinningNow = new Set();

function formatRemaining(ms) {
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h} ชั่วโมง ${m} นาที`;
  return `${m} นาที`;
}

function footerText() {
  return `1วัน เหลือ ${keys.day1.length} • 2วัน เหลือ ${keys.day2.length} • 3วัน เหลือ ${keys.day3.length}`;
}

function parseKeysInput(input) {
  return input.split(/[\n,]+/).map(k => k.trim()).filter(Boolean);
}

// ===== ลงทะเบียนคำสั่งอัตโนมัติ =====
async function deployCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('เลือกห้อง')
      .setDescription('สร้างปุ่มสุ่ม (เลือกระยะเวลา 1/2/3 วัน)')
      .addStringOption(o => o.setName('หัวข้อ').setDescription('ชื่อหัวข้อ / ชื่อหน้าต่าง').setRequired(false).setMaxLength(100))
      .addStringOption(o => o.setName('รายการ1').setDescription('ชื่อห้อง / รายการ').setRequired(true).setMaxLength(80))
      .toJSON(),

    new SlashCommandBuilder()
      .setName('เพิ่มคีย์')
      .setDescription('เพิ่ม Key (แอดมินเท่านั้น)')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addStringOption(o => o.setName('ประเภท').setDescription('ระยะเวลาของ Key').setRequired(true)
        .addChoices(
          { name: '1 วัน', value: 'day1' },
          { name: '2 วัน', value: 'day2' },
          { name: '3 วัน', value: 'day3' },
        ))
      .addStringOption(o => o.setName('keys').setDescription('ใส่ Key คั่นด้วย , หรือขึ้นบรรทัดใหม่').setRequired(true))
      .toJSON(),

    new SlashCommandBuilder()
      .setName('ดูคีย์')
      .setDescription('ดู Key ที่เหลือ (แอดมินเท่านั้น)')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .toJSON(),

    new SlashCommandBuilder()
      .setName('ล้างคีย์')
      .setDescription('ล้าง Key (แอดมินเท่านั้น)')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addStringOption(o => o.setName('ประเภท').setDescription('เลือกประเภทที่จะล้าง (ไม่เลือก = ล้างทั้งหมด)').setRequired(false)
        .addChoices(
          { name: '1 วัน', value: 'day1' },
          { name: '2 วัน', value: 'day2' },
          { name: '3 วัน', value: 'day3' },
          { name: 'ทั้งหมด', value: 'all' },
        ))
      .toJSON(),
  ];

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    if (process.env.GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
      console.log('✅ ลงทะเบียนคำสั่งในเซิร์ฟเวอร์สำเร็จ');
    } else {
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
      console.log('✅ ลงทะเบียนคำสั่ง Global สำเร็จ');
    }
  } catch (err) {
    console.error('ลงทะเบียนคำสั่งไม่สำเร็จ:', err.message);
  }
}

// ===== สร้างแถวปุ่ม 3 ปุ่ม (1/2/3 วัน) =====
function buildRows(idSuffix) {
  const row = new ActionRowBuilder();
  for (const cat of CATEGORIES) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`spin_${cat}_${idSuffix}`)
        .setLabel(LABEL[cat])
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎡')
        .setDisabled(keys[cat].length === 0)
    );
  }
  return [row];
}

function categoryFromCustomId(customId) {
  for (const cat of CATEGORIES) {
    if (customId.startsWith(`spin_${cat}_`)) return cat;
  }
  return null;
}

// ===== อัปเดตข้อความหลัก (แผงปุ่ม): footer จำนวน Key + ล็อกปุ่มที่หมด =====
async function refreshPanel(message) {
  try {
    if (!message || !message.embeds || !message.embeds.length) return;

    const oldEmbed = message.embeds[0];
    const newEmbed = EmbedBuilder.from(oldEmbed).setFooter({ text: footerText() });

    const newRows = message.components.map(row => {
      const newRow = new ActionRowBuilder();
      for (const comp of row.components) {
        const cat = categoryFromCustomId(comp.customId);
        const btn = ButtonBuilder.from(comp);
        if (cat) btn.setDisabled(keys[cat].length === 0);
        newRow.addComponents(btn);
      }
      return newRow;
    });

    await message.edit({ embeds: [newEmbed], components: newRows });
  } catch (e) {
    console.error('อัปเดตแผงปุ่มไม่สำเร็จ:', e.message);
  }
}

// ===== รีเฟรชหน้าต่างที่เคยสร้างไว้ "ทุกอัน" (เรียกทุกครั้งที่คีย์เปลี่ยน) =====
async function refreshAllPanels() {
  if (!panels.length) return;
  const stillValid = [];
  for (const p of panels) {
    try {
      const channel = await client.channels.fetch(p.channelId);
      const message = await channel.messages.fetch(p.messageId);
      await refreshPanel(message);
      stillValid.push(p);
    } catch (e) {
      // ข้อความ/ช่องถูกลบไปแล้ว → ตัดออกจากรายการ
    }
  }
  panels = stillValid;
  savePanels(panels);
}

// ===== วงล้อ (แอนิเมชันแบบรูเล็ต) =====
const WHEEL_SEGMENTS = ['🟩 ได้', '🟥 ไม่ได้', '🟩 ได้', '🟥 ไม่ได้', '🟩 ได้', '🟥 ไม่ได้', '🟩 ได้', '🟥 ไม่ได้'];
const WHEEL_LEN = WHEEL_SEGMENTS.length;
// ดีเลย์แต่ละสเต็ป: เริ่มไวแล้วค่อยๆ ช้าลงเหมือนวงล้อกำลังจะหยุด
const SPIN_DELAYS = [140, 140, 160, 180, 210, 250, 300, 360, 430, 510, 600, 700, 820];

function renderWheelFrame(idx, isFinal) {
  const prev = WHEEL_SEGMENTS[(idx - 1 + WHEEL_LEN) % WHEEL_LEN];
  const cur = WHEEL_SEGMENTS[idx % WHEEL_LEN];
  const next = WHEEL_SEGMENTS[(idx + 1) % WHEEL_LEN];
  const pointer = isFinal ? '     🔽 หยุด! 🔽' : '        🔻';
  return '```\n' +
    `   ${prev}      ${next}\n` +
    `${pointer}\n` +
    `      ▶ ${cur} ◀\n` +
    '```';
}

async function spinWheel(interaction, itemName, category) {
  const chancePercent = Math.round(WIN_CHANCE[category] * 100);
  const isWin = Math.random() < WIN_CHANCE[category];

  // เลือกช่องปลายทางของวงล้อให้ตรงกับผลที่สุ่มได้ไว้ล่วงหน้า
  const matchType = isWin ? 'ได้' : 'ไม่ได้';
  const candidateIdx = WHEEL_SEGMENTS
    .map((seg, i) => ({ seg, i }))
    .filter(o => (o.seg.includes('ไม่ได้') ? 'ไม่ได้' : 'ได้') === matchType)
    .map(o => o.i);
  const finalIndex = candidateIdx[Math.floor(Math.random() * candidateIdx.length)];

  const totalSteps = SPIN_DELAYS.length;
  const startOffset = finalIndex - (totalSteps - 1);

  const spinEmbed = (idx, isFinal) => new EmbedBuilder()
    .setTitle(isFinal ? '🎯 วงล้อหยุดแล้ว!' : '🎡 กำลังหมุนวงล้อ...')
    .setDescription(
      `**${itemName}** • ระยะเวลา **${CHOICE_LABEL[category]}** (โอกาสได้ ${chancePercent}%)\n` +
      renderWheelFrame(idx, isFinal)
    )
    .setColor(isFinal ? (isWin ? 0x57F287 : 0xED4245) : 0x5865F2);

  const idxAt = (i) => (((startOffset + i) % WHEEL_LEN) + WHEEL_LEN) % WHEEL_LEN;

  await interaction.reply({ embeds: [spinEmbed(idxAt(0), false)], flags: MessageFlags.Ephemeral });

  for (let i = 1; i < totalSteps; i++) {
    await new Promise(r => setTimeout(r, SPIN_DELAYS[i]));
    const isLast = i === totalSteps - 1;
    await interaction.editReply({ embeds: [spinEmbed(idxAt(i), isLast)] });
  }

  await new Promise(r => setTimeout(r, 500));

  let resultEmbed;

  if (isWin) {
    if (keys[category].length === 0) {
      resultEmbed = new EmbedBuilder()
        .setTitle('😔 พลาดไปนิดเดียว!')
        .setDescription(`**${itemName}** (${CHOICE_LABEL[category]})\n\n😢 ขออภัย Key ประเภทนี้**หมดพอดี** ไม่สามารถออก Key ให้ได้ในตอนนี้`)
        .setColor(0xFEE75C)
        .setFooter({ text: `สุ่มใหม่ได้อีกครั้งใน ${COOLDOWN_MS / 60000} นาที` });
    } else {
      // ได้ Key → ลบออกทันที (กันซ้ำ)
      const key = keys[category].splice(Math.floor(Math.random() * keys[category].length), 1)[0];
      saveKeys(keys);

      let dmSent = true;
      try {
        await interaction.user.send({
          embeds: [
            new EmbedBuilder()
              .setTitle('🎉 คุณชนะ!')
              .setDescription(`คุณสุ่มจาก **${itemName}** (${CHOICE_LABEL[category]}) แล้วได้ Key\n\n\`\`\`\n${key}\n\`\`\`\nกรุณาเก็บรักษาไว้ดีๆ นะครับ`)
              .setColor(0x57F287)
              .setTimestamp()
          ]
        });
      } catch (err) {
        dmSent = false;
      }

      resultEmbed = new EmbedBuilder()
        .setTitle('🎉 ยินดีด้วย! คุณถูกรางวัล')
        .setDescription(
          `**${itemName}** • **${CHOICE_LABEL[category]}**\n\n` +
          (dmSent
            ? '📩 บอทได้ส่ง Key ของคุณไปทาง DM แล้ว'
            : `⚠️ ส่ง DM ไม่สำเร็จ (คุณปิดรับข้อความจากบอท) นี่คือ Key ของคุณ:\n\`\`\`\n${key}\n\`\`\``)
        )
        .setColor(0x57F287)
        .setFooter({ text: `สุ่มใหม่ได้อีกครั้งใน ${COOLDOWN_MS / 60000} นาที` })
        .setTimestamp();
    }
  } else {
    resultEmbed = new EmbedBuilder()
      .setTitle('😢 ไม่โชคดีในรอบนี้')
      .setDescription(`**${itemName}** • **${CHOICE_LABEL[category]}**\n\nลองใหม่อีกครั้งได้นะ!`)
      .setColor(0xED4245)
      .setFooter({ text: `สุ่มใหม่ได้อีกครั้งใน ${COOLDOWN_MS / 60000} นาที` });
  }

  await interaction.editReply({ embeds: [resultEmbed] });

  // อัปเดตแผงปุ่มหลัก: footer + ล็อกปุ่มที่คีย์หมด
  await refreshPanel(interaction.message);
}

// ===== Ready =====
client.once(Events.ClientReady, async (c) => {
  console.log(`✅ ออนไลน์: ${c.user.tag} | Key: 1วัน=${keys.day1.length} 2วัน=${keys.day2.length} 3วัน=${keys.day3.length}`);

  await deployCommands();

  try {
    const owner = await client.users.fetch(config.ownerId);
    await owner.send({
      embeds: [
        new EmbedBuilder()
          .setTitle('🤖 บอทพร้อมใช้งานแล้ว')
          .setDescription(
            `**สถานะ:** ออนไลน์\n` +
            `**Key คงเหลือ:** 1วัน ${keys.day1.length} • 2วัน ${keys.day2.length} • 3วัน ${keys.day3.length}\n` +
            `**คูลดาวน์:** ${COOLDOWN_MS / 60000} นาที/คน\n\n` +
            `**คำสั่งหลัก:**\n` +
            `\`/เลือกห้อง\` → สร้างปุ่มสุ่ม (1/2/3 วัน)\n` +
            `\`/เพิ่มคีย์\` → เพิ่ม Key ตามประเภท\n` +
            `\`/ดูคีย์\` → ดู Key ที่เหลือ\n` +
            `\`/ล้างคีย์\` → ล้าง Key\n\n` +
            `**ทางลัด:** ส่ง DM ข้อความมาที่บอทได้เลย จะถูกเก็บเป็น Key อัตโนมัติ\n` +
            `นำหน้าด้วย \`1:\`, \`2:\`, \`3:\` เพื่อระบุประเภทวัน (ไม่ใส่ = ถือเป็น 1 วัน)\n` +
            `เช่น \`2:ABCD-1234-EFGH\``
          )
          .setColor(0x57F287)
          .setTimestamp()
      ]
    });
  } catch (e) {
    console.log('ส่ง DM หาเจ้าของไม่สำเร็จ');
  }
});

// ===== รับ DM จากเจ้าของบอท → เก็บเป็น Key อัตโนมัติ =====
client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot) return;
    if (message.guild) return; // เฉพาะ DM เท่านั้น
    if (message.author.id !== config.ownerId) return;

    const raw = message.content?.trim();
    if (!raw) return;

    let category = 'day1';
    let body = raw;

    const prefixMatch = raw.match(/^([123])\s*(?:วัน)?\s*[:\-]\s*([\s\S]+)$/i);
    if (prefixMatch) {
      category = `day${prefixMatch[1]}`;
      body = prefixMatch[2];
    }

    const newKeys = parseKeysInput(body);
    if (!newKeys.length) {
      return message.reply('❌ ไม่พบข้อความ Key ที่จะเพิ่ม');
    }

    keys[category].push(...newKeys);
    saveKeys(keys);
    await refreshAllPanels(); // ปลดล็อกปุ่ม/อัปเดตจำนวนในทุกหน้าต่างที่เคยสร้างไว้

    await message.reply(
      `✅ เพิ่ม Key ประเภท **${CHOICE_LABEL[category]}** สำเร็จ **${newKeys.length}** อัน\n` +
      `ตอนนี้เหลือ: 1วัน ${keys.day1.length} • 2วัน ${keys.day2.length} • 3วัน ${keys.day3.length}`
    );
  } catch (e) {
    console.error('รับ DM key ไม่สำเร็จ:', e.message);
  }
});

// ===== Interaction =====
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const name = interaction.commandName;

      // /เลือกห้อง
      if (name === 'เลือกห้อง') {
        const title = interaction.options.getString('หัวข้อ') || '🎡 เลือกห้อง / สุ่มรางวัล';
        const item = interaction.options.getString('รายการ1', true).trim();

        const idSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const rows = buildRows(idSuffix);

        const embed = new EmbedBuilder()
          .setTitle(title)
          .setDescription(
            `**${item}**\n\n` +
            `เลือกระยะเวลาที่ต้องการสุ่ม แล้วกดปุ่มเพื่อหมุนวงล้อ\n` +
            `สุ่มได้ **1 ครั้ง / ${COOLDOWN_MS / 60000} นาที** ต่อคน\n` +
            `ผลลัพธ์จะเห็นเฉพาะคุณเท่านั้น\n\n` +
            `🔹 ${LABEL.day1}\n🔹 ${LABEL.day2}\n🔹 ${LABEL.day3}`
          )
          .setColor(0x5865F2)
          .setFooter({ text: footerText() })
          .setTimestamp();

        await interaction.reply({ embeds: [embed], components: rows });
        const sentMessage = await interaction.fetchReply();
        panels.push({ channelId: sentMessage.channelId, messageId: sentMessage.id });
        savePanels(panels);
        return;
      }

      // /เพิ่มคีย์
      if (name === 'เพิ่มคีย์') {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: '❌ คำสั่งนี้สำหรับแอดมินเท่านั้น', flags: MessageFlags.Ephemeral });
        }

        const category = interaction.options.getString('ประเภท', true);
        const input = interaction.options.getString('keys', true);
        const newKeys = parseKeysInput(input);

        if (!newKeys.length) {
          return interaction.reply({ content: '❌ ไม่พบ Key ที่จะเพิ่ม', flags: MessageFlags.Ephemeral });
        }

        keys[category].push(...newKeys);
        saveKeys(keys);
        await refreshAllPanels(); // ปลดล็อกปุ่ม/อัปเดตจำนวนในทุกหน้าต่างที่เคยสร้างไว้

        return interaction.reply({
          content: `✅ เพิ่ม Key ประเภท **${CHOICE_LABEL[category]}** สำเร็จ **${newKeys.length}** อัน\n` +
            `ตอนนี้เหลือ: 1วัน ${keys.day1.length} • 2วัน ${keys.day2.length} • 3วัน ${keys.day3.length}`,
          flags: MessageFlags.Ephemeral
        });
      }

      // /ดูคีย์
      if (name === 'ดูคีย์') {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: '❌ คำสั่งนี้สำหรับแอดมินเท่านั้น', flags: MessageFlags.Ephemeral });
        }

        const section = (cat) => {
          const list = keys[cat];
          if (!list.length) return 'ไม่มี Key เหลือแล้ว';
          return list.slice(0, 10).map((k, i) => `${i + 1}. \`${k}\``).join('\n') +
            (list.length > 10 ? `\n...และอีก ${list.length - 10} อัน` : '');
        };

        return interaction.reply({
          content:
            `🔑 **Key คงเหลือ**\n\n` +
            `**1 วัน (${keys.day1.length} อัน)**\n${section('day1')}\n\n` +
            `**2 วัน (${keys.day2.length} อัน)**\n${section('day2')}\n\n` +
            `**3 วัน (${keys.day3.length} อัน)**\n${section('day3')}`,
          flags: MessageFlags.Ephemeral
        });
      }

      // /ล้างคีย์
      if (name === 'ล้างคีย์') {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: '❌ คำสั่งนี้สำหรับแอดมินเท่านั้น', flags: MessageFlags.Ephemeral });
        }

        const target = interaction.options.getString('ประเภท') || 'all';

        if (target === 'all') {
          keys = { day1: [], day2: [], day3: [] };
          saveKeys(keys);
          await refreshAllPanels(); // ล็อกปุ่มทุกหน้าต่างทันทีเมื่อคีย์ถูกล้าง
          return interaction.reply({ content: '🗑️ ล้าง Key ทั้งหมด (ทุกประเภท) เรียบร้อยแล้ว', flags: MessageFlags.Ephemeral });
        } else {
          keys[target] = [];
          saveKeys(keys);
          await refreshAllPanels();
          return interaction.reply({ content: `🗑️ ล้าง Key ประเภท **${CHOICE_LABEL[target]}** เรียบร้อยแล้ว`, flags: MessageFlags.Ephemeral });
        }
      }
    }

    // กดปุ่ม
    if (interaction.isButton() && interaction.customId.startsWith('spin_')) {
      const category = categoryFromCustomId(interaction.customId);
      if (!category) return;

      const userId = interaction.user.id;

      if (spinningNow.has(userId)) {
        return interaction.reply({ content: '⏳ กำลังหมุนอยู่ กรุณารอสักครู่...', flags: MessageFlags.Ephemeral });
      }

      // เช็คคูลดาวน์ 1 ชั่วโมง/คน
      const now = Date.now();
      const lastSpin = cooldowns[userId] || 0;
      const elapsed = now - lastSpin;

      if (elapsed < COOLDOWN_MS) {
        const remaining = COOLDOWN_MS - elapsed;
        return interaction.reply({
          content: `⏰ คุณเพิ่งสุ่มไปแล้ว กรุณารออีก **${formatRemaining(remaining)}** ก่อนสุ่มครั้งถัดไป`,
          flags: MessageFlags.Ephemeral
        });
      }

      // เช็คคีย์หมด (ล็อกไม่ให้สุ่ม) ก่อนเริ่มหมุน
      if (keys[category].length === 0) {
        await refreshPanel(interaction.message); // sync ปุ่มให้ล็อกทันทีเผื่อยังไม่ได้อัปเดต
        return interaction.reply({ content: `😢 ขออภัย **Key ประเภท ${CHOICE_LABEL[category]} หมดแล้ว**`, flags: MessageFlags.Ephemeral });
      }

      // ล็อกคูลดาวน์ทันทีก่อนหมุน กันกดรัว/สแปม
      cooldowns[userId] = now;
      saveCooldowns(cooldowns);
      spinningNow.add(userId);

      try {
        const itemName = interaction.message.embeds[0]?.description?.split('\n')[0]?.replace(/\*\*/g, '') || 'รางวัล';
        await spinWheel(interaction, itemName, category);
      } finally {
        spinningNow.delete(userId);
      }
    }

  } catch (err) {
    console.error(err);
    const msg = { content: '❌ เกิดข้อผิดพลาด กรุณาลองใหม่', flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply(msg).catch(() => {});
    } else {
      await interaction.reply(msg).catch(() => {});
    }
  }
});

client.login(process.env.TOKEN);
