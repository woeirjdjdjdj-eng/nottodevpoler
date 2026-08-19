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

// เปลี่ยนเป็น 2 / 3 / 7 วัน
const CATEGORIES = [
  'day2',
  'day3',
  'day7'
];

// =====================================================
// โอกาสสุ่ม
// =====================================================

const WIN_CHANCE = {
  day2: 0.25,
  day3: 0.10,
  day7: 0.05
};

const LABEL = {
  day2: '2 วัน (25%)',
  day3: '3 วัน (10%)',
  day7: '7 วัน (5%)'
};

const CHOICE_LABEL = {
  day2: '2 วัน',
  day3: '3 วัน',
  day7: '7 วัน'
};

// =====================================================
// สินค้าสำหรับ "ซื้อ"
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
// =====================================================

function loadKeys() {

  try {

    if (fs.existsSync(KEYS_FILE)) {

      const data = JSON.parse(
        fs.readFileSync(
          KEYS_FILE,
          'utf8'
        )
      );

      return {

        day2: Array.isArray(data.day2)
          ? data.day2
          : [],

        day3: Array.isArray(data.day3)
          ? data.day3
          : [],

        day7: Array.isArray(data.day7)
          ? data.day7
          : []

      };

    }

  } catch (error) {

    console.error(
      'โหลด Key ไม่สำเร็จ:',
      error.message
    );

  }

  return {
    day2: [],
    day3: [],
    day7: []
  };

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
    `2วัน เหลือ ${keys.day2.length} • ` +
    `3วัน เหลือ ${keys.day3.length} • ` +
    `7วัน เหลือ ${keys.day7.length}`
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
// SHOP BUTTONS
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
            keys.day2.length === 0
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
            keys.day3.length === 0
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
            keys.day7.length === 0
          )

      )

  ];

}

// =====================================================
// WHEEL BUTTONS
// =====================================================

function buildWheelRows(
  idSuffix
) {

  const row =
    new ActionRowBuilder();

  for (
    const category of CATEGORIES
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
          keys[category].length === 0
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
    const cat of CATEGORIES
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
// =====================================================

function takeKey(category) {

  if (
    !keys[category] ||
    keys[category].length === 0
  ) {

    return null;

  }

  const key =
    keys[category].shift();

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

            const cat =
              categoryFromCustomId(
                comp.customId
              );

            if (cat) {

              button.setDisabled(
                keys[cat].length === 0
              );

            }

            if (
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
                keys[buyCat]
              ) {

                button.setDisabled(
                  keys[buyCat].length === 0
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
      takeKey(category);

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

      keys[category].unshift(
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
              'ประเภท Key'
            )
            .setRequired(true)
            .addChoices(
              {
                name: '2 วัน',
                value: 'day2'
              },
              {
                name: '3 วัน',
                value: 'day3'
              },
              {
                name: '7 วัน',
                value: 'day7'
              }
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
              'ประเภทที่จะล้าง'
            )
            .setRequired(false)
            .addChoices(
              {
                name: '2 วัน',
                value: 'day2'
              },
              {
                name: '3 วัน',
                value: 'day3'
              },
              {
                name: '7 วัน',
                value: 'day7'
              },
              {
                name: 'ทั้งหมด',
                value: 'all'
              }
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
      `📦 2 วัน: ${keys.day2.length}`
    );

    console.log(
      `📦 3 วัน: ${keys.day3.length}`
    );

    console.log(
      `📦 7 วัน: ${keys.day7.length}`
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
              `2 วัน: ${keys.day2.length}\n` +
              `3 วัน: ${keys.day3.length}\n` +
              `7 วัน: ${keys.day7.length}\n\n` +
              `ซื้อ: 2 วัน 10 บาท / 3 วัน 15 บาท / 7 วัน 35 บาท`
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
      //
      // ใช้:
      //
      // ชื้อ2: KEY
      // ชื้อ3: KEY
      // ชื้อ7: KEY
      //
      // หลาย Key:
      //
      // ชื้อ2: KEY-001
      // KEY-002
      // KEY-003
      // =================================================

      if (isDM) {

        if (
          message.author.id !==
          config.ownerId
        ) {

          return;
        }

        const match =
          raw.match(
            /^ชื้อ\s*([237])\s*:\s*(.+)$/is
          );

        if (!match) {
          return;
        }

        const category =
          `day${match[1]}`;

        const newKeys =
          match[2]
            .split(/\r?\n/)
            .map(
              x => x.trim()
            )
            .filter(Boolean);

        if (!newKeys.length) {

          await message.reply(
            '❌ ไม่พบ Key'
          );

          return;
        }

        keys[category].push(
          ...newKeys
        );

        saveKeys(keys);

        await refreshAllPanels();

        await message.reply(
          `✅ เพิ่ม Key สำเร็จ\n\n` +
          `ประเภท: **${CHOICE_LABEL[category]}**\n` +
          `เพิ่ม: **${newKeys.length}** Key\n` +
          `คงเหลือ: **${keys[category].length}**`
        );

        return;
      }

      // =================================================
      // Server → รองรับเพิ่ม Key แบบเดิมสำหรับ Admin
      //
      // 2: KEY
      // 3: KEY
      // 7: KEY
      // =================================================

      if (
        !message.member?.permissions?.has(
          PermissionFlagsBits.Administrator
        )
      ) {

        return;
      }

      const prefixMatch =
        raw.match(
          /^([237])\s*(?:วัน)?\s*[:\-]\s*(.+)$/s
        );

      if (!prefixMatch) {
        return;
      }

      const category =
        `day${prefixMatch[1]}`;

      const newKeys =
        prefixMatch[2]
          .split(/\r?\n/)
          .map(
            x => x.trim()
          )
          .filter(Boolean);

      if (!newKeys.length) {
        return;
      }

      keys[category].push(
        ...newKeys
      );

      saveKeys(keys);

      await refreshAllPanels();

      const confirm =
        await message.reply(
          `✅ เพิ่ม Key ${CHOICE_LABEL[category]} ` +
          `จำนวน ${newKeys.length} อัน`
        );

      setTimeout(
        () => {

          message.delete()
            .catch(() => {});

          confirm.delete()
            .catch(() => {});

        },
        5000
      );

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

          const shopEmbed =
            buildShopEmbed(
              `🛒 ${item}`
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

          const category =
            interaction.options
              .getString(
                'ประเภท',
                true
              );

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

          keys[category].push(
            ...newKeys
          );

          saveKeys(keys);

          await refreshAllPanels();

          return interaction.reply({
            content:
              `✅ เพิ่ม Key ${CHOICE_LABEL[category]} ` +
              `จำนวน ${newKeys.length} อัน\n` +
              `คงเหลือ: ` +
              `2วัน ${keys.day2.length} • ` +
              `3วัน ${keys.day3.length} • ` +
              `7วัน ${keys.day7.length}`,
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
            cat => {

              if (
                !keys[cat].length
              ) {

                return 'ไม่มี Key';

              }

              return keys[cat]
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

              `**2 วัน (${keys.day2.length})**\n` +
              section('day2') +

              `\n\n**3 วัน (${keys.day3.length})**\n` +
              section('day3') +

              `\n\n**7 วัน (${keys.day7.length})**\n` +
              section('day7'),

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

            keys = {
              day2: [],
              day3: [],
              day7: []
            };

          } else {

            keys[target] = [];

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
      // BUY BUTTON
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
          !keys[productId] ||
          keys[productId].length === 0
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
      // PAYMENT MODAL
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
          !keys[productId] ||
          keys[productId].length === 0
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
            !keys[productId] ||
            keys[productId].length === 0
          ) {

            await interaction.editReply({
              content:
                '⚠️ รับเงินสำเร็จ แต่ Key หมดพอดี กรุณาติดต่อแอดมิน'
            });

            return;

          }

          const key =
            takeKey(
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

            keys[productId].unshift(
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
      // SPIN BUTTON
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
          keys[category].length === 0
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
