const {
  Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, MessageFlags, Events, PermissionFlagsBits, REST, Routes,
  SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// ===== ตังคา่ =====
const COOLDOWN_MS = 60 * 60 * 1000;

// ระบบสุม
const SPIN_CATEGORIES = ['day1', 'day2', 'day3'];
const WIN_CHANCE = { day1: 0.50, day2: 0.25, day3: 0.10 };
const SPIN_LABEL = { day1: '1 วัน (50%)', day2: '2 วัน (25%)', day3: '3 วัน (10%)' };
const CHOICE_LABEL = { day1: '1 วัน', day2: '2 วัน', day3: '3 วัน' };

// ระบบขาย
const SHOP_CATEGORIES = ['shopday2', 'shopday3'];
const SHOP_LABEL = { shopday2: '2 วัน — 10฿', shopday3: '3 วัน — 15฿' };
const SHOP_CHOICE_LABEL = { shopday2: '2 วัน (10฿)', shopday3: '3 วัน (15฿)' };
const SHOP_PRICE = { shopday2: 10, shopday3: 15 };
const SHOP_TO_SPIN = { shopday2: 'day2', shopday3: 'day3' };

// TrueMoney
const TRUE_PHONE = process.env.TRUE_PHONE || '0935914844';

// ===== Data Files =====
const DATA_DIR = path.join(__dirname, 'data');
const KEYS_FILE = path.join(DATA_DIR, 'keys.json');
const SHOP_KEYS_FILE = path.join(DATA_DIR, 'shop_keys.json');
const COOLDOWN_FILE = path.join(DATA_DIR, 'cooldowns.json');
const PANELS_FILE = path.join(DATA_DIR, 'panels.json');
const SHOP_PANELS_FILE = path.join(DATA_DIR, 'shop_panels.json');
const TRANSACTIONS_FILE = path.join(DATA_DIR, 'transactions.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ===== Load / Save =====
function loadJSON(file, fallback) {
  try {
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      return data && typeof data === 'object' ? data : fallback;
    }
  } catch (e) {}
  return fallback;
}

function saveJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(`บันทึก ${path.basename(file)} ไม่สำเรจ:`, e.message);
  }
}

function loadKeys() {
  const data = loadJSON(KEYS_FILE, {});
  return {
    day1: Array.isArray(data.day1) ? data.day1 : [],
    day2: Array.isArray(data.day2) ? data.day2 : [],
    day3: Array.isArray(data.day3) ? data.day3 : [],
  };
}

function loadShopKeys() {
  const data = loadJSON(SHOP_KEYS_FILE, {});
  return {
    shopday2: Array.isArray(data.shopday2) ? data.shopday2 : [],
    shopday3: Array.isArray(data.shopday3) ? data.shopday3 : [],
  };
}

function loadCooldowns() { return loadJSON(COOLDOWN_FILE, {}); }
function loadPanels() {
  const data = loadJSON(PANELS_FILE, { panels: [] });
  return Array.isArray(data.panels) ? data.panels : [];
}
function loadShopPanels() {
  const data = loadJSON(SHOP_PANELS_FILE, { panels: [] });
  return Array.isArray(data.panels) ? data.panels : [];
}
function loadTransactions() {
  return loadJSON(TRANSACTIONS_FILE, { transactions: [] });
}

let keys = loadKeys();
let shopKeys = loadShopKeys();
let cooldowns = loadCooldowns();
let panels = loadPanels();
let shopPanels = loadShopPanels();
let transactions = loadTransactions();

const spinningNow = new Set();

// ===== Helpers =====
function formatRemaining(ms) {
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h} ชั่วโมง ${m} นาที`;
  return `${m} นาที`;
}

function spinFooterText() {
  return `1วัน เหลือ ${keys.day1.length} • 2วัน เหลือ ${keys.day2.length} • 3วัน เหลือ ${keys.day3.length}`;
}

function shopFooterText() {
  return `2วัน เหลือ ${shopKeys.shopday2.length} • 3วัน เหลือ ${shopKeys.shopday3.length}`;
}

function parseKeysInput(input) {
  return input.split(/[\n,]+/).map(k => k.trim()).filter(Boolean);
}

function generateTransactionId() {
  return `TXN${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

// ===== TrueMoney Webhook Server =====
const app = express();
app.use(express.json());

app.post('/webhook/truemoney', async (req, res) => {
  try {
    const { phone, amount, ref, timestamp } = req.body;
    console.log(`[TrueMoney] รับซอง: ${phone} จำนวน ${amount} บาท (ref: ${ref})`);

    const txn = {
      id: generateTransactionId(),
      phone,
      amount: parseFloat(amount),
      ref,
      timestamp: timestamp || Date.now(),
      status: 'pending',
    };

    transactions.transactions.push(txn);
    saveJSON(TRANSACTIONS_FILE, transactions);

    try {
      const owner = await client.users.fetch(config.ownerId);
      await owner.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('💰 มีซองเข้ามา!')
            .setDescription(
              `**เบอร์:** ${phone}\n` +
              `**จำนวน:** ${amount} บาท\n` +
              `**Ref:** ${ref}\n` +
              `**เวลา:** ${new Date(txn.timestamp).toLocaleString('th-TH')}`
            )
            .setColor(0x00D4AA)
            .setTimestamp()
        ]
      });
    } catch (e) {
      console.log('ส่ง DM แจ้งเจ้าของไม่สำเรจ');
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(500).json({ success: false });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', transactions: transactions.transactions.length });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Webhook server running on port ${PORT}`);
});

// ===== ลงทะเบียนคำสัง =====
async function deployCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('เลือกห้อง')
      .setDescription('สร้างปุ่มสุ่ม (เลือกระยะเวลา 1/2/3 วัน)')
      .addStringOption(o => o.setName('หัวข้อ').setDescription('ชื่อหัวข้อ / ชื่อหน้าต่าง').setRequired(false).setMaxLength(100))
      .addStringOption(o => o.setName('รายการ1').setDescription('ชื่อห้อง / รายการ').setRequired(true).setMaxLength(80))
      .toJSON(),

    new SlashCommandBuilder()
      .setName('เลือกห้องขาย')
      .setDescription('สร้างปุ่มขายคีย์ (2/3 วัน)')
      .addStringOption(o => o.setName('หัวข้อ').setDescription('ชื่อหัวข้อ / ชื่อหน้าต่าง').setRequired(false).setMaxLength(100))
      .addStringOption(o => o.setName('รายการ1').setDescription('ชื่อห้อง / รายการ').setRequired(true).setMaxLength(80))
      .toJSON(),

    new SlashCommandBuilder()
      .setName('เพิ่มคีย์')
      .setDescription('เพิ่ม Key สุ่ม (แอดมินเท่านั้น)')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addStringOption(o => o.setName('ประเภท').setDescription('ระยะเวลาของ Key')
        .setRequired(true)
        .addChoices(
          { name: '1 วัน', value: 'day1' },
          { name: '2 วัน', value: 'day2' },
          { name: '3 วัน', value: 'day3' },
        ))
      .addStringOption(o => o.setName('keys').setDescription('ใส่ Key คั่นด้วย , หรือขึ้นบรรทัดใหม่').setRequired(true))
      .toJSON(),

    new SlashCommandBuilder()
      .setName('เพิ่มคีย์ขาย')
      .setDescription('เพิ่ม Key ขาย (แอดมินเท่านั้น)')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addStringOption(o => o.setName('ประเภท').setDescription('ระยะเวลาของ Key')
        .setRequired(true)
        .addChoices(
          { name: '2 วัน', value: 'shopday2' },
          { name: '3 วัน', value: 'shopday3' },
        ))
      .addStringOption(o => o.setName('keys').setDescription('ใส่ Key คั่นด้วย , หรือขึ้นบรรทัดใหม่').setRequired(true))
      .toJSON(),

    new SlashCommandBuilder()
      .setName('ดูคีย์')
      .setDescription('ดู Key ทั้งหมด (แอดมินเท่านั้น)')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .toJSON(),

    new SlashCommandBuilder()
      .setName('ล้างคีย์')
      .setDescription('ล้าง Key (แอดมินเท่านั้น)')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addStringOption(o => o.setName('ประเภท').setDescription('เลือกประเภทที่จะล้าง (ไม่เลือก = ล้างทั้งหมด)').setRequired(false)
        .addChoices(
          { name: 'สุ่ม 1 วัน', value: 'day1' },
          { name: 'สุ่ม 2 วัน', value: 'day2' },
          { name: 'สุ่ม 3 วัน', value: 'day3' },
          { name: 'ขาย 2 วัน', value: 'shopday2' },
          { name: 'ขาย 3 วัน', value: 'shopday3' },
          { name: 'ทั้งหมด', value: 'all' },
        ))
      .toJSON(),

    new SlashCommandBuilder()
      .setName('รายการโอนเงิน')
      .setDescription('ดูรายการซองที่ผ่านมา (แอดมินเท่านั้น)')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .toJSON(),
  ];

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    if (process.env.GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
      console.log('✅ ลงทะเบียนคำสั่งในเซิร์ฟเวอร์สำเรจ');
    } else {
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
      console.log('✅ ลงทะเบียนคำสั่ง Global สำเรจ');
    }
  } catch (err) {
    console.error('ลงทะเบียนคำสั่งไม่สำเรจ:', err.message);
  }
}

// ===== สร้างแถวปุ่มสุ่ม =====
function buildSpinRows(idSuffix) {
  const row = new ActionRowBuilder();
  for (const cat of SPIN_CATEGORIES) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`spin_${cat}_${idSuffix}`)
        .setLabel(SPIN_LABEL[cat])
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎡')
        .setDisabled(keys[cat].length === 0)
    );
  }
  return [row];
}

// ===== สร้างแถวปุ่มขาย =====
function buildShopRows(idSuffix) {
  const row = new ActionRowBuilder();
  for (const cat of SHOP_CATEGORIES) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`shop_${cat}_${idSuffix}`)
        .setLabel(SHOP_LABEL[cat])
        .setStyle(ButtonStyle.Success)
        .setEmoji('💰')
        .setDisabled(shopKeys[cat].length === 0)
    );
  }
  return [row];
}

function categoryFromSpinId(customId) {
  for (const cat of SPIN_CATEGORIES) {
    if (customId.startsWith(`spin_${cat}_`)) return cat;
  }
  return null;
}

function categoryFromShopId(customId) {
  for (const cat of SHOP_CATEGORIES) {
    if (customId.startsWith(`shop_${cat}_`)) return cat;
  }
  return null;
}

// ===== อัปเดตแผงสุ่ม =====
async function refreshPanel(message) {
  try {
    if (!message || !message.embeds || !message.embeds.length) return;
    const oldEmbed = message.embeds[0];
    const newEmbed = EmbedBuilder.from(oldEmbed).setFooter({ text: spinFooterText() });
    const newRows = message.components.map(row => {
      const newRow = new ActionRowBuilder();
      for (const comp of row.components) {
        const cat = categoryFromSpinId(comp.customId);
        const btn = ButtonBuilder.from(comp);
        if (cat) btn.setDisabled(keys[cat].length === 0);
        newRow.addComponents(btn);
      }
      return newRow;
    });
    await message.edit({ embeds: [newEmbed], components: newRows });
  } catch (e) {
    console.error('อัปเดตแผงสุ่มไม่สำเรจ:', e.message);
  }
}

// ===== อัปเดตแผงขาย =====
async function refreshShopPanel(message) {
  try {
    if (!message || !message.embeds || !message.embeds.length) return;
    const oldEmbed = message.embeds[0];
    const newEmbed = EmbedBuilder.from(oldEmbed).setFooter({ text: shopFooterText() });
    const newRows = message.components.map(row => {
      const newRow = new ActionRowBuilder();
      for (const comp of row.components) {
        const cat = categoryFromShopId(comp.customId);
        const btn = ButtonBuilder.from(comp);
        if (cat) btn.setDisabled(shopKeys[cat].length === 0);
        newRow.addComponents(btn);
      }
      return newRow;
    });
    await message.edit({ embeds: [newEmbed], components: newRows });
  } catch (e) {
    console.error('อัปเดตแผงขายไม่สำเรจ:', e.message);
  }
}

// ===== รีเฟรชทุกแผง =====
async function refreshAllPanels() {
  if (panels.length) {
    const stillValid = [];
    for (const p of panels) {
      try {
        const channel = await client.channels.fetch(p.channelId);
        const message = await channel.messages.fetch(p.messageId);
        await refreshPanel(message);
        stillValid.push(p);
      } catch (e) {}
    }
    panels = stillValid;
    saveJSON(PANELS_FILE, { panels });
  }

  if (shopPanels.length) {
    const stillValid = [];
    for (const p of shopPanels) {
      try {
        const channel = await client.channels.fetch(p.channelId);
        const message = await channel.messages.fetch(p.messageId);
        await refreshShopPanel(message);
        stillValid.push(p);
      } catch (e) {}
    }
    shopPanels = stillValid;
    saveJSON(SHOP_PANELS_FILE, { panels: shopPanels });
  }
}

// ===== วงล้อสุ่ม =====
async function spinWheel(interaction, itemName, category) {
  const frames = [
    '🎡 ▶ ได้ ◀     ไม่ได้',
    '🎡   ได้   ▶ ไม่ได้ ◀',
    '🎡 ▶ ได้ ◀     ไม่ได้',
    '🎡   ได้   ▶ ไม่ได้ ◀',
    '🎡 ▶ ได้ ◀     ไม่ได้',
  ];

  const tag = `${itemName} (${CHOICE_LABEL[category]})`;

  await interaction.reply({
    content: `${config.messages.spinning}\n**${tag}**\n\`\`\`\n${frames[0]}\n\`\`\``,
    flags: MessageFlags.Ephemeral,
  });

  for (let i = 1; i < frames.length; i++) {
    await new Promise(r => setTimeout(r, 350));
    await interaction.editReply({
      content: `${config.messages.spinning}\n**${tag}**\n\`\`\`\n${frames[i]}\n\`\`\``
    });
  }

  const isWin = Math.random() < WIN_CHANCE[category];
  let msg;

  if (isWin) {
    if (keys[category].length === 0) {
      msg = `😢 ขออภัย **Key ประเภท ${CHOICE_LABEL[category]} หมดแล้ว**`;
    } else {
      const key = keys[category].splice(Math.floor(Math.random() * keys[category].length), 1)[0];
      saveJSON(KEYS_FILE, keys);
      try {
        await interaction.user.send({
          embeds: [
            new EmbedBuilder()
              .setTitle('🎉 คุณชนะ!')
              .setDescription(`คุณสุ่มจาก **${tag}** แล้วได้ Key\n\n\`\`\`\n${key}\n\`\`\`\nกรุณาเก็บรักษาไว้นะครับ`)
              .setColor(0x57F287)
              .setTimestamp()
          ]
        });
        msg = config.messages.win;
      } catch (err) {
        msg = `🎉 **คุณชนะ!**\n(ส่ง DM ไม่สำเรจ เพราะคุณปิดรับข้อความจากบอท)\n\nนี่คือ Key ของคุณ:\n\`\`\`\n${key}\n\`\`\``;
      }
    }
  } else {
    msg = config.messages.lose;
  }

  await new Promise(r => setTimeout(r, 400));
  await interaction.editReply({ content: `**${tag}**\n\n${msg}` });
  await refreshPanel(interaction.message);
}

// ===== ขายคีย์ (Modal กรอกเบอร์ทรู + จำนวน) =====
async function buyKey(interaction, itemName, category) {
  const price = SHOP_PRICE[category];
  const label = SHOP_CHOICE_LABEL[category];

  const modal = new ModalBuilder()
    .setCustomId(`buy_modal_${category}_${Date.now()}`)
    .setTitle(`💰 ชำระเงิน — ${label}`);

  const phoneInput = new TextInputBuilder()
    .setCustomId('truemoney_phone')
    .setLabel('เบอร์ทรูมันนี่ที่ส่งมา')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('เช่น 08xxxxxxxx')
    .setRequired(true)
    .setMaxLength(15)
    .setMinLength(10);

  const amountInput = new TextInputBuilder()
    .setCustomId('amount')
    .setLabel(`จำนวนเงินที่ส่ง (${price} บาท)`)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(`เช่น ${price}`)
    .setRequired(true)
    .setMaxLength(6)
    .setMinLength(1);

  const row1 = new ActionRowBuilder().addComponents(phoneInput);
  const row2 = new ActionRowBuilder().addComponents(amountInput);
  modal.addComponents(row1, row2);

  await interaction.showModal(modal);
}

// ===== Ready =====
client.once(Events.ClientReady, async (c) => {
  console.log(`✅ ออนไลน์: ${c.user.tag} | Key: 1วัน=${keys.day1.length} 2วัน=${keys.day2.length} 3วัน=${keys.day3.length} | ขาย: 2วัน=${shopKeys.shopday2.length} 3วัน=${shopKeys.shopday3.length}`);

  await deployCommands();

  try {
    const owner = await client.users.fetch(config.ownerId);
    await owner.send({
      embeds: [
        new EmbedBuilder()
          .setTitle('🤖 บอทพร้อมใช้งานแล้ว')
          .setDescription(
            `**สถานะ:** ออนไลน์\n` +
            `**Key คงเหลือ:** สุ่ม 1วัน ${keys.day1.length} • 2วัน ${keys.day2.length} • 3วัน ${keys.day3.length}\n` +
            `**Key ขาย:** 2วัน ${shopKeys.shopday2.length} • 3วัน ${shopKeys.shopday3.length}\n` +
            `**TrueMoney:** ${TRUE_PHONE}\n` +
            `**Webhook:** http://your-server:${process.env.PORT || 3000}/webhook/truemoney\n\n` +
            `**คำสั่งหลัก:**\n` +
            `\`/เลือกห้อง\` → สร้างปุ่มสุ่ม\n` +
            `\`/เลือกห้องขาย\` → สร้างปุ่มขาย\n` +
            `\`/เพิ่มคีย์\` → เพิ่ม Key สุ่ม\n` +
            `\`/เพิ่มคีย์ขาย\` → เพิ่ม Key ขาย\n` +
            `\`/ดูคีย์\` → ดู Key ที่เหลือ\n` +
            `\`/รายการโอนเงิน\` → ดูรายการซอง`
          )
          .setColor(0x57F287)
          .setTimestamp()
      ]
    });
  } catch (e) {
    console.log('ส่ง DM หาเจ้าของไม่สำเรจ');
  }
});

// ===== รับ DM จากเจ้าของบอท → เก็บเป็น Key อัตโนมัติ =====
client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot) return;
    if (message.guild) return;
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
    saveJSON(KEYS_FILE, keys);
    await refreshAllPanels();

    await message.reply(
      `✅ เพิ่ม Key ประเภท **${CHOICE_LABEL[category]}** สำเรจ **${newKeys.length}** อัน\n` +
      `ตอนนี้เหลือ: 1วัน ${keys.day1.length} • 2วัน ${keys.day2.length} • 3วัน ${keys.day3.length}`
    );
  } catch (e) {
    console.error('รับ DM key ไม่สำเรจ:', e.message);
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
        const rows = buildSpinRows(idSuffix);

        const embed = new EmbedBuilder()
          .setTitle(title)
          .setDescription(
            `**${item}**\n\n` +
            `เลือกระยะเวลาที่ต้องการสุ่ม แล้วกดปุ่มเพื่อหมุนวงล้อ\n` +
            `สุ่มได้ **1 ครั้ง / ${COOLDOWN_MS / 60000} นาที** ต่อคน\n` +
            `ผลลัพธ์จะเห็นเฉพาะคุณเท่านั้น\n\n` +
            `🔹 ${SPIN_LABEL.day1}\n🔹 ${SPIN_LABEL.day2}\n🔹 ${SPIN_LABEL.day3}`
          )
          .setColor(0x5865F2)
          .setFooter({ text: spinFooterText() })
          .setTimestamp();

        await interaction.reply({ embeds: [embed], components: rows });
        const sentMessage = await interaction.fetchReply();
        panels.push({ channelId: sentMessage.channelId, messageId: sentMessage.id });
        saveJSON(PANELS_FILE, { panels });
        return;
      }

      // /เลือกห้องขาย
      if (name === 'เลือกห้องขาย') {
        const title = interaction.options.getString('หัวข้อ') || '💰 ซื้อ Key — ชำระเงินทรูมันนี่';
        const item = interaction.options.getString('รายการ1', true).trim();

        const idSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const rows = buildShopRows(idSuffix);

        const embed = new EmbedBuilder()
          .setTitle(title)
          .setDescription(
            `**${item}**\n\n` +
            `เลือกระยะเวลาที่ต้องการ แล้วกดปุ่มเพื่อชำระเงิน\n` +
            `กรอกเบอร์ทรูมันนี่ที่ส่งมา + จำนวนเงิน\n` +
            `เจ้าของจะตรวจสอบและส่ง Key ทาง DM\n\n` +
            `💰 ${SHOP_LABEL.shopday2}\n💰 ${SHOP_LABEL.shopday3}\n\n` +
            `📲 ชำระได้ที่: **${TRUE_PHONE}** (TrueMoney Wallet)`
          )
          .setColor(0x57F287)
          .setFooter({ text: shopFooterText() })
          .setTimestamp();

        await interaction.reply({ embeds: [embed], components: rows });
        const sentMessage = await interaction.fetchReply();
        shopPanels.push({ channelId: sentMessage.channelId, messageId: sentMessage.id });
        saveJSON(SHOP_PANELS_FILE, { panels: shopPanels });
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
        saveJSON(KEYS_FILE, keys);
        await refreshAllPanels();

        return interaction.reply({
          content: `✅ เพิ่ม Key ประเภท **${CHOICE_LABEL[category]}** สำเรจ **${newKeys.length}** อัน\n` +
            `ตอนนี้เหลือ: 1วัน ${keys.day1.length} • 2วัน ${keys.day2.length} • 3วัน ${keys.day3.length}`,
          flags: MessageFlags.Ephemeral
        });
      }

      // /เพิ่มคีย์ขาย
      if (name === 'เพิ่มคีย์ขาย') {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: '❌ คำสั่งนี้สำหรับแอดมินเท่านั้น', flags: MessageFlags.Ephemeral });
        }

        const category = interaction.options.getString('ประเภท', true);
        const input = interaction.options.getString('keys', true);
        const newKeys = parseKeysInput(input);

        if (!newKeys.length) {
          return interaction.reply({ content: '❌ ไม่พบ Key ที่จะเพิ่ม', flags: MessageFlags.Ephemeral });
        }

        shopKeys[category].push(...newKeys);
        saveJSON(SHOP_KEYS_FILE, shopKeys);
        await refreshAllPanels();

        return interaction.reply({
          content: `✅ เพิ่ม Key ขาย ประเภท **${SHOP_CHOICE_LABEL[category]}** สำเรจ **${newKeys.length}** อัน`,
          flags: MessageFlags.Ephemeral
        });
      }

      // /ดูคีย์
      if (name === 'ดูคีย์') {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: '❌ คำสั่งนี้สำหรับแอดมินเท่านั้น', flags: MessageFlags.Ephemeral });
        }

        const section = (list, name) => {
          if (!list.length) return 'ไม่มี Key เหลือแล้ว';
          return list.slice(0, 10).map((k, i) => `${i + 1}. \`${k}\``).join('\n') +
            (list.length > 10 ? `\n...และอีก ${list.length - 10} อัน` : '');
        };

        return interaction.reply({
          content:
            `🔑 **Key คงเหลือ**\n\n` +
            `**สุ่ม — 1 วัน (${keys.day1.length} อัน)**\n${section(keys.day1, '1 วัน')}\n\n` +
            `**สุ่ม — 2 วัน (${keys.day2.length} อัน)**\n${section(keys.day2, '2 วัน')}\n\n` +
            `**สุ่ม — 3 วัน (${keys.day3.length} อัน)**\n${section(keys.day3, '3 วัน')}\n\n` +
            `**ขาย — 2 วัน (${shopKeys.shopday2.length} อัน)**\n${section(shopKeys.shopday2, 'ขาย 2 วัน')}\n\n` +
            `**ขาย — 3 วัน (${shopKeys.shopday3.length} อัน)**\n${section(shopKeys.shopday3, 'ขาย 3 วัน')}`,
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
          shopKeys = { shopday2: [], shopday3: [] };
          saveJSON(KEYS_FILE, keys);
          saveJSON(SHOP_KEYS_FILE, shopKeys);
          await refreshAllPanels();
          return interaction.reply({ content: '🗑️ ล้าง Key ทั้งหมดเรียบร้อยแล้ว', flags: MessageFlags.Ephemeral });
        } else if (target.startsWith('shop')) {
          shopKeys[target] = [];
          saveJSON(SHOP_KEYS_FILE, shopKeys);
          await refreshAllPanels();
          return interaction.reply({ content: `🗑️ ล้าง Key ขาย ประเภท **${SHOP_CHOICE_LABEL[target]}** แล้ว`, flags: MessageFlags.Ephemeral });
        } else {
          keys[target] = [];
          saveJSON(KEYS_FILE, keys);
          await refreshAllPanels();
          return interaction.reply({ content: `🗑️ ล้าง Key สุ่ม ประเภท **${CHOICE_LABEL[target]}** แล้ว`, flags: MessageFlags.Ephemeral });
        }
      }

      // /รายการโอนเงิน
      if (name === 'รายการโอนเงิน') {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: '❌ คำสั่งนี้สำหรับแอดมินเท่านั้น', flags: MessageFlags.Ephemeral });
        }

        const recent = transactions.transactions.slice(-20).reverse();
        if (!recent.length) {
          return interaction.reply({ content: '📋 ยังไม่มีรายการโอนเงิน', flags: MessageFlags.Ephemeral });
        }

        const lines = recent.map(t => {
          const time = new Date(t.timestamp).toLocaleString('th-TH');
          return `• ${time} | ${t.phone} | ${t.amount}฿ | Ref: ${t.ref} | ${t.status}`;
        }).join('\n');

        return interaction.reply({
          content: `📋 **20 รายการล่าสุด**\n\n${lines}`,
          flags: MessageFlags.Ephemeral
        });
      }
    }

    // กดปุ่มสุ่ม
    if (interaction.isButton() && interaction.customId.startsWith('spin_')) {
      const category = categoryFromSpinId(interaction.customId);
      if (!category) return;

      const userId = interaction.user.id;

      if (spinningNow.has(userId)) {
        return interaction.reply({ content: '⏳ กำลังหมุนอยู่ กรุณารอสักครู่...', flags: MessageFlags.Ephemeral });
      }

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

      if (keys[category].length === 0) {
        await refreshPanel(interaction.message);
        return interaction.reply({ content: `😢 ขออภัย **Key ประเภท ${CHOICE_LABEL[category]} หมดแล้ว**`, flags: MessageFlags.Ephemeral });
      }

      cooldowns[userId] = now;
      saveJSON(COOLDOWN_FILE, cooldowns);
      spinningNow.add(userId);

      try {
        const itemName = interaction.message.embeds[0]?.description?.split('\n')[0]?.replace(/\*\*/g, '') || 'รางวัล';
        await spinWheel(interaction, itemName, category);
      } finally {
        spinningNow.delete(userId);
      }
    }

    // กดปุ่มขาย
    if (interaction.isButton() && interaction.customId.startsWith('shop_')) {
      const category = categoryFromShopId(interaction.customId);
      if (!category) return;

      if (shopKeys[category].length === 0) {
        await refreshShopPanel(interaction.message);
        return interaction.reply({ content: `😢 ขออภัย **Key ประเภท ${SHOP_CHOICE_LABEL[category]} หมดแล้ว**`, flags: MessageFlags.Ephemeral });
      }

      const itemName = interaction.message.embeds[0]?.description?.split('\n')[0]?.replace(/\*\*/g, '') || 'Key';
      await buyKey(interaction, itemName, category);
    }

    // Modal submit (กรอกเบอร์ทรู + จำนวน)
    if (interaction.isModalSubmit() && interaction.customId.startsWith('buy_modal_')) {
      const category = interaction.customId.split('_')[2];
      const phone = interaction.fields.getTextInputValue('truemoney_phone');
      const amount = interaction.fields.getTextInputValue('amount');
      const label = SHOP_CHOICE_LABEL[category];
      const price = SHOP_PRICE[category];

      const order = {
        id: generateTransactionId(),
        userId: interaction.user.id,
        userTag: interaction.user.tag,
        category,
        phone,
        amount: parseFloat(amount),
        price,
        timestamp: Date.now(),
        status: 'pending',
      };

      transactions.transactions.push(order);
      saveJSON(TRANSACTIONS_FILE, transactions);

      try {
        const owner = await client.users.fetch(config.ownerId);
        await owner.send({
          embeds: [
            new EmbedBuilder()
              .setTitle('🛒 มีคำสั่งซื้อ Key!')
              .setDescription(
                `**ผู้ส่ง:** ${interaction.user.tag} (${interaction.user.id})\n` +
                `**ประเภท:** ${label}\n` +
                `**เบอร์ทรูที่ส่งมา:** ${phone}\n` +
                `**จำนวนเงินที่ระบุ:** ${amount} บาท\n` +
                `**ราคาที่ต้องการ:** ${price} บาท\n\n` +
                `กรุณาตรวจสอบการโอนเงิน แล้วพิมพ์ส่ง Key ทาง DM ให้ผู้ใช้ได้เลย`
              )
              .setColor(0xFFD700)
              .setTimestamp()
          ]
        });
      } catch (e) {
        console.log('ส่ง DM แจ้งเจ้าของไม่สำเรจ');
      }

      await interaction.reply({
        content:
          `✅ รับคำสั่งซื้อแล้ว!\n\n` +
          `**ประเภท:** ${label}\n` +
          `**เบอร์ทรูที่คุณส่งมา:** ${phone}\n` +
          `**จำนวน:** ${amount} บาท\n\n` +
          `กรุณารอเจ้าของตรวจสอบการโอนเงิน\n` +
          `เมื่อตรวจสอบแล้วเจ้าของจะส่ง Key ทาง DM ให้ครับ 🙏`,
        flags: MessageFlags.Ephemeral
      });
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
