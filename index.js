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
require('dotenv').config();

const config = require('./config');

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

// หมวดสำหรับ "แจก" (วงล้อ) — มี 1/2/3/7 วัน
const GIVEAWAY_CATEGORIES = [
  'day1',
  'day2',
  'day3',
  'day7'
];

// หมวดสำหรับ "ชื้อ" (ร้านค้า) — มีแค่ 2/3/7 วัน
const BUY_CATEGORIES = [
  'day2',
  'day3',
  'day7'
];

// =====================================================
// โอกาสสุ่ม (เฉพาะฝั่งแจก/วงล้อ)
// =====================================================

const WIN_CHANCE = {
  day1: 0.40,
  day2: 0.25,
  day3: 0.10,
  day7: 0.05
};

const LABEL = {
  day1: '1 วัน (40%)',
  day2: '2 วัน (25%)',
  day3: '3 วัน (10%)',
  day7: '7 วัน (5%)'
};

const CHOICE_LABEL = {
  day1: '1 วัน',
  day2: '2 วัน',
  day3: '3 วัน',
  day7: '7 วัน'
};

// =====================================================
// สินค้าสำหรับ "ซื้อ" (ไม่มี 1 วัน)
// =====================================================

const PRODUCTS = {

  day2: {
    days: 2,
    price: 10,
    label: '2 วัน',
    emoji: '🔵'
  },

  day3: {
    days: 3,
    price: 15,
    label: '3 วัน',
    emoji: '🟣'
  },

  day7: {
    days: 7,
    price: 35,
    label: '7 วัน',
    emoji: '🟡'
  }

};

// =====================================================
// DATA
// =====================================================

const DATA_DIR =
  path.join(__dirname, 'data');

const KEYS_FILE =
  path.join(DATA_DIR, 'keys.json');

const COOLDOWN_FILE =
  path.join(DATA_DIR, 'cooldowns.json');

const PANELS_FILE =
  path.join(DATA_DIR, 'panels.json');

if (!fs.existsSync(DATA_DIR)) {

  fs.mkdirSync(DATA_DIR, {
    recursive: true
  });

}

// =====================================================
// LOAD / SAVE KEYS
// แยกเป็น 2 สต็อก: giveaway (แจก/วงล้อ) และ buy (ชื้อ/ร้านค้า)
// =====================================================

function emptyKeys() {

  return {
    giveaway: {
      day1: [],
      day2: [],
      day3: [],
      day7: []
    },
    buy: {
      day2: [],
      day3: [],
      day7: []
    }
  };

}

function loadKeys() {

  try {

    if (fs.existsSync(KEYS_FILE)) {

      const data = JSON.parse(
        fs.readFileSync(
          KEYS_FILE,
          'utf8'
        )
      );

      // รูปแบบใหม่ (มี giveaway/buy อยู่แล้ว)
      if (data.giveaway || data.buy) {

        return {
          giveaway: {
            day1: Array.isArray(data.giveaway?.day1) ? data.giveaway.day1 : [],
            day2: Array.isArray(data.giveaway?.day2) ? data.giveaway.day2 : [],
            day3: Array.isArray(data.giveaway?.day3) ? data.giveaway.day3 : [],
            day7: Array.isArray(data.giveaway?.day7) ? data.giveaway.day7 : []
          },
          buy: {
            day2: Array.isArray(data.buy?.day2) ? data.buy.day2 : [],
            day3: Array.isArray(data.buy?.day3) ? data.buy.day3 : [],
            day7: Array.isArray(data.buy?.day7) ? data.buy.day7 : []
          }
        };

      }

      // รูปแบบเก่า (ไฟล์แบน day2/day3/day7 ใช้ร่วมกัน)
      // ย้ายของเก่าเข้าไปไว้ที่สต็อก "ชื้อ" เท่านั้น
      // เพื่อกันไม่ให้ Key เดียวกันถูกแจกออกไปซ้ำ 2 ทาง
      if (
        Array.isArray(data.day2) ||
        Array.isArray(data.day3) ||
        Array.isArray(data.day7)
      ) {

        const result = emptyKeys();

        result.buy.day2 = Array.isArray(data.day2) ? data.day2 : [];
        result.buy.day3 = Array.isArray(data.day3) ? data.day3 : [];
        result.buy.day7 = Array.isArray(data.day7) ? data.day7 : [];

        return result;

      }

    }

  } catch (error) {

    console.error(
      'โหลด Key ไม่สำเร็จ:',
      error.message
    );

  }

  return emptyKeys();

}

function saveKeys(keysData = keys) {

  try {

    fs.writeFileSync(
      KEYS_FILE,
      JSON.stringify(
        keysData,
        null,
        2
      ),
      'utf8'
    );

  } catch (error) {

    console.error(
      'บันทึก Key ไม่สำเร็จ:',
      error.message
    );

  }

}

let keys = loadKeys();

// =====================================================
// COOLDOWN
// =====================================================

function loadCooldowns() {

  try {

    if (
      fs.existsSync(
        COOLDOWN_FILE
      )
    ) {

      const data =
        JSON.parse(
          fs.readFileSync(
            COOLDOWN_FILE,
            'utf8'
          )
        );

      return data &&
        typeof data === 'object'
        ? data
        : {};

    }

  } catch {}

  return {};

}

function saveCooldowns(data) {

  try {

    fs.writeFileSync(
      COOLDOWN_FILE,
      JSON.stringify(
        data,
        null,
        2
      ),
      'utf8'
    );

  } catch (error) {

    console.error(
      'บันทึกคูลดาวน์ไม่สำเร็จ:',
      error.message
    );

  }

}

let cooldowns =
  loadCooldowns();

// =====================================================
// PANELS
// =====================================================

function loadPanels() {

  try {

    if (
      fs.existsSync(
        PANELS_FILE
      )
    ) {

      const data =
        JSON.parse(
          fs.readFileSync(
            PANELS_FILE,
            'utf8'
          )
        );

      return Array.isArray(data.panels)
        ? data.panels
        : [];

    }

  } catch {}

  return [];

}

function savePanels(data) {

  try {

    fs.writeFileSync(
      PANELS_FILE,
      JSON.stringify(
        {
          panels: data
        },
        null,
        2
      ),
      'utf8'
    );

  } catch (error) {

    console.error(
      'บันทึก Panel ไม่สำเร็จ:',
      error.message
    );

  }

}

let panels =
  loadPanels();

// =====================================================
// LOCK
// =====================================================

const spinningNow =
  new Set();

const buyingNow =
  new Set();

// =====================================================
// UTIL
// =====================================================

function formatRemaining(ms) {

  const totalMin =
    Math.ceil(
      ms / 60000
    );

  const h =
    Math.floor(
      totalMin / 60
    );

  const m =
    totalMin % 60;

  if (h > 0) {

    return `${h} ชั่วโมง ${m} นาที`;

  }

  return `${m} นาที`;

}

function footerText() {

  return (
    `🎡 แจก » 1วัน ${keys.giveaway.day1.length} • ` +
    `2วัน ${keys.giveaway.day2.length} • ` +
    `3วัน ${keys.giveaway.day3.length} • ` +
    `7วัน ${keys.giveaway.day7.length}\n` +
    `🛒 ชื้อ » 2วัน ${keys.buy.day2.length} • ` +
    `3วัน ${keys.buy.day3.length} • ` +
    `7วัน ${keys.buy.day7.length}`
  );

}

function parseKeysInput(input) {

  return input
    .split(/[\n,]+/)
    .map(k => k.trim())
    .filter(Boolean);

}

// =====================================================
// TRUE MONEY
// =====================================================

if (!process.env.TRUEMONEY_PHONE) {

  console.error(
    '❌ ไม่พบ TRUEMONEY_PHONE ใน .env'
  );

  process.exit(1);

}

const tmn =
  new TmnVoucherClient();

async function receiveTrueMoney(
  voucher,
  expectedBaht
) {

  try {

    const expectedSatang =
      Math.round(
        Number(expectedBaht) * 100
      );

    const result =
      await tmn.redeemVoucher(
        process.env.TRUEMONEY_PHONE,
        voucher,
        {
          amount: expectedSatang
        }
      );

    if (!result.success) {

      return {
        success: false,
        code: result.code,
        message:
          result.message ||
          'รับเงินไม่สำเร็จ'
      };

    }

    const receivedSatang =
      Number(result.data.amount);

    const receivedBaht =
      receivedSatang / 100;

    if (
      receivedSatang !==
      expectedSatang
    ) {

      return {
        success: false,
        code: 'AMOUNT_MISMATCH',
        message:
          `ยอดเงินไม่ตรง ได้รับ ${receivedBaht} บาท`
      };

    }

    return {
      success: true,
      amount: receivedBaht,
      raw: result.data.raw
    };

  } catch (error) {

    console.error(
      'TrueMoney Error:',
      error
    );

    return {
      success: false,
      code: 'ERROR',
      message:
        'เกิดข้อผิดพลาดในการรับเงิน'
    };

  }

}

// =====================================================
// SHOP EMBED
// =====================================================

function buildShopEmbed(
  title = '🛒 ร้านขาย Key'
) {

  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(
      [
        'เลือกแพ็กเกจที่ต้องการซื้อ',
        '',
        '🔵 **2 วัน — 10 บาท**',
        '🟣 **3 วัน — 15 บาท**',
        '🟡 **7 วัน — 35 บาท**',
        '',
        'หลังเลือกสินค้า',
        'ระบบจะเปิดหน้าต่างให้ใส่ลิงก์ซอง TrueMoney',
        '',
        'เมื่อรับเงินสำเร็จ',
        'Key จะถูกส่งทาง DM'
      ].join('\n')
    )
    .setColor(0x5865F2)
    .setFooter({
      text:
        'กรุณาเปิดรับ DM จากสมาชิกเซิร์ฟเวอร์'
    });

}

// =====================================================
// SHOP BUTTONS (ใช้สต็อก keys.buy)
// =====================================================

function buildShopButtons() {

  return [

    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId(
            'buy_day2'
          )
          .setLabel(
            '2 วัน • 10 บาท'
          )
          .setEmoji('🔵')
          .setStyle(
            ButtonStyle.Primary
          )
          .setDisabled(
            keys.buy.day2.length === 0
          ),

        new ButtonBuilder()
          .setCustomId(
            'buy_day3'
          )
          .setLabel(
            '3 วัน • 15 บาท'
          )
          .setEmoji('🟣')
          .setStyle(
            ButtonStyle.Secondary
          )
          .setDisabled(
            keys.buy.day3.length === 0
          ),

        new ButtonBuilder()
          .setCustomId(
            'buy_day7'
          )
          .setLabel(
            '7 วัน • 35 บาท'
          )
          .setEmoji('🟡')
          .setStyle(
            ButtonStyle.Success
          )
          .setDisabled(
            keys.buy.day7.length === 0
          )

      )

  ];

}

// =====================================================
// WHEEL BUTTONS (ใช้สต็อก keys.giveaway)
// =====================================================

function buildWheelRows(
  idSuffix
) {

  const row =
    new ActionRowBuilder();

  for (
    const category of GIVEAWAY_CATEGORIES
  ) {

    row.addComponents(

      new ButtonBuilder()
        .setCustomId(
          `spin_${category}_${idSuffix}`
        )
        .setLabel(
          LABEL[category]
        )
        .setStyle(
          ButtonStyle.Primary
        )
        .setEmoji('🎡')
        .setDisabled(
          keys.giveaway[category].length === 0
        )

    );

  }

  return [row];

}

// =====================================================
// CATEGORY FROM ID
// =====================================================

function categoryFromCustomId(
  customId
) {

  for (
    const cat of GIVEAWAY_CATEGORIES
  ) {

    if (
      customId.startsWith(
        `spin_${cat}_`
      )
    ) {

      return cat;

    }

  }

  return null;

}

// =====================================================
// TAKE KEY
// poolType: 'giveaway' | 'buy'
// =====================================================

function takeKey(poolType, category) {

  const pool =
    keys[poolType];

  if (
    !pool ||
    !pool[category] ||
    pool[category].length === 0
  ) {

    return null;

  }

  const key =
    pool[category].shift();

  saveKeys(keys);

  return key;

}

// =====================================================
// REFRESH PANEL
// =====================================================

async function refreshPanel(
  message
) {

  try {

    if (
      !message ||
      !message.embeds ||
      !message.embeds.length
    ) {

      return;

    }

    const oldEmbed =
      message.embeds[0];

    const newEmbed =
      EmbedBuilder
        .from(oldEmbed)
        .setFooter({
          text: footerText()
        });

    const newRows =
      message.components.map(
        row => {

          const newRow =
            new ActionRowBuilder();

          for (
            const comp of row.components
          ) {

            const button =
              ButtonBuilder.from(
                comp
              );

            if (
              comp.customId.startsWith(
                'spin_'
              )
            ) {

              const cat =
                categoryFromCustomId(
                  comp.customId
                );

              if (cat) {

                button.setDisabled(
                  keys.giveaway[cat].length === 0
                );

              }

            } else if (
              comp.customId.startsWith(
                'buy_'
              )
            ) {

              const buyCat =
                comp.customId.replace(
                  'buy_',
                  ''
                );

              if (
                keys.buy[buyCat]
              ) {

                button.setDisabled(
                  keys.buy[buyCat].length === 0
                );

              }

            }

            newRow.addComponents(
              button
            );

          }

          return newRow;

        }
      );

    await message.edit({
      embeds: [newEmbed],
      components: newRows
    });

  } catch (error) {

    console.error(
      'Refresh Panel Error:',
      error.message
    );

  }

}

// =====================================================
// REFRESH ALL PANELS
// =====================================================

async function refreshAllPanels() {

  if (!panels.length) {
    return;
  }

  const valid = [];

  for (
    const panel of panels
  ) {

    try {

      const channel =
        await client.channels.fetch(
          panel.channelId
        );

      const message =
        await channel.messages.fetch(
          panel.messageId
        );

      await refreshPanel(
        message
      );

      valid.push(panel);

    } catch {}

  }

  panels = valid;

  savePanels(panels);

}

// =====================================================
// WHEEL
// =====================================================

const WHEEL_SEGMENTS = [
  '🟩 ได้',
  '🟥 ไม่ได้',
  '🟩 ได้',
  '🟥 ไม่ได้',
  '🟩 ได้',
  '🟥 ไม่ได้',
  '🟩 ได้',
  '🟥 ไม่ได้'
];

const WHEEL_LEN =
  WHEEL_SEGMENTS.length;

const SPIN_DELAYS = [
  140,
  140,
  160,
  180,
  210,
  250,
  300,
  360,
  430,
  510,
  600,
  700,
  820
];

function renderWheelFrame(
  idx,
  isFinal
) {

  const prev =
    WHEEL_SEGMENTS[
      (idx - 1 + WHEEL_LEN) %
      WHEEL_LEN
    ];

  const cur =
    WHEEL_SEGMENTS[
      idx % WHEEL_LEN
    ];

  const next =
    WHEEL_SEGMENTS[
      (idx + 1) % WHEEL_LEN
    ];

  const pointer =
    isFinal
      ? '     🔽 หยุด! 🔽'
      : '        🔻';

  return (
    '```\n' +
    `   ${prev}      ${next}\n` +
    `${pointer}\n` +
    `      ▶ ${cur} ◀\n` +
    '```'
  );

}

async function spinWheel(
  interaction,
  itemName,
  category
) {

  const chancePercent =
    Math.round(
      WIN_CHANCE[category] * 100
    );

  const isWin =
    Math.random() <
    WIN_CHANCE[category];

  const matchType =
    isWin
      ? 'ได้'
      : 'ไม่ได้';

  const candidates =
    WHEEL_SEGMENTS
      .map((seg, i) => ({
        seg,
        i
      }))
      .filter(
        o =>
          (
            o.seg.includes('ไม่ได้')
              ? 'ไม่ได้'
              : 'ได้'
          ) === matchType
      )
      .map(
        o => o.i
      );

  const finalIndex =
    candidates[
      Math.floor(
        Math.random() *
        candidates.length
      )
    ];

  const totalSteps =
    SPIN_DELAYS.length;

  const startOffset =
    finalIndex -
    (totalSteps - 1);

  const idxAt =
    i =>
      (
        (
          startOffset + i
        ) % WHEEL_LEN +
        WHEEL_LEN
      ) % WHEEL_LEN;

  const spinEmbed =
    (idx, isFinal) =>
      new EmbedBuilder()
        .setTitle(
          isFinal
            ? '🎯 วงล้อหยุดแล้ว!'
            : '🎡 กำลังหมุนวงล้อ...'
        )
        .setDescription(
          `**${itemName}** • ` +
          `ระยะเวลา **${CHOICE_LABEL[category]}**\n\n` +
          `โอกาสได้ ${chancePercent}%\n\n` +
          renderWheelFrame(
            idx,
            isFinal
          )
        )
        .setColor(
          isFinal
            ? (
              isWin
                ? 0x57F287
                : 0xED4245
            )
            : 0x5865F2
        );

  await interaction.reply({
    embeds: [
      spinEmbed(
        idxAt(0),
        false
      )
    ],
    flags:
      MessageFlags.Ephemeral
  });

  for (
    let i = 1;
    i < totalSteps;
    i++
  ) {

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          SPIN_DELAYS[i]
        )
    );

    await interaction.editReply({
      embeds: [
        spinEmbed(
          idxAt(i),
          i === totalSteps - 1
        )
      ]
    });

  }

  await new Promise(
    resolve =>
      setTimeout(
        resolve,
        500
      )
  );

  if (isWin) {

    const key =
      takeKey('giveaway', category);

    if (!key) {

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle(
              '😔 Key หมดพอดี'
            )
            .setDescription(
              `**${itemName}**\n\n` +
              `ไม่มี Key ${CHOICE_LABEL[category]} เหลือ`
            )
            .setColor(
              0xFEE75C
            )
        ]
      });

      await refreshPanel(
        interaction.message
      );

      return;

    }

    let dmSuccess = true;

    try {

      await interaction.user.send({
        content: key
      });

      await interaction.user.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(
              '🎉 คุณชนะ!'
            )
            .setDescription(
              `**รางวัล:** ${itemName}\n` +
              `**ระยะเวลา:** ${CHOICE_LABEL[category]}\n` +
              `**โอกาส:** ${chancePercent}%\n\n` +
              'กรุณาเก็บ Key ไว้ให้ดี'
            )
            .setColor(
              0x57F287
            )
            .setTimestamp()
        ]
      });

    } catch {

      dmSuccess = false;

    }

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle(
            '🎉 ยินดีด้วย!'
          )
          .setDescription(
            dmSuccess
              ? `คุณได้รับ **${CHOICE_LABEL[category]}**\n\n📩 Key ถูกส่ง DM แล้ว`
              : '⚠️ ไม่สามารถส่ง DM ได้'
          )
          .setColor(
            0x57F287
          )
          .setTimestamp()
      ]
    });

    if (!dmSuccess) {

      keys.giveaway[category].unshift(
        key
      );

      saveKeys(keys);

    }

  } else {

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle(
            '😢 ไม่โชคดีในรอบนี้'
          )
          .setDescription(
            `**${itemName}** • ${CHOICE_LABEL[category]}`
          )
          .setColor(
            0xED4245
          )
      ]
    });

  }

  await refreshPanel(
    interaction.message
  );

}

// =====================================================
// DEPLOY COMMANDS
// =====================================================

async function deployCommands() {

  const commands = [

    new SlashCommandBuilder()
      .setName('เลือกห้อง')
      .setDescription(
        'สร้างหน้าต่างร้าน/สุ่ม'
      )
      .addStringOption(
        o =>
          o
            .setName('หัวข้อ')
            .setDescription(
              'ชื่อหน้าต่าง'
            )
            .setRequired(false)
            .setMaxLength(100)
      )
      .addStringOption(
        o =>
          o
            .setName('รายการ1')
            .setDescription(
              'ชื่อรายการ'
            )
            .setRequired(true)
            .setMaxLength(80)
      )
      .toJSON(),

    new SlashCommandBuilder()
      .setName('เพิ่มคีย์')
      .setDescription(
        'เพิ่ม Key'
      )
      .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator
      )
      .addStringOption(
        o =>
          o
            .setName('ประเภท')
            .setDescription(
              'สต็อก + ระยะเวลา'
            )
            .setRequired(true)
            .addChoices(
              { name: '🎡 แจก - 1 วัน', value: 'giveaway_day1' },
              { name: '🎡 แจก - 2 วัน', value: 'giveaway_day2' },
              { name: '🎡 แจก - 3 วัน', value: 'giveaway_day3' },
              { name: '🎡 แจก - 7 วัน', value: 'giveaway_day7' },
              { name: '🛒 ชื้อ - 2 วัน', value: 'buy_day2' },
              { name: '🛒 ชื้อ - 3 วัน', value: 'buy_day3' },
              { name: '🛒 ชื้อ - 7 วัน', value: 'buy_day7' }
            )
      )
      .addStringOption(
        o =>
          o
            .setName('keys')
            .setDescription(
              'Key คั่นด้วย , หรือขึ้นบรรทัดใหม่'
            )
            .setRequired(true)
      )
      .toJSON(),

    new SlashCommandBuilder()
      .setName('ดูคีย์')
      .setDescription(
        'ดู Key'
      )
      .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator
      )
      .toJSON(),

    new SlashCommandBuilder()
      .setName('ล้างคีย์')
      .setDescription(
        'ล้าง Key'
      )
      .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator
      )
      .addStringOption(
        o =>
          o
            .setName('ประเภท')
            .setDescription(
              'สต็อก + ระยะเวลาที่จะล้าง'
            )
            .setRequired(false)
            .addChoices(
              { name: '🎡 แจก - 1 วัน', value: 'giveaway_day1' },
              { name: '🎡 แจก - 2 วัน', value: 'giveaway_day2' },
              { name: '🎡 แจก - 3 วัน', value: 'giveaway_day3' },
              { name: '🎡 แจก - 7 วัน', value: 'giveaway_day7' },
              { name: '🛒 ชื้อ - 2 วัน', value: 'buy_day2' },
              { name: '🛒 ชื้อ - 3 วัน', value: 'buy_day3' },
              { name: '🛒 ชื้อ - 7 วัน', value: 'buy_day7' },
              { name: 'ทั้งหมด', value: 'all' }
            )
      )
      .toJSON()

  ];

  const rest =
    new REST({
      version: '10'
    }).setToken(
      process.env.TOKEN
    );

  try {

    if (
      process.env.GUILD_ID
    ) {

      await rest.put(
        Routes.applicationGuildCommands(
          process.env.CLIENT_ID,
          process.env.GUILD_ID
        ),
        {
          body: commands
        }
      );

    } else {

      await rest.put(
        Routes.applicationCommands(
          process.env.CLIENT_ID
        ),
        {
          body: commands
        }
      );

    }

    console.log(
      '✅ ลงทะเบียน Commands สำเร็จ'
    );

  } catch (error) {

    console.error(
      '❌ Deploy Commands Error:',
      error.message
    );

  }

}

// =====================================================
// READY
// =====================================================

client.once(
  Events.ClientReady,
  async c => {

    console.log(
      `✅ ออนไลน์: ${c.user.tag}`
    );

    console.log(
      `📦 แจก 1วัน: ${keys.giveaway.day1.length} • ` +
      `2วัน: ${keys.giveaway.day2.length} • ` +
      `3วัน: ${keys.giveaway.day3.length} • ` +
      `7วัน: ${keys.giveaway.day7.length}`
    );

    console.log(
      `📦 ชื้อ 2วัน: ${keys.buy.day2.length} • ` +
      `3วัน: ${keys.buy.day3.length} • ` +
      `7วัน: ${keys.buy.day7.length}`
    );

    await deployCommands();

    try {

      const owner =
        await client.users.fetch(
          config.ownerId
        );

      await owner.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(
              '🤖 บอทพร้อมใช้งาน'
            )
            .setDescription(
              `🎡 แจก » 1วัน ${keys.giveaway.day1.length} • ` +
              `2วัน ${keys.giveaway.day2.length} • ` +
              `3วัน ${keys.giveaway.day3.length} • ` +
              `7วัน ${keys.giveaway.day7.length}\n` +
              `🛒 ชื้อ » 2วัน ${keys.buy.day2.length} • ` +
              `3วัน ${keys.buy.day3.length} • ` +
              `7วัน ${keys.buy.day7.length}\n\n` +
              `ซื้อ: 2 วัน 10 บาท / 3 วัน 15 บาท / 7 วัน 35 บาท\n\n` +
              `เพิ่ม Key: พิมพ์ \`แจก:N คีย์\` หรือ \`ชื้อN: คีย์\` ` +
              `(N = 1/2/3/7 สำหรับแจก, 2/3/7 สำหรับชื้อ)`
            )
            .setColor(
              0x57F287
            )
        ]
      });

    } catch {}

  }

);

// =====================================================
// เพิ่ม Key ผ่านข้อความ
// รูปแบบ:
//   แจก:1 KEY-XXXX      → เข้าสต็อก giveaway (แจกวงล้อ) หมวด day1
//   แจก:2 KEY-XXXX      → giveaway day2
//   ชื้อ2: KEY-XXXX     → เข้าสต็อก buy (ร้านค้า) หมวด day2
// รองรับหลาย Key โดยขึ้นบรรทัดใหม่
// =====================================================

function parseAddKeyCommand(raw) {

  // แจก:N (N = 1,2,3,7)
  let match =
    raw.match(
      /^แจก\s*:\s*([1237])\s*\n?([\s\S]+)$/i
    );

  if (match) {

    const category =
      `day${match[1]}`;

    if (
      GIVEAWAY_CATEGORIES.includes(
        category
      )
    ) {

      return {
        pool: 'giveaway',
        category,
        body: match[2]
      };

    }

  }

  // ชื้อN: (N = 2,3,7)
  match =
    raw.match(
      /^ชื้อ\s*([237])\s*:\s*([\s\S]+)$/i
    );

  if (match) {

    const category =
      `day${match[1]}`;

    if (
      BUY_CATEGORIES.includes(
        category
      )
    ) {

      return {
        pool: 'buy',
        category,
        body: match[2]
      };

    }

  }

  return null;

}

async function handleAddKeyMessage(
  message,
  raw
) {

  const parsed =
    parseAddKeyCommand(raw);

  if (!parsed) {
    return false;
  }

  const newKeys =
    parsed.body
      .split(/\r?\n/)
      .map(x => x.trim())
      .filter(Boolean);

  if (!newKeys.length) {

    await message.reply(
      '❌ ไม่พบ Key'
    );

    return true;

  }

  keys[parsed.pool][parsed.category].push(
    ...newKeys
  );

  saveKeys(keys);

  await refreshAllPanels();

  const poolLabel =
    parsed.pool === 'giveaway'
      ? '🎡 แจก'
      : '🛒 ชื้อ';

  const reply =
    await message.reply(
      `✅ เพิ่ม Key สำเร็จ\n\n` +
      `สต็อก: **${poolLabel}**\n` +
      `ประเภท: **${CHOICE_LABEL[parsed.category]}**\n` +
      `เพิ่ม: **${newKeys.length}** Key\n` +
      `คงเหลือ: **${keys[parsed.pool][parsed.category].length}**`
    );

  return { reply };

}

// =====================================================
// MESSAGE CREATE
// =====================================================

client.on(
  Events.MessageCreate,
  async message => {

    try {

      if (message.author.bot) {
        return;
      }

      const raw =
        message.content?.trim();

      if (!raw) {
        return;
      }

      const isDM =
        !message.guild;

      // =================================================
      // DM เจ้าของ → เพิ่ม Key
      // =================================================

      if (isDM) {

        if (
          message.author.id !==
          config.ownerId
        ) {

          return;
        }

        await handleAddKeyMessage(
          message,
          raw
        );

        return;
      }

      // =================================================
      // ในเซิร์ฟเวอร์ → แอดมินเท่านั้น
      // =================================================

      if (
        !message.member?.permissions?.has(
          PermissionFlagsBits.Administrator
        )
      ) {

        return;
      }

      const result =
        await handleAddKeyMessage(
          message,
          raw
        );

      if (
        result &&
        result.reply
      ) {

        setTimeout(
          () => {

            message.delete()
              .catch(() => {});

            result.reply.delete()
              .catch(() => {});

          },
          5000
        );

      }

    } catch (error) {

      console.error(
        'Message Error:',
        error
      );

    }

  }

);

// =====================================================
// INTERACTION CREATE
// =====================================================

client.on(
  Events.InteractionCreate,
  async interaction => {

    try {

      // =================================================
      // SLASH COMMAND
      // =================================================

      if (
        interaction.isChatInputCommand()
      ) {

        const name =
          interaction.commandName;

        // =================================================
        // /เลือกห้อง
        // =================================================

        if (
          name === 'เลือกห้อง'
        ) {

          const title =
            interaction.options
              .getString(
                'หัวข้อ'
              ) ||
            '🎡 ร้าน / สุ่มรางวัล';

          const item =
            interaction.options
              .getString(
                'รายการ1',
                true
              )
              .trim();

          const idSuffix =
            `${Date.now()}_${Math.random()
              .toString(36)
              .slice(2, 8)}`;

          const wheelRows =
            buildWheelRows(
              idSuffix
            );

          const wheelEmbed =
            new EmbedBuilder()
              .setTitle(
                title
              )
              .setDescription(
                `**${item}**\n\n` +
                `🎡 เลือกระยะเวลาเพื่อสุ่ม\n` +
                `หรือเลือกซื้อ Key ด้านล่าง\n\n` +
                `🔹 ${LABEL.day1}\n` +
                `🔹 ${LABEL.day2}\n` +
                `🔹 ${LABEL.day3}\n` +
                `🔹 ${LABEL.day7}`
              )
              .setColor(
                0x5865F2
              )
              .setFooter({
                text:
                  footerText()
              })
              .setTimestamp();

          await interaction.reply({
            embeds: [
              wheelEmbed
            ],
            components: [
              ...wheelRows,
              ...buildShopButtons()
            ]
          });

          const sent =
            await interaction.fetchReply();

          panels.push({
            channelId:
              sent.channelId,
            messageId:
              sent.id
          });

          savePanels(
            panels
          );

          return;
        }

        // =================================================
        // /เพิ่มคีย์
        // =================================================

        if (
          name === 'เพิ่มคีย์'
        ) {

          if (
            !interaction.memberPermissions?.has(
              PermissionFlagsBits.Administrator
            )
          ) {

            return interaction.reply({
              content:
                '❌ สำหรับแอดมินเท่านั้น',
              flags:
                MessageFlags.Ephemeral
            });

          }

          const combo =
            interaction.options
              .getString(
                'ประเภท',
                true
              );

          const [pool, category] =
            combo.split('_');

          const input =
            interaction.options
              .getString(
                'keys',
                true
              );

          const newKeys =
            parseKeysInput(
              input
            );

          if (
            !newKeys.length
          ) {

            return interaction.reply({
              content:
                '❌ ไม่พบ Key',
              flags:
                MessageFlags.Ephemeral
            });

          }

          keys[pool][category].push(
            ...newKeys
          );

          saveKeys(keys);

          await refreshAllPanels();

          const poolLabel =
            pool === 'giveaway'
              ? '🎡 แจก'
              : '🛒 ชื้อ';

          return interaction.reply({
            content:
              `✅ เพิ่ม Key ${poolLabel} ${CHOICE_LABEL[category]} ` +
              `จำนวน ${newKeys.length} อัน\n` +
              `คงเหลือ: ${keys[pool][category].length}`,
            flags:
              MessageFlags.Ephemeral
          });

        }

        // =================================================
        // /ดูคีย์
        // =================================================

        if (
          name === 'ดูคีย์'
        ) {

          if (
            !interaction.memberPermissions?.has(
              PermissionFlagsBits.Administrator
            )
          ) {

            return interaction.reply({
              content:
                '❌ สำหรับแอดมินเท่านั้น',
              flags:
                MessageFlags.Ephemeral
            });

          }

          const section =
            (pool, cat) => {

              const arr =
                keys[pool][cat];

              if (
                !arr.length
              ) {

                return 'ไม่มี Key';

              }

              return arr
                .slice(0, 10)
                .map(
                  (k, i) =>
                    `${i + 1}. \`${k}\``
                )
                .join('\n');

            };

          return interaction.reply({
            content:
              `🔑 **Key คงเหลือ**\n\n` +

              `**🎡 แจก (วงล้อ)**\n` +
              `— 1 วัน (${keys.giveaway.day1.length})\n${section('giveaway', 'day1')}\n\n` +
              `— 2 วัน (${keys.giveaway.day2.length})\n${section('giveaway', 'day2')}\n\n` +
              `— 3 วัน (${keys.giveaway.day3.length})\n${section('giveaway', 'day3')}\n\n` +
              `— 7 วัน (${keys.giveaway.day7.length})\n${section('giveaway', 'day7')}\n\n` +

              `**🛒 ชื้อ (ร้านค้า)**\n` +
              `— 2 วัน (${keys.buy.day2.length})\n${section('buy', 'day2')}\n\n` +
              `— 3 วัน (${keys.buy.day3.length})\n${section('buy', 'day3')}\n\n` +
              `— 7 วัน (${keys.buy.day7.length})\n${section('buy', 'day7')}`,

            flags:
              MessageFlags.Ephemeral
          });

        }

        // =================================================
        // /ล้างคีย์
        // =================================================

        if (
          name === 'ล้างคีย์'
        ) {

          if (
            !interaction.memberPermissions?.has(
              PermissionFlagsBits.Administrator
            )
          ) {

            return interaction.reply({
              content:
                '❌ สำหรับแอดมินเท่านั้น',
              flags:
                MessageFlags.Ephemeral
            });

          }

          const target =
            interaction.options
              .getString(
                'ประเภท'
              ) ||
              'all';

          if (
            target === 'all'
          ) {

            keys = emptyKeys();

          } else {

            const [pool, category] =
              target.split('_');

            keys[pool][category] = [];

          }

          saveKeys(keys);

          await refreshAllPanels();

          return interaction.reply({
            content:
              '🗑️ ล้าง Key เรียบร้อยแล้ว',
            flags:
              MessageFlags.Ephemeral
          });

        }

      }

      // =================================================
      // BUY BUTTON (ใช้สต็อก keys.buy)
      // =================================================

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          'buy_'
        )
      ) {

        const productId =
          interaction.customId.replace(
            'buy_',
            ''
          );

        const product =
          PRODUCTS[productId];

        if (!product) {

          return interaction.reply({
            content:
              '❌ ไม่พบสินค้า',
            flags:
              MessageFlags.Ephemeral
          });

        }

        if (
          !keys.buy[productId] ||
          keys.buy[productId].length === 0
        ) {

          return interaction.reply({
            content:
              '❌ Key สินค้านี้หมดแล้ว',
            flags:
              MessageFlags.Ephemeral
          });

        }

        const modal =
          new ModalBuilder()
            .setCustomId(
              `payment_${productId}`
            )
            .setTitle(
              `ซื้อ ${product.label} • ${product.price} บาท`
            );

        const input =
          new TextInputBuilder()
            .setCustomId(
              'truemoney_link'
            )
            .setLabel(
              'ลิงก์ซอง TrueMoney'
            )
            .setPlaceholder(
              'https://gift.truemoney.com/campaign/?v=...'
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(true)
            .setMinLength(10)
            .setMaxLength(500);

        modal.addComponents(
          new ActionRowBuilder()
            .addComponents(
              input
            )
        );

        await interaction.showModal(
          modal
        );

        return;

      }

      // =================================================
      // PAYMENT MODAL (ใช้สต็อก keys.buy)
      // =================================================

      if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith(
          'payment_'
        )
      ) {

        const productId =
          interaction.customId.replace(
            'payment_',
            ''
          );

        const product =
          PRODUCTS[productId];

        if (!product) {

          return interaction.reply({
            content:
              '❌ ไม่พบสินค้า',
            flags:
              MessageFlags.Ephemeral
          });

        }

        if (
          buyingNow.has(
            interaction.user.id
          )
        ) {

          return interaction.reply({
            content:
              '⏳ กำลังตรวจสอบรายการเดิมอยู่ กรุณารอสักครู่',
            flags:
              MessageFlags.Ephemeral
          });

        }

        if (
          !keys.buy[productId] ||
          keys.buy[productId].length === 0
        ) {

          return interaction.reply({
            content:
              '❌ Key หมดแล้ว',
            flags:
              MessageFlags.Ephemeral
          });

        }

        const voucher =
          interaction.fields
            .getTextInputValue(
              'truemoney_link'
            )
            .trim();

        buyingNow.add(
          interaction.user.id
        );

        try {

          await interaction.reply({
            content:
              `⏳ กำลังตรวจสอบซองและรับเงิน **${product.price} บาท** ...`,
            flags:
              MessageFlags.Ephemeral
          });

          const payment =
            await receiveTrueMoney(
              voucher,
              product.price
            );

          if (
            !payment.success
          ) {

            await interaction.editReply({
              content:
                `❌ รับเงินไม่สำเร็จ\n\n` +
                `รหัส: \`${payment.code || 'UNKNOWN'}\`\n` +
                `${payment.message || ''}`
            });

            return;

          }

          if (
            !keys.buy[productId] ||
            keys.buy[productId].length === 0
          ) {

            await interaction.editReply({
              content:
                '⚠️ รับเงินสำเร็จ แต่ Key หมดพอดี กรุณาติดต่อแอดมิน'
            });

            return;

          }

          const key =
            takeKey(
              'buy',
              productId
            );

          if (!key) {

            await interaction.editReply({
              content:
                '⚠️ รับเงินสำเร็จ แต่ไม่สามารถดึง Key ได้'
            });

            return;

          }

          try {

            await interaction.user.send({
              content:
                key
            });

            await interaction.user.send({
              embeds: [
                new EmbedBuilder()
                  .setTitle(
                    '🎉 ซื้อ Key สำเร็จ'
                  )
                  .setDescription(
                    `**สินค้า:** ${product.label}\n` +
                    `**ราคา:** ${product.price} บาท\n\n` +
                    `🔑 Key ถูกส่งให้ในข้อความก่อนหน้านี้`
                  )
                  .setColor(
                    0x57F287
                  )
                  .setTimestamp()
              ]
            });

          } catch (dmError) {

            keys.buy[productId].unshift(
              key
            );

            saveKeys(keys);

            await interaction.editReply({
              content:
                '⚠️ รับเงินสำเร็จแล้ว แต่ส่ง DM ไม่ได้\n' +
                'กรุณาเปิดรับ DM แล้วติดต่อแอดมิน'
            });

            return;

          }

          await interaction.editReply({
            content:
              `✅ ชำระเงินสำเร็จ **${product.price} บาท**\n\n` +
              `📦 ${product.label}\n` +
              `📩 Key ถูกส่งทาง DM แล้ว`
          });

          await refreshAllPanels();

        } finally {

          buyingNow.delete(
            interaction.user.id
          );

        }

        return;

      }

      // =================================================
      // SPIN BUTTON (ใช้สต็อก keys.giveaway)
      // =================================================

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          'spin_'
        )
      ) {

        const category =
          categoryFromCustomId(
            interaction.customId
          );

        if (!category) {
          return;
        }

        const userId =
          interaction.user.id;

        if (
          spinningNow.has(
            userId
          )
        ) {

          return interaction.reply({
            content:
              '⏳ กำลังหมุนอยู่',
            flags:
              MessageFlags.Ephemeral
          });

        }

        const now =
          Date.now();

        const lastSpin =
          cooldowns[userId] ||
          0;

        const elapsed =
          now - lastSpin;

        if (
          elapsed <
          COOLDOWN_MS
        ) {

          return interaction.reply({
            content:
              `⏰ กรุณารออีก **${
                formatRemaining(
                  COOLDOWN_MS -
                  elapsed
                )
              }**`,
            flags:
              MessageFlags.Ephemeral
          });

        }

        if (
          keys.giveaway[category].length === 0
        ) {

          await refreshPanel(
            interaction.message
          );

          return interaction.reply({
            content:
              `😢 Key ${CHOICE_LABEL[category]} หมด`,
            flags:
              MessageFlags.Ephemeral
          });

        }

        cooldowns[userId] =
          now;

        saveCooldowns(
          cooldowns
        );

        spinningNow.add(
          userId
        );

        try {

          const itemName =
            interaction.message
              .embeds[0]
              ?.description
              ?.split('\n')[0]
              ?.replace(
                /\*\*/g,
                ''
              ) ||
            'รางวัล';

          await spinWheel(
            interaction,
            itemName,
            category
          );

        } finally {

          spinningNow.delete(
            userId
          );

        }

        return;

      }

    } catch (error) {

      console.error(
        'Interaction Error:',
        error
      );

      try {

        if (
          interaction.replied ||
          interaction.deferred
        ) {

          await interaction.editReply({
            content:
              '❌ เกิดข้อผิดพลาดในระบบ'
          });

        } else {

          await interaction.reply({
            content:
              '❌ เกิดข้อผิดพลาดในระบบ',
            flags:
              MessageFlags.Ephemeral
          });

        }

      } catch {}

    }

  }

);

// =====================================================
// LOGIN
// =====================================================

if (!process.env.TOKEN) {

  console.error(
    '❌ ไม่มี TOKEN ใน .env'
  );

  process.exit(1);

}

if (!process.env.CLIENT_ID) {

  console.error(
    '❌ ไม่มี CLIENT_ID ใน .env'
  );

  process.exit(1);

}

client.login(
  process.env.TOKEN
);
