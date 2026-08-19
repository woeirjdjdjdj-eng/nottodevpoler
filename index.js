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
  SlashCommandBuilder,
  ChannelType
} = require('discord.js');

const fs = require('fs');
const path = require('path');

const config = require('./config');

// =====================================================
// TRUE MONEY
// =====================================================

const {
  TmnVoucherClient
} = require('@prakrit_m/tmn-voucher');

// =====================================================
// CONFIG CHECK
// =====================================================

if (!config || typeof config !== 'object') {

  console.error(
    '❌ ไม่พบ config.js'
  );

  process.exit(1);

}

if (
  !config.token ||
  config.token === 'ใส่_BOT_TOKEN_ตรงนี้'
) {

  console.error(
    '❌ กรุณาใส่ Discord Bot Token ใน config.js'
  );

  process.exit(1);

}

if (
  !config.clientId ||
  config.clientId === 'ใส่_CLIENT_ID_ตรงนี้'
) {

  console.error(
    '❌ กรุณาใส่ Client ID ใน config.js'
  );

  process.exit(1);

}

if (
  !config.trueMoneyPhone ||
  config.trueMoneyPhone === 'เบอร์รับเงิน_TRUE_MONEY'
) {

  console.error(
    '❌ กรุณาใส่ TrueMoney Phone ใน config.js'
  );

  process.exit(1);

}

if (!config.ownerId) {

  console.error(
    '❌ กรุณาใส่ ownerId ใน config.js'
  );

  process.exit(1);

}

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

  partials: [
    Partials.Channel
  ]

});

// =====================================================
// CONFIG
// =====================================================

// ฟรีได้วันละครั้ง
const FREE_COOLDOWN_MS =
  24 * 60 * 60 * 1000;

// =====================================================
// PRODUCTS
// =====================================================

const PRODUCTS = {

  buy2: {

    days: 2,

    price: 10,

    label: '2 วัน',

    emoji: '🔵'

  },

  buy3: {

    days: 3,

    price: 15,

    label: '3 วัน',

    emoji: '🟣'

  },

  buy7: {

    days: 7,

    price: 35,

    label: '7 วัน',

    emoji: '🟡'

  }

};

// =====================================================
// FREE PRODUCTS
// =====================================================

const FREE_PRODUCTS = {

  free1: {

    days: 1,

    label: 'ฟรี 1 วัน',

    emoji: '🎁'

  }

};

// =====================================================
// DATA
// =====================================================

const DATA_DIR =
  path.join(
    __dirname,
    'data'
  );

const KEYS_FILE =
  path.join(
    DATA_DIR,
    'keys.json'
  );

const FREE_COOLDOWN_FILE =
  path.join(
    DATA_DIR,
    'free_cooldowns.json'
  );

const PANELS_FILE =
  path.join(
    DATA_DIR,
    'panels.json'
  );

// =====================================================
// CREATE DATA DIRECTORY
// =====================================================

if (
  !fs.existsSync(DATA_DIR)
) {

  fs.mkdirSync(
    DATA_DIR,
    {
      recursive: true
    }
  );

}

// =====================================================
// DEFAULT KEYS
// =====================================================

const DEFAULT_KEYS = {

  free1: [],

  buy2: [],

  buy3: [],

  buy7: []

};

// =====================================================
// LOAD KEYS
// =====================================================

function loadKeys() {

  try {

    if (
      !fs.existsSync(
        KEYS_FILE
      )
    ) {

      return {
        ...DEFAULT_KEYS
      };

    }

    const data =
      JSON.parse(
        fs.readFileSync(
          KEYS_FILE,
          'utf8'
        )
      );

    return {

      free1:
        Array.isArray(data.free1)
          ? data.free1
          : [],

      buy2:
        Array.isArray(data.buy2)
          ? data.buy2
          : [],

      buy3:
        Array.isArray(data.buy3)
          ? data.buy3
          : [],

      buy7:
        Array.isArray(data.buy7)
          ? data.buy7
          : []

    };

  } catch (error) {

    console.error(
      '❌ โหลด Key ไม่สำเร็จ:',
      error.message
    );

    return {
      ...DEFAULT_KEYS
    };

  }

}

// =====================================================
// SAVE KEYS
// =====================================================

function saveKeys(
  data = keys
) {

  try {

    fs.writeFileSync(

      KEYS_FILE,

      JSON.stringify(
        data,
        null,
        2
      ),

      'utf8'

    );

  } catch (error) {

    console.error(
      '❌ บันทึก Key ไม่สำเร็จ:',
      error.message
    );

  }

}

let keys =
  loadKeys();

// =====================================================
// LOAD FREE COOLDOWNS
// =====================================================

function loadFreeCooldowns() {

  try {

    if (
      !fs.existsSync(
        FREE_COOLDOWN_FILE
      )
    ) {

      return {};

    }

    const data =
      JSON.parse(
        fs.readFileSync(
          FREE_COOLDOWN_FILE,
          'utf8'
        )
      );

    if (
      data &&
      typeof data === 'object'
    ) {

      return data;

    }

  } catch (error) {

    console.error(
      '❌ โหลด Free Cooldown ไม่สำเร็จ:',
      error.message
    );

  }

  return {};

}

// =====================================================
// SAVE FREE COOLDOWNS
// =====================================================

function saveFreeCooldowns(
  data
) {

  try {

    fs.writeFileSync(

      FREE_COOLDOWN_FILE,

      JSON.stringify(
        data,
        null,
        2
      ),

      'utf8'

    );

  } catch (error) {

    console.error(
      '❌ บันทึก Free Cooldown ไม่สำเร็จ:',
      error.message
    );

  }

}

let freeCooldowns =
  loadFreeCooldowns();

// =====================================================
// LOAD PANELS
// =====================================================

function loadPanels() {

  try {

    if (
      !fs.existsSync(
        PANELS_FILE
      )
    ) {

      return [];

    }

    const data =
      JSON.parse(
        fs.readFileSync(
          PANELS_FILE,
          'utf8'
        )
      );

    if (
      data &&
      Array.isArray(
        data.panels
      )
    ) {

      return data.panels;

    }

  } catch (error) {

    console.error(
      '❌ โหลด Panel ไม่สำเร็จ:',
      error.message
    );

  }

  return [];

}

// =====================================================
// SAVE PANELS
// =====================================================

function savePanels(
  data
) {

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
      '❌ บันทึก Panel ไม่สำเร็จ:',
      error.message
    );

  }

}

let panels =
  loadPanels();

// =====================================================
// LOCK
// =====================================================

const freeNow =
  new Set();

const buyingNow =
  new Set();

// =====================================================
// UTIL
// =====================================================

function formatRemaining(
  ms
) {

  const totalSeconds =
    Math.ceil(
      ms / 1000
    );

  const hours =
    Math.floor(
      totalSeconds / 3600
    );

  const minutes =
    Math.floor(
      (totalSeconds % 3600) / 60
    );

  const seconds =
    totalSeconds % 60;

  if (
    hours > 0
  ) {

    return (
      `${hours} ชั่วโมง ` +
      `${minutes} นาที`
    );

  }

  if (
    minutes > 0
  ) {

    return (
      `${minutes} นาที`
    );

  }

  return (
    `${seconds} วินาที`
  );

}

// =====================================================
// FOOTER
// =====================================================

function footerText() {

  return (

    `🎁 ฟรี: ${keys.free1.length} • ` +

    `🔵 2วัน: ${keys.buy2.length} • ` +

    `🟣 3วัน: ${keys.buy3.length} • ` +

    `🟡 7วัน: ${keys.buy7.length}`

  );

}

// =====================================================
// PARSE KEYS
// =====================================================

function parseKeysInput(
  input
) {

  return input

    .split(
      /[\n,]+/
    )

    .map(
      x => x.trim()
    )

    .filter(
      Boolean
    );

}

// =====================================================
// TRUE MONEY
// =====================================================

const tmn =
  new TmnVoucherClient();

// =====================================================
// RECEIVE TRUE MONEY
// =====================================================

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

        config.trueMoneyPhone,

        voucher,

        {
          amount:
            expectedSatang
        }

      );

    if (
      !result ||
      !result.success
    ) {

      return {

        success: false,

        code:
          result?.code ||
          'UNKNOWN',

        message:
          result?.message ||
          'รับเงินไม่สำเร็จ'

      };

    }

    const receivedSatang =
      Number(
        result.data?.amount
      );

    const receivedBaht =
      receivedSatang / 100;

    if (
      receivedSatang !==
      expectedSatang
    ) {

      return {

        success: false,

        code:
          'AMOUNT_MISMATCH',

        message:
          `ยอดเงินไม่ตรง ` +
          `ได้รับ ${receivedBaht} บาท`

      };

    }

    return {

      success: true,

      amount:
        receivedBaht,

      raw:
        result.data?.raw

    };

  } catch (error) {

    console.error(
      '❌ TrueMoney Error:',
      error
    );

    return {

      success: false,

      code:
        'ERROR',

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

  return (

    new EmbedBuilder()

      .setTitle(
        title
      )

      .setDescription(

        [

          '🎁 **รับฟรี 1 วัน**',

          'กดปุ่มรับฟรีได้วันละ 1 ครั้ง',

          '',

          '💰 **ราคาสินค้า**',

          '🔵 2 วัน — **10 บาท**',

          '🟣 3 วัน — **15 บาท**',

          '🟡 7 วัน — **35 บาท**',

          '',

          '📩 หลังซื้อสำเร็จ',

          'Code จะถูกส่งเข้า DM',

          '',

          '📚 ดูวิธีใช้',

          '`/ช่วยเหลือ`'

        ].join('\n')

      )

      .setColor(
        0x5865F2
      )

      .setFooter({

        text:
          'กรุณาเปิดรับ DM จากสมาชิกเซิร์ฟเวอร์'

      })

  );

}

// =====================================================
// SHOP BUTTONS
// =====================================================

function buildShopButtons() {

  const row =
    new ActionRowBuilder();

  row.addComponents(

    new ButtonBuilder()

      .setCustomId(
        'free_1'
      )

      .setLabel(
        'ฟรี 1 วัน'
      )

      .setEmoji(
        '🎁'
      )

      .setStyle(
        ButtonStyle.Success
      )

      .setDisabled(
        keys.free1.length === 0
      ),

    new ButtonBuilder()

      .setCustomId(
        'buy_buy2'
      )

      .setLabel(
        '2 วัน • 10 บาท'
      )

      .setEmoji(
        '🔵'
      )

      .setStyle(
        ButtonStyle.Primary
      )

      .setDisabled(
        keys.buy2.length === 0
      ),

    new ButtonBuilder()

      .setCustomId(
        'buy_buy3'
      )

      .setLabel(
        '3 วัน • 15 บาท'
      )

      .setEmoji(
        '🟣'
      )

      .setStyle(
        ButtonStyle.Primary
      )

      .setDisabled(
        keys.buy3.length === 0
      ),

    new ButtonBuilder()

      .setCustomId(
        'buy_buy7'
      )

      .setLabel(
        '7 วัน • 35 บาท'
      )

      .setEmoji(
        '🟡'
      )

      .setStyle(
        ButtonStyle.Primary
      )

      .setDisabled(
        keys.buy7.length === 0
      )

  );

  return [
    row
  ];

}

// =====================================================
// TAKE KEY
// =====================================================

function takeKey(
  category
) {

  if (
    !keys[category] ||
    keys[category].length === 0
  ) {

    return null;

  }

  const key =
    keys[category].shift();

  saveKeys(
    keys
  );

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
      !message
    ) {

      return;

    }

    if (
      !message.embeds ||
      !message.embeds.length
    ) {

      return;

    }

    const oldEmbed =
      message.embeds[0];

    const newEmbed =
      EmbedBuilder

        .from(
          oldEmbed
        )

        .setFooter({

          text:
            footerText()

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

            const id =
              comp.customId;

            if (
              id === 'free_1'
            ) {

              button.setDisabled(
                keys.free1.length === 0
              );

            }

            if (
              id === 'buy_buy2'
            ) {

              button.setDisabled(
                keys.buy2.length === 0
              );

            }

            if (
              id === 'buy_buy3'
            ) {

              button.setDisabled(
                keys.buy3.length === 0
              );

            }

            if (
              id === 'buy_buy7'
            ) {

              button.setDisabled(
                keys.buy7.length === 0
              );

            }

            newRow.addComponents(
              button
            );

          }

          return newRow;

        }
      );

    await message.edit({

      embeds: [
        newEmbed
      ],

      components:
        newRows

    });

  } catch (error) {

    console.error(
      '❌ Refresh Panel Error:',
      error.message
    );

  }

}

// =====================================================
// REFRESH ALL PANELS
// =====================================================

async function refreshAllPanels() {

  if (
    !panels.length
  ) {

    return;

  }

  const validPanels = [];

  for (
    const panel of panels
  ) {

    try {

      if (
        !panel.channelId ||
        !panel.messageId
      ) {

        continue;

      }

      const channel =
        await client.channels.fetch(
          panel.channelId
        );

      if (
        !channel ||
        !channel.isTextBased()
      ) {

        continue;

      }

      const message =
        await channel.messages.fetch(
          panel.messageId
        );

      if (
        !message
      ) {

        continue;

      }

      await refreshPanel(
        message
      );

      validPanels.push(
        panel
      );

    } catch (error) {

      console.log(
        `⚠️ ข้าม Panel ${panel.messageId}`
      );

    }

  }

  panels =
    validPanels;

  savePanels(
    panels
  );

}

// =====================================================
// CLAIM FREE
// =====================================================

async function claimFree(
  interaction
) {

  const userId =
    interaction.user.id;

  if (
    freeNow.has(
      userId
    )
  ) {

    return interaction.reply({

      content:
        '⏳ กำลังดำเนินการรับ Key อยู่',

      flags:
        MessageFlags.Ephemeral

    });

  }

  const now =
    Date.now();

  const last =
    freeCooldowns[userId] || 0;

  const elapsed =
    now - last;

  if (
    elapsed <
    FREE_COOLDOWN_MS
  ) {

    return interaction.reply({

      content:

        `⏰ คุณรับฟรีไปแล้ว\n` +

        `กรุณารออีก **${
          formatRemaining(
            FREE_COOLDOWN_MS -
            elapsed
          )
        }**`,

      flags:
        MessageFlags.Ephemeral

    });

  }

  if (
    keys.free1.length === 0
  ) {

    await refreshPanel(
      interaction.message
    );

    return interaction.reply({

      content:
        '😢 Key ฟรีหมดแล้ว',

      flags:
        MessageFlags.Ephemeral

    });

  }

  freeNow.add(
    userId
  );

  try {

    const key =
      takeKey(
        'free1'
      );

    if (!key) {

      return interaction.reply({

        content:
          '❌ ไม่สามารถรับ Key ได้',

        flags:
          MessageFlags.Ephemeral

      });

    }

    try {

      await interaction.user.send({

        embeds: [

          new EmbedBuilder()

            .setTitle(
              '🎁 Key ฟรี 1 วัน'
            )

            .setDescription(

              `🔑 **Code ของคุณ:**\n\n` +

              `\`${key}\`\n\n` +

              'กรุณาเก็บ Code ไว้ให้ดี'

            )

            .setColor(
              0x57F287
            )

            .setTimestamp()

        ]

      });

    } catch (error) {

      keys.free1.unshift(
        key
      );

      saveKeys(
        keys
      );

      return interaction.reply({

        content:

          '⚠️ ไม่สามารถส่ง DM ได้\n' +

          'กรุณาเปิดรับข้อความส่วนตัวจากสมาชิกเซิร์ฟเวอร์',

        flags:
          MessageFlags.Ephemeral

      });

    }

    freeCooldowns[userId] =
      now;

    saveFreeCooldowns(
      freeCooldowns
    );

    await interaction.reply({

      content:

        '✅ รับ Key ฟรีสำเร็จ!\n' +

        '📩 Code ถูกส่งเข้า DM แล้ว',

      flags:
        MessageFlags.Ephemeral

    });

    await refreshPanel(
      interaction.message
    );

  } finally {

    freeNow.delete(
      userId
    );

  }

}

// =====================================================
// DEPLOY COMMANDS
// =====================================================

async function deployCommands() {

  const commands = [

    // =================================================
    // เลือกห้อง
    // =================================================

    new SlashCommandBuilder()

      .setName(
        'เลือกห้อง'
      )

      .setDescription(
        'สร้างหน้าร้าน Key ในห้องนี้'
      )

      .addStringOption(
        option =>
          option

            .setName(
              'title'
            )

            .setDescription(
              'หัวข้อร้าน'
            )

            .setRequired(false)

            .setMaxLength(
              100
            )
      )

      .addStringOption(
        option =>
          option

            .setName(
              'item'
            )

            .setDescription(
              'ชื่อสินค้า / ชื่อร้าน'
            )

            .setRequired(true)

            .setMaxLength(
              80
            )
      )

      .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator
      )

      .toJSON(),

    // =================================================
    // เพิ่มคีย์
    // =================================================

    new SlashCommandBuilder()

      .setName(
        'เพิ่มคีย์'
      )

      .setDescription(
        'เพิ่ม Key เข้าในคลัง'
      )

      .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator
      )

      .addStringOption(
        option =>
          option

            .setName(
              'ประเภท'
            )

            .setDescription(
              'ประเภท Key'
            )

            .setRequired(true)

            .addChoices(

              {
                name:
                  'ฟรี 1 วัน',

                value:
                  'free1'
              },

              {
                name:
                  'ขาย 2 วัน',

                value:
                  'buy2'
              },

              {
                name:
                  'ขาย 3 วัน',

                value:
                  'buy3'
              },

              {
                name:
                  'ขาย 7 วัน',

                value:
                  'buy7'
              }

            )
      )

      .addStringOption(
        option =>
          option

            .setName(
              'keys'
            )

            .setDescription(
              'ใส่หลาย Key คั่นด้วย , หรือขึ้นบรรทัดใหม่'
            )

            .setRequired(true)

            .setMaxLength(
              4000
            )
      )

      .toJSON(),

    // =================================================
    // ดูคีย์
    // =================================================

    new SlashCommandBuilder()

      .setName(
        'ดูคีย์'
      )

      .setDescription(
        'ดูจำนวน Key ที่เหลือ'
      )

      .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator
      )

      .toJSON(),

    // =================================================
    // ล้างคีย์
    // =================================================

    new SlashCommandBuilder()

      .setName(
        'ล้างคีย์'
      )

      .setDescription(
        'ล้าง Key ในคลัง'
      )

      .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator
      )

      .addStringOption(
        option =>
          option

            .setName(
              'ประเภท'
            )

            .setDescription(
              'ประเภทที่จะล้าง'
            )

            .setRequired(true)

            .addChoices(

              {
                name:
                  'ฟรี 1 วัน',

                value:
                  'free1'
              },

              {
                name:
                  '2 วัน',

                value:
                  'buy2'
              },

              {
                name:
                  '3 วัน',

                value:
                  'buy3'
              },

              {
                name:
                  '7 วัน',

                value:
                  'buy7'
              },

              {
                name:
                  'ทั้งหมด',

                value:
                  'all'
              }

            )
      )

      .toJSON(),

    // =================================================
    // ช่วยเหลือ
    // =================================================

    new SlashCommandBuilder()

      .setName(
        'ช่วยเหลือ'
      )

      .setDescription(
        'ดูวิธีใช้งานบอท'
      )

      .toJSON()

  ];

  const rest =
    new REST({
      version:
        '10'
    }).setToken(
      config.token
    );

  try {

    if (
      config.guildId
    ) {

      console.log(
        `🔄 กำลัง Deploy Commands ไป Guild: ${config.guildId}`
      );

      await rest.put(

        Routes.applicationGuildCommands(

          config.clientId,

          config.guildId

        ),

        {
          body:
            commands
        }

      );

      console.log(
        '✅ Guild Commands Deploy สำเร็จ'
      );

    } else {

      console.log(
        '🔄 กำลัง Deploy Global Commands...'
      );

      await rest.put(

        Routes.applicationCommands(
          config.clientId
        ),

        {
          body:
            commands
        }

      );

      console.log(
        '✅ Global Commands Deploy สำเร็จ'
      );

    }

  } catch (error) {

    console.error(
      '❌ Deploy Commands Error:'
    );

    console.error(
      error
    );

  }

}

// =====================================================
// HELP EMBED
// =====================================================

function buildHelpEmbed() {

  return new EmbedBuilder()

    .setTitle(
      '📚 วิธีใช้งานบอท'
    )

    .setColor(
      0x5865F2
    )

    .setDescription(

      [

        '## 🛒 สำหรับลูกค้า',

        '',

        '🎁 **รับฟรี 1 วัน**',

        'กดปุ่ม `🎁 ฟรี 1 วัน`',

        'รับได้วันละครั้ง',

        '',

        '💰 **ซื้อ Key**',

        '🔵 2 วัน — 10 บาท',

        '🟣 3 วัน — 15 บาท',

        '🟡 7 วัน — 35 บาท',

        '',

        'กดสินค้าที่ต้องการ',

        '→ ใส่ลิงก์ซอง TrueMoney',

        '→ ระบบตรวจสอบยอด',

        '→ Code ส่งเข้า DM',

        '',

        '## 🔐 สำหรับแอดมิน',

        '',

        '`/เลือกห้อง`',

        'สร้างหน้าร้านในห้องที่ใช้คำสั่ง',

        '',

        '`/เพิ่มคีย์`',

        'เพิ่ม Key เข้าในคลัง',

        '',

        '`/ดูคีย์`',

        'ดูจำนวน Key',

        '',

        '`/ล้างคีย์`',

        'ล้าง Key',

        '',

        '### เพิ่ม Key ผ่าน DM เจ้าของ',

        '`free:1 CODE`',

        '`buy:2 CODE`',

        '`buy:3 CODE`',

        '`buy:7 CODE`',

        '',

        'สามารถใส่หลาย Code คนละบรรทัดได้'

      ].join('\n')

    )

    .setFooter({

      text:
        'ระบบร้าน Key'

    });

}

// =====================================================
// READY
// =====================================================

client.once(

  Events.ClientReady,

  async readyClient => {

    console.log(
      '========================================'
    );

    console.log(
      `✅ ออนไลน์: ${readyClient.user.tag}`
    );

    console.log(
      `🎁 Free 1 วัน: ${keys.free1.length}`
    );

    console.log(
      `🔵 2 วัน: ${keys.buy2.length}`
    );

    console.log(
      `🟣 3 วัน: ${keys.buy3.length}`
    );

    console.log(
      `🟡 7 วัน: ${keys.buy7.length}`
    );

    console.log(
      `📦 Panels: ${panels.length}`
    );

    console.log(
      '========================================'
    );

    await deployCommands();

    await refreshAllPanels();

    // =================================================
    // แจ้งเจ้าของ
    // =================================================

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

              `🎁 ฟรี 1 วัน: ${keys.free1.length}\n` +

              `🔵 2 วัน: ${keys.buy2.length}\n` +

              `🟣 3 วัน: ${keys.buy3.length}\n` +

              `🟡 7 วัน: ${keys.buy7.length}\n\n` +

              `💰 ราคา\n` +

              `2 วัน = 10 บาท\n` +

              `3 วัน = 15 บาท\n` +

              `7 วัน = 35 บาท`

            )

            .setColor(
              0x57F287
            )

            .setTimestamp()

        ]

      });

    } catch (error) {

      console.log(
        '⚠️ ส่ง DM เจ้าของไม่ได้'
      );

    }

  }

);

// =====================================================
// MESSAGE CREATE
// =====================================================

client.on(

  Events.MessageCreate,

  async message => {

    try {

      if (
        message.author.bot
      ) {

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
      // DM OWNER
      // =================================================

      if (isDM) {

        if (
          message.author.id !==
          config.ownerId
        ) {

          return;

        }

        /*
          ใช้:

          free:1 CODE

          buy:2 CODE
          buy:3 CODE
          buy:7 CODE

          หลาย Key:

          buy:2 CODE-001
          CODE-002
          CODE-003
        */

        const match =
          raw.match(

            /^(free|buy)\s*:\s*(1|2|3|7)\s+(.+)$/is

          );

        if (!match) {

          await message.reply(

            [

              '❌ รูปแบบไม่ถูกต้อง',

              '',

              'ตัวอย่าง:',

              '`free:1 CODE`',

              '`buy:2 CODE`',

              '`buy:3 CODE`',

              '`buy:7 CODE`',

              '',

              'หลาย Code:',

              '`buy:2 CODE-001`',

              '`CODE-002`',

              '`CODE-003`'

            ].join('\n')

          );

          return;

        }

        const type =
          match[1].toLowerCase();

        const number =
          match[2];

        const codeText =
          match[3].trim();

        let category;

        if (
          type === 'free'
        ) {

          if (
            number !== '1'
          ) {

            await message.reply(
              '❌ Free รองรับเฉพาะ `free:1`'
            );

            return;

          }

          category =
            'free1';

        } else {

          category =
            `buy${number}`;

        }

        const newKeys =
          codeText

            .split(
              /\r?\n/
            )

            .map(
              x => x.trim()
            )

            .filter(
              Boolean
            );

        if (
          !newKeys.length
        ) {

          await message.reply(
            '❌ ไม่พบ Code'
          );

          return;

        }

        keys[category].push(
          ...newKeys
        );

        saveKeys(
          keys
        );

        await refreshAllPanels();

        await message.reply(

          [

            '✅ เพิ่ม Code สำเร็จ',

            '',

            `📦 ประเภท: **${category}**`,

            `🔑 เพิ่ม: **${newKeys.length} Code**`,

            `📊 คงเหลือ: **${keys[category].length}**`

          ].join('\n')

        );

        return;

      }

      // =================================================
      // SERVER
      // =================================================

      // ข้อความธรรมดาใน Server ไม่ทำอะไร
      return;

    } catch (error) {

      console.error(
        '❌ Message Error:',
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
      // CHAT INPUT COMMAND
      // =================================================

      if (
        interaction.isChatInputCommand()
      ) {

        const name =
          interaction.commandName;

        // =================================================
        // /ช่วยเหลือ
        // =================================================

        if (
          name === 'ช่วยเหลือ'
        ) {

          return interaction.reply({

            embeds: [
              buildHelpEmbed()
            ],

            flags:
              MessageFlags.Ephemeral

          });

        }

        // =================================================
        // /เลือกห้อง
        // =================================================

        if (
          name === 'เลือกห้อง'
        ) {

          // ต้องอยู่ใน Server
          if (
            !interaction.guild
          ) {

            return interaction.reply({

              content:
                '❌ คำสั่งนี้ใช้ใน Server เท่านั้น',

              flags:
                MessageFlags.Ephemeral

            });

          }

          // ตรวจ Admin
          if (
            !interaction.memberPermissions?.has(
              PermissionFlagsBits.Administrator
            )
          ) {

            return interaction.reply({

              content:
                '❌ คุณต้องเป็น Administrator เพื่อสร้างหน้าร้าน',

              flags:
                MessageFlags.Ephemeral

            });

          }

          // =================================================
          // CHECK CHANNEL
          // =================================================

          const channel =
            interaction.channel;

          if (
            !channel ||
            !channel.isTextBased()
          ) {

            return interaction.reply({

              content:
                '❌ ไม่สามารถสร้างหน้าร้านในห้องนี้ได้',

              flags:
                MessageFlags.Ephemeral

            });

          }

          // =================================================
          // CHECK BOT PERMISSION
          // =================================================

          const me =
            interaction.guild.members.me;

          if (
            !me
          ) {

            return interaction.reply({

              content:
                '❌ ไม่พบข้อมูลสิทธิ์ของบอท',

              flags:
                MessageFlags.Ephemeral

            });

          }

          const permissions =
            channel.permissionsFor(
              me
            );

          if (
            !permissions?.has(
              PermissionFlagsBits.ViewChannel
            )
          ) {

            return interaction.reply({

              content:
                '❌ บอทไม่มีสิทธิ์ View Channel',

              flags:
                MessageFlags.Ephemeral

            });

          }

          if (
            !permissions?.has(
              PermissionFlagsBits.SendMessages
            )
          ) {

            return interaction.reply({

              content:
                '❌ บอทไม่มีสิทธิ์ Send Messages ในห้องนี้',

              flags:
                MessageFlags.Ephemeral

            });

          }

          if (
            !permissions?.has(
              PermissionFlagsBits.EmbedLinks
            )
          ) {

            return interaction.reply({

              content:
                '❌ บอทไม่มีสิทธิ์ Embed Links ในห้องนี้',

              flags:
                MessageFlags.Ephemeral

            });

          }

          // =================================================
          // OPTIONS
          // =================================================

          const title =
            interaction.options.getString(
              'title'
            ) ||
            '🛒 ร้านขาย Key';

          const item =
            interaction.options.getString(
              'item',
              true
            ).trim();

          if (
            !item
          ) {

            return interaction.reply({

              content:
                '❌ กรุณาใส่ชื่อสินค้า',

              flags:
                MessageFlags.Ephemeral

            });

          }

          // =================================================
          // BUILD EMBED
          // =================================================

          const embed =
            buildShopEmbed(
              `${title} • ${item}`
            )

              .setFooter({

                text:
                  footerText()

              })

              .setTimestamp();

          const buttons =
            buildShopButtons();

          // =================================================
          // SEND PANEL
          // =================================================

          await interaction.reply({

            embeds: [
              embed
            ],

            components:
              buttons

          });

          // =================================================
          // GET SENT MESSAGE
          // =================================================

          const sent =
            await interaction.fetchReply();

          if (
            !sent
          ) {

            console.error(
              '❌ fetchReply() ไม่ได้ข้อความ Panel'
            );

            return;

          }

          // =================================================
          // SAVE PANEL
          // =================================================

          panels.push({

            guildId:
              interaction.guild.id,

            channelId:
              sent.channelId,

            messageId:
              sent.id

          });

          savePanels(
            panels
          );

          console.log(
            `✅ สร้าง Panel สำเร็จ: ${sent.id}`
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
                '❌ สำหรับ Administrator เท่านั้น',

              flags:
                MessageFlags.Ephemeral

            });

          }

          const category =
            interaction.options.getString(
              'ประเภท',
              true
            );

          const input =
            interaction.options.getString(
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

          saveKeys(
            keys
          );

          await refreshAllPanels();

          return interaction.reply({

            content:

              `✅ เพิ่ม Key สำเร็จ\n\n` +

              `📦 ประเภท: **${category}**\n` +

              `➕ เพิ่ม: **${newKeys.length} Key**\n` +

              `📊 คงเหลือ: **${keys[category].length} Key**`,

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
                '❌ สำหรับ Administrator เท่านั้น',

              flags:
                MessageFlags.Ephemeral

            });

          }

          const embed =
            new EmbedBuilder()

              .setTitle(
                '🔑 Key คงเหลือ'
              )

              .setColor(
                0x5865F2
              )

              .addFields(

                {

                  name:
                    '🎁 ฟรี 1 วัน',

                  value:
                    `${keys.free1.length} Key`,

                  inline:
                    true

                },

                {

                  name:
                    '🔵 2 วัน',

                  value:
                    `${keys.buy2.length} Key`,

                  inline:
                    true

                },

                {

                  name:
                    '🟣 3 วัน',

                  value:
                    `${keys.buy3.length} Key`,

                  inline:
                    true

                },

                {

                  name:
                    '🟡 7 วัน',

                  value:
                    `${keys.buy7.length} Key`,

                  inline:
                    true

                }

              )

              .setTimestamp();

          return interaction.reply({

            embeds: [
              embed
            ],

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
                '❌ สำหรับ Administrator เท่านั้น',

              flags:
                MessageFlags.Ephemeral

            });

          }

          const target =
            interaction.options.getString(
              'ประเภท',
              true
            );

          if (
            target === 'all'
          ) {

            keys = {

              free1: [],

              buy2: [],

              buy3: [],

              buy7: []

            };

          } else {

            keys[target] = [];

          }

          saveKeys(
            keys
          );

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
      // FREE BUTTON
      // =================================================

      if (

        interaction.isButton() &&

        interaction.customId ===
          'free_1'

      ) {

        await claimFree(
          interaction
        );

        return;

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

        if (
          !product
        ) {

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
              '❌ สินค้านี้หมดแล้ว',

            flags:
              MessageFlags.Ephemeral

          });

        }

        // =================================================
        // MODAL
        // =================================================

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

            .setRequired(
              true
            )

            .setMinLength(
              10
            )

            .setMaxLength(
              500
            );

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

        if (
          !product
        ) {

          return interaction.reply({

            content:
              '❌ ไม่พบสินค้า',

            flags:
              MessageFlags.Ephemeral

          });

        }

        const userId =
          interaction.user.id;

        if (
          buyingNow.has(
            userId
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
              '❌ Key สินค้านี้หมดแล้ว',

            flags:
              MessageFlags.Ephemeral

          });

        }

        const voucher =
          interaction.fields.getTextInputValue(
            'truemoney_link'
          ).trim();

        if (
          !voucher
        ) {

          return interaction.reply({

            content:
              '❌ ไม่พบลิงก์ซอง TrueMoney',

            flags:
              MessageFlags.Ephemeral

          });

        }

        buyingNow.add(
          userId
        );

        try {

          await interaction.reply({

            content:

              `⏳ กำลังตรวจสอบซองและรับเงิน ` +

              `**${product.price} บาท** ...`,

            flags:
              MessageFlags.Ephemeral

          });

          // =================================================
          // RECEIVE MONEY
          // =================================================

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

          // =================================================
          // CHECK KEY
          // =================================================

          if (
            !keys[productId] ||
            keys[productId].length === 0
          ) {

            await interaction.editReply({

              content:

                '⚠️ รับเงินสำเร็จ แต่ Key หมดพอดี\n' +

                'กรุณาติดต่อแอดมิน'

            });

            return;

          }

          // =================================================
          // TAKE KEY
          // =================================================

          const key =
            takeKey(
              productId
            );

          if (
            !key
          ) {

            await interaction.editReply({

              content:

                '⚠️ รับเงินสำเร็จ แต่ไม่สามารถดึง Key ได้\n' +

                'กรุณาติดต่อแอดมิน'

            });

            return;

          }

          // =================================================
          // SEND DM
          // =================================================

          try {

            await interaction.user.send({

              embeds: [

                new EmbedBuilder()

                  .setTitle(
                    '🎉 ซื้อ Key สำเร็จ'
                  )

                  .setDescription(

                    [

                      `📦 **สินค้า:** ${product.label}`,

                      `💰 **ราคา:** ${product.price} บาท`,

                      '',

                      '🔑 **Code ของคุณ:**',

                      '',

                      `\`${key}\``,

                      '',

                      'กรุณาเก็บ Code ไว้ให้ดี'

                    ].join('\n')

                  )

                  .setColor(
                    0x57F287
                  )

                  .setTimestamp()

              ]

            });

          } catch (dmError) {

            // คืน Key
            keys[productId].unshift(
              key
            );

            saveKeys(
              keys
            );

            await interaction.editReply({

              content:

                '⚠️ รับเงินสำเร็จแล้ว แต่ไม่สามารถส่ง DM ได้\n' +

                'กรุณาเปิดรับ DM แล้วติดต่อแอดมิน'

            });

            return;

          }

          // =================================================
          // SUCCESS
          // =================================================

          await interaction.editReply({

            content:

              `✅ ชำระเงินสำเร็จ **${product.price} บาท**\n\n` +

              `📦 ${product.label}\n` +

              `📩 Code ถูกส่งทาง DM แล้ว`

          });

          await refreshAllPanels();

          // =================================================
          // OWNER LOG
          // =================================================

          try {

            const owner =
              await client.users.fetch(
                config.ownerId
              );

            await owner.send({

              embeds: [

                new EmbedBuilder()

                  .setTitle(
                    '💰 มีการซื้อ Key'
                  )

                  .setDescription(

                    `👤 ลูกค้า: ${interaction.user.tag}\n` +

                    `🆔 ID: ${interaction.user.id}\n` +

                    `📦 สินค้า: ${product.label}\n` +

                    `💰 ราคา: ${product.price} บาท`

                  )

                  .setColor(
                    0x57F287
                  )

                  .setTimestamp()

              ]

            });

          } catch {}

        } finally {

          buyingNow.delete(
            userId
          );

        }

        return;

      }

    } catch (error) {

      console.error(
        '❌ Interaction Error:',
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

client.login(
  config.token
)

  .then(() => {

    console.log(
      '🔐 Login สำเร็จ'
    );

  })

  .catch(error => {

    console.error(
      '❌ Login ไม่สำเร็จ:',
      error.message
    );

    process.exit(1);

  });
