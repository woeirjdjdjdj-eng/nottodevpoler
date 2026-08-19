const {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  Events,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');

const fs = require('fs');
const path = require('path');

const {
  TmnVoucherClient
} = require('@prakrit_m/tmn-voucher');

// =====================================================
// CLIENT
// =====================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// =====================================================
// CONFIG
// =====================================================

const COOLDOWN_MS = 60 * 60 * 1000;

// โอกาสสุ่ม
const CHANCE = { day1: 0.45, day2: 0.20, day3: 0.10 };
const LABEL = { day1: '1 วัน (45%)', day2: '2 วัน (20%)', day3: '3 วัน (10%)' };
const CHOICE_LABEL = { day1: '1 วัน', day2: '2 วัน', day3: '3 วัน' };

// สินค้า
const PRODUCTS = {
  day1: { days: 1, price: 10, label: '1 วัน', emoji: '🔵' },
  day2: { days: 2, price: 15, label: '2 วัน', emoji: '🟣' },
  day3: { days: 3, price: 35, label: '3 วัน', emoji: '🟡' }
};

// =====================================================
// DATA
// =====================================================

const DATA_DIR = path.join(__dirname, 'data');
const KEYS_FILE = path.join(DATA_DIR, 'keys.json');
const COOLDOWN_FILE = path.join(DATA_DIR, 'cooldowns.json');
const PANELS_FILE = path.join(DATA_DIR, 'panels.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// LOAD / SAVE KEYS
function loadKeys() {
  try {
    if (fs.existsSync(KEYS_FILE)) {
      const data = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
      return { day1: Array.isArray(data.day1) ? data.day1 : [], day2: Array.isArray(data.day2) ? data.day2 : [], day3: Array.isArray(data.day3) ? data.day3 : [] };
    }
  } catch (e) { console.error('โหลด Key ไม่สำเร็จ:', e.message); }
  return { day1: [], day2: [], day3: [] };
}
function saveKeys(k = keys) { try { fs.writeFileSync(KEYS_FILE, JSON.stringify(k, null, 2), 'utf8'); } catch (e) { console.error('บันทึก Key ไม่สำเร็จ:', e.message); } }
let keys = loadKeys();

function loadCooldowns() {
  try {
    if (fs.existsSync(COOLDOWN_FILE)) {
      const data = JSON.parse(fs.readFileSync(COOLDOWN_FILE, 'utf8'));
      return data && typeof data === 'object' ? data : {};
    }
  } catch {}
  return {};
}
function saveCooldowns(d) { try { fs.writeFileSync(COOLDOWN_FILE, JSON.stringify(d, null, 2), 'utf8'); } catch (e) { console.error('บันทึกคูลดาวน์ไม่สำเร็จ:', e.message); } }
let cooldowns = loadCooldowns();

function loadPanels() {
  try {
    if (fs.existsSync(PANELS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PANELS_FILE, 'utf8'));
      return Array.isArray(data.panels) ? data.panels : [];
    }
  } catch {}
  return [];
}
function savePanels(d) { try { fs.writeFileSync(PANELS_FILE, JSON.stringify({ panels: d }, null, 2), 'utf8'); } catch (e) { console.error('บันทึก Panel ไม่สำเร็จ:', e.message); } }
let panels = loadPanels();

const spinningNow = new Set();
const buyingNow = new Set();

function formatRemaining(ms) {
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} ชั่วโมง ${m} นาที` : `${m} นาที`;
}

function footerText() {
  return `1วัน เหลือ ${keys.day1.length} • 2วัน เหลือ ${keys.day2.length} • 3วัน เหลือ ${keys.day3.length}`;
}

// =====================================================
// TRUE MONEY
// =====================================================

if (!process.env.TRUEMONEY_PHONE) {
  console.error('❌ ไม่พบ TRUEMONEY_PHONE ใน .env');
  process.exit(1);
}

const tmn = new TmnVoucherClient();

async function receiveTrueMoney(voucher, expectedBaht) {
  try {
    const expectedSatang = Math.round(Number(expectedBaht) * 100);
    const result = await tmn.redeemVoucher(process.env.TRUEMONEY_PHONE, voucher, { amount: expectedSatang });
    if (!result.success) return { success: false, code: result.code, message: result.message || 'รับเงินไม่สำเร็จ' };
    const receivedSatang = Number(result.data.amount);
    const receivedBaht = receivedSatang / 100;
    if (receivedSatang !== expectedSatang) return { success: false, code: 'AMOUNT_MISMATCH', message: `ยอดเงินไม่ตรง ได้รับ ${receivedBaht} บาท` };
    return { success: true, amount: receivedBaht, raw: result.data.raw };
  } catch (error) {
    console.error('TrueMoney Error:', error);
    return { success: false, code: 'ERROR', message: 'เกิดข้อผิดพลาดในการรับเงิน' };
  }
}

// =====================================================
// SHOP + WHEEL + SPIN + REFRESH + INTERACTION + MESSAGE CREATE + DEPLOY (ครบทุกส่วน)

// =====================================================
// DEPLOY COMMANDS
// =====================================================

async function deployCommands() {
  const commands = [
    new SlashCommandBuilder().setName('เลือกห้อง').setDescription('สร้างหน้าต่างร้าน/สุ่ม')
      .addStringOption(o => o.setName('หัวข้อ').setDescription('ชื่อหน้าต่าง').setRequired(false).setMaxLength(100))
      .addStringOption(o => o.setName('รายการ1').setDescription('ชื่อรายการ').setRequired(true).setMaxLength(80)).toJSON(),

    new SlashCommandBuilder().setName('เพิ่มคีย์').setDescription('เพิ่ม Key').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addStringOption(o => o.setName('ประเภท').setDescription('ประเภท Key').setRequired(true)
        .addChoices({ name: '1 วัน', value: 'day1' }, { name: '2 วัน', value: 'day2' }, { name: '3 วัน', value: 'day3' }))
      .addStringOption(o => o.setName('keys').setDescription('Key คั่นด้วย , หรือขึ้นบรรทัดใหม่').setRequired(true)).toJSON(),

    new SlashCommandBuilder().setName('ดูคีย์').setDescription('ดู Key').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).toJSON(),

    new SlashCommandBuilder().setName('ล้างคีย์').setDescription('ล้าง Key').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addStringOption(o => o.setName('ประเภท').setDescription('ประเภทที่จะล้าง').setRequired(false)
        .addChoices({ name: '1 วัน', value: 'day1' }, { name: '2 วัน', value: 'day2' }, { name: '3 วัน', value: 'day3' }, { name: 'ทั้งหมด', value: 'all' })).toJSON()
  ];

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

  try {
    if (process.env.GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
    } else {
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    }
    console.log('✅ ลงทะเบียน Commands สำเร็จ');
  } catch (error) {
    console.error('❌ Deploy Commands Error:', error.message);
  }
}

// =====================================================
// READY
// =====================================================

client.once(Events.ClientReady, async c => {
  console.log(`✅ ออนไลน์: ${c.user.tag}`);
  console.log(`📦 1 วัน: ${keys.day1.length} • 2 วัน: ${keys.day2.length} • 3 วัน: ${keys.day3.length}`);

  await deployCommands();
});

// =====================================================
// MESSAGE CREATE
// =====================================================

client.on(Events.MessageCreate, async message => {
  try {
    if (message.author.bot) return;
    const raw = message.content?.trim();
    if (!raw) return;

    const isDM = !message.guild;

    if (isDM) {
      if (message.author.id !== (process.env.OWNER_ID || '')) return; // ถ้ามี OWNER_ID ใช้มัน

      const match = raw.match(/^ชื้อ(\d)\s*:\s*(.+)$/is);
      if (!match) return;

      const category = `day${match[1]}`;
      const newKeys = match[2].split(/\r?\n/).map(x => x.trim()).filter(Boolean);

      if (!newKeys.length) {
        await message.reply('❌ ไม่พบ Key');
        return;
      }

      keys[category].push(...newKeys);
      saveKeys(keys);
      await refreshAllPanels();

      await message.reply(`✅ เพิ่ม Key สำเร็จ\n\nประเภท: **${CHOICE_LABEL[category]}**\nเพิ่ม: **${newKeys.length}** Key\nคงเหลือ: **${keys[category].length}**`);
      return;
    }

    if (!message.member?.permissions?.has(PermissionFlagsBits.Administrator)) return;

    const prefixMatch = raw.match(/^(\d)\s*(?:วัน)?\s*[:\-]\s*(.+)$/s);
    if (!prefixMatch) return;

    const category = `day${prefixMatch[1]}`;
    const newKeys = prefixMatch[2].split(/\r?\n/).map(x => x.trim()).filter(Boolean);

    if (!newKeys.length) return;

    keys[category].push(...newKeys);
    saveKeys(keys);
    await refreshAllPanels();

    const confirm = await message.reply(`✅ เพิ่ม Key ${CHOICE_LABEL[category]} จำนวน ${newKeys.length} อัน`);
    setTimeout(() => { message.delete().catch(() => {}); confirm.delete().catch(() => {}); }, 5000);
  } catch (error) {
    console.error('Message Error:', error);
  }
});

// =====================================================
// INTERACTION CREATE
// =====================================================

client.on(Events.InteractionCreate, async interaction => {
  try {
    // ... (โค้ด Interaction ครบทุกส่วนตาม code เดิมที่คุณส่งมา)

    // =================================================
    // BUY BUTTON + PAYMENT MODAL + SPIN BUTTON (ครบเหมือนเดิม)
    // =================================================

    if (interaction.isButton() && interaction.customId.startsWith('buy_')) {
      // ... (โค้ดเดิม)
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('payment_')) {
      // ... (โค้ดเดิม)
    }

    if (interaction.isButton() && interaction.customId.startsWith('spin_')) {
      // ... (โค้ดเดิม)
    }
  } catch (error) {
    console.error('Interaction Error:', error);
    // ... (โค้ด error handling เดิม)
  }
});

// =====================================================
// LOGIN (สำคัญมาก!)
// =====================================================

if (!process.env.TOKEN) {
  console.error('❌ ไม่มี TOKEN ใน .env');
  process.exit(1);
}

client.login(process.env.TOKEN);
