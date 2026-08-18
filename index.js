const {
  Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, MessageFlags, Events, PermissionFlagsBits, REST, Routes,
  SlashCommandBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const config = require('./config');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ===== ระบบเก็บ Key =====
const DATA_DIR = path.join(__dirname, 'data');
const KEYS_FILE = path.join(DATA_DIR, 'keys.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadKeys() {
  try {
    if (fs.existsSync(KEYS_FILE)) {
      const data = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
      return Array.isArray(data.keys) ? data.keys : [];
    }
  } catch (e) {}
  return [];
}

function saveKeys(keys) {
  fs.writeFileSync(KEYS_FILE, JSON.stringify({ keys }, null, 2));
}

let availableKeys = loadKeys();

// ===== ลงทะเบียนคำสั่งอัตโนมัติ =====
async function deployCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('เลือกห้อง')
      .setDescription('สร้างปุ่มเลือกห้อง สูงสุด 10 อัน')
      .addStringOption(o => o.setName('รายการ1').setDescription('รายการที่ 1').setRequired(true).setMaxLength(80))
      .addStringOption(o => o.setName('รายการ2').setDescription('รายการที่ 2').setRequired(false).setMaxLength(80))
      .addStringOption(o => o.setName('รายการ3').setDescription('รายการที่ 3').setRequired(false).setMaxLength(80))
      .addStringOption(o => o.setName('รายการ4').setDescription('รายการที่ 4').setRequired(false).setMaxLength(80))
      .addStringOption(o => o.setName('รายการ5').setDescription('รายการที่ 5').setRequired(false).setMaxLength(80))
      .addStringOption(o => o.setName('รายการ6').setDescription('รายการที่ 6').setRequired(false).setMaxLength(80))
      .addStringOption(o => o.setName('รายการ7').setDescription('รายการที่ 7').setRequired(false).setMaxLength(80))
      .addStringOption(o => o.setName('รายการ8').setDescription('รายการที่ 8').setRequired(false).setMaxLength(80))
      .addStringOption(o => o.setName('รายการ9').setDescription('รายการที่ 9').setRequired(false).setMaxLength(80))
      .addStringOption(o => o.setName('รายการ10').setDescription('รายการที่ 10').setRequired(false).setMaxLength(80))
      .toJSON(),

    new SlashCommandBuilder()
      .setName('เพิ่มคีย์')
      .setDescription('เพิ่ม Key (แอดมินเท่านั้น)')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addStringOption(o => o.setName('keys').setDescription('ใส่ Key คั่นด้วย ,').setRequired(true))
      .toJSON(),

    new SlashCommandBuilder()
      .setName('ดูคีย์')
      .setDescription('ดู Key ที่เหลือ (แอดมินเท่านั้น)')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .toJSON(),

    new SlashCommandBuilder()
      .setName('ล้างคีย์')
      .setDescription('ล้าง Key ทั้งหมด (แอดมินเท่านั้น)')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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

// ===== วงล้อ =====
async function spinWheel(interaction, itemName) {
  const frames = [
    '🎡 ▶ ได้ ◀     ไม่ได้',
    '🎡   ได้   ▶ ไม่ได้ ◀',
    '🎡 ▶ ได้ ◀     ไม่ได้',
    '🎡   ได้   ▶ ไม่ได้ ◀',
    '🎡 ▶ ได้ ◀     ไม่ได้',
  ];

  await interaction.reply({
    content: `${config.messages.spinning}\n**${itemName}**\n\`\`\`\n${frames[0]}\n\`\`\``,
    flags: MessageFlags.Ephemeral,
  });

  for (let i = 1; i < frames.length; i++) {
    await new Promise(r => setTimeout(r, 350));
    await interaction.editReply({ content: `${config.messages.spinning}\n**${itemName}**\n\`\`\`\n${frames[i]}\n\`\`\`` });
  }

  const isWin = Math.random() < config.winChance;
  let msg;

  if (isWin) {
    if (availableKeys.length === 0) {
      msg = config.messages.noKeys;
    } else {
      const key = availableKeys.splice(Math.floor(Math.random() * availableKeys.length), 1)[0];
      saveKeys(availableKeys);
      msg = config.messages.win.replace('{key}', key);
    }
  } else {
    msg = config.messages.lose;
  }

  await new Promise(r => setTimeout(r, 400));
  await interaction.editReply({ content: `**${itemName}**\n\n${msg}` });
}

// ===== Ready =====
client.once(Events.ClientReady, async (c) => {
  console.log(`✅ ออนไลน์: ${c.user.tag} | Key เหลือ: ${availableKeys.length}`);

  // ลงทะเบียนคำสั่งอัตโนมัติ
  await deployCommands();

  // ส่งข้อความหาเจ้าของบอท
  try {
    const owner = await client.users.fetch(config.ownerId);
    await owner.send({
      embeds: [
        new EmbedBuilder()
          .setTitle('🤖 บอทพร้อมใช้งานแล้ว')
          .setDescription(
            `**สถานะ:** ออนไลน์\n` +
            `**Key ที่เหลือ:** ${availableKeys.length} อัน\n\n` +
            `**คำสั่งที่ใช้ได้:**\n` +
            `• \`/เลือกห้อง\` → สร้างปุ่มสุ่ม\n` +
            `• \`/เพิ่มคีย์\` → เพิ่ม Key (แอดมิน)\n` +
            `• \`/ดูคีย์\` → ดู Key ที่เหลือ\n` +
            `• \`/ล้างคีย์\` → ล้าง Key ทั้งหมด\n\n` +
            `**วิธีเพิ่ม Key:**\n` +
            `\`/เพิ่มคีย์ keys: KEY1, KEY2, KEY3\``
          )
          .setColor(0x57F287)
          .setTimestamp()
      ]
    });
  } catch (e) {
    console.log('ส่ง DM หาเจ้าของไม่สำเร็จ (อาจปิด DM)');
  }
});

// ===== Interaction =====
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const name = interaction.commandName;

      // /เลือกห้อง
      if (name === 'เลือกห้อง') {
        const items = [];
        for (let i = 1; i <= 10; i++) {
          const v = interaction.options.getString(`รายการ${i}`);
          if (v) items.push(v.trim());
        }
        if (!items.length) return interaction.reply({ content: '❌ ใส่รายการอย่างน้อย 1 อัน', flags: MessageFlags.Ephemeral });

        const rows = [];
        for (let i = 0; i < items.length; i += 5) {
          const row = new ActionRowBuilder();
          items.slice(i, i + 5).forEach(item => {
            row.addComponents(
              new ButtonBuilder()
                .setCustomId(`spin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
                .setLabel(item.slice(0, 80))
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎡')
            );
          });
          rows.push(row);
        }

        const embed = new EmbedBuilder()
          .setTitle('🎡 เลือกห้อง')
          .setDescription(`กดปุ่มเพื่อหมุนวงล้อ (โอกาส 50%)\nผลลัพธ์เห็นเฉพาะคุณ\n\n${items.map((x, i) => `${i + 1}. ${x}`).join('\n')}`)
          .setColor(0x5865F2)
          .setFooter({ text: `Key เหลือ ${availableKeys.length} อัน` });

        return interaction.reply({ embeds: [embed], components: rows });
      }

      // /เพิ่มคีย์
      if (name === 'เพิ่มคีย์') {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: '❌ แอดมินเท่านั้น', flags: MessageFlags.Ephemeral });
        }
        const input = interaction.options.getString('keys', true);
        const newKeys = input.split(/[\n,]+/).map(k => k.trim()).filter(Boolean);
        if (!newKeys.length) return interaction.reply({ content: '❌ ไม่พบ Key', flags: MessageFlags.Ephemeral });

        availableKeys.push(...newKeys);
        saveKeys(availableKeys);
        return interaction.reply({ content: `✅ เพิ่ม ${newKeys.length} Key สำเร็จ (เหลือ ${availableKeys.length} อัน)`, flags: MessageFlags.Ephemeral });
      }

      // /ดูคีย์
      if (name === 'ดูคีย์') {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: '❌ แอดมินเท่านั้น', flags: MessageFlags.Ephemeral });
        }
        const list = availableKeys.length
          ? availableKeys.slice(0, 15).map((k, i) => `${i + 1}. \`${k}\``).join('\n') + (availableKeys.length > 15 ? `\n...อีก ${availableKeys.length - 15} อัน` : '')
          : 'ไม่มี Key';
        return interaction.reply({ content: `🔑 เหลือ **${availableKeys.length}** อัน\n\n${list}`, flags: MessageFlags.Ephemeral });
      }

      // /ล้างคีย์
      if (name === 'ล้างคีย์') {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: '❌ แอดมินเท่านั้น', flags: MessageFlags.Ephemeral });
        }
        availableKeys = [];
        saveKeys(availableKeys);
        return interaction.reply({ content: '🗑️ ล้าง Key ทั้งหมดแล้ว', flags: MessageFlags.Ephemeral });
      }
    }

    // ปุ่ม
    if (interaction.isButton() && interaction.customId.startsWith('spin_')) {
      await spinWheel(interaction, interaction.component.label);
    }
  } catch (err) {
    console.error(err);
    const msg = { content: '❌ เกิดข้อผิดพลาด', flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) await interaction.editReply(msg).catch(() => {});
    else await interaction.reply(msg).catch(() => {});
  }
});

client.login(process.env.TOKEN);
