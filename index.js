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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ],
  partials: [Partials.Channel]
});

// =========================
// ตั้งค่าร้านค้า
// =========================

const PRODUCTS = {
  day2: {
    days: 2,
    price: 10,
    label: '2 วัน',
    emoji: '🟢'
  },

  day3: {
    days: 3,
    price: 15,
    label: '3 วัน',
    emoji: '🔵'
  },

  day7: {
    days: 7,
    price: 35,
    label: '7 วัน',
    emoji: '🟣'
  }
};

// =========================
// Data
// =========================

const DATA_DIR = path.join(__dirname, 'data');
const KEYS_FILE = path.join(DATA_DIR, 'keys.json');
const PANELS_FILE = path.join(DATA_DIR, 'panels.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// =========================
// Keys
// =========================

function loadKeys() {
  try {
    if (fs.existsSync(KEYS_FILE)) {
      const data = JSON.parse(
        fs.readFileSync(KEYS_FILE, 'utf8')
      );

      return {
        day2: Array.isArray(data.day2) ? data.day2 : [],
        day3: Array.isArray(data.day3) ? data.day3 : [],
        day7: Array.isArray(data.day7) ? data.day7 : []
      };
    }
  } catch (error) {
    console.error('โหลด keys.json ไม่สำเร็จ:', error);
  }

  return {
    day2: [],
    day3: [],
    day7: []
  };
}

function saveKeys(keys) {
  fs.writeFileSync(
    KEYS_FILE,
    JSON.stringify(keys, null, 2),
    'utf8'
  );
}

let keys = loadKeys();

// =========================
// Panels
// =========================

function loadPanels() {
  try {
    if (fs.existsSync(PANELS_FILE)) {
      const data = JSON.parse(
        fs.readFileSync(PANELS_FILE, 'utf8')
      );

      return Array.isArray(data) ? data : [];
    }
  } catch (error) {
    console.error('โหลด panels.json ไม่สำเร็จ:', error);
  }

  return [];
}

function savePanels(panels) {
  fs.writeFileSync(
    PANELS_FILE,
    JSON.stringify(panels, null, 2),
    'utf8'
  );
}

let panels = loadPanels();

// =========================
// ตรวจ environment
// =========================

if (!process.env.TOKEN) {
  console.error('❌ ไม่พบ TOKEN ใน .env');
  process.exit(1);
}

if (!process.env.CLIENT_ID) {
  console.error('❌ ไม่พบ CLIENT_ID ใน .env');
  process.exit(1);
}

if (!process.env.TRUEMONEY_PHONE) {
  console.error('❌ ไม่พบ TRUEMONEY_PHONE ใน .env');
  process.exit(1);
}

// =========================
// TrueMoney
// =========================

async function receiveTrueMoney(link) {
  try {
    let value = String(link).trim();

    // รองรับทั้ง
    // https://gift.truemoney.com/campaign/?v=XXXX
    // และ XXXX
    if (value.includes('?v=')) {
      value = value.split('?v=')[1];
    }

    value = value.split('&')[0].trim();

    if (!value) {
      return {
        success: false,
        message: 'ไม่พบรหัสซอง'
      };
    }

    const encodedLink = encodeURIComponent(value);
    const phone = encodeURIComponent(process.env.TRUEMONEY_PHONE);

    const apiUrl =
      `https://api.xpluem.com/${encodedLink}/${phone}`;

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    let result;

    try {
      result = await response.json();
    } catch {
      return {
        success: false,
        message: 'API ตอบกลับไม่ใช่ JSON'
      };
    }

    if (!result || result.success !== true) {
      return {
        success: false,
        message: result?.message || 'รับเงินไม่สำเร็จ'
      };
    }

    const amount = Number(
      result?.data?.amount
    );

    if (!Number.isFinite(amount)) {
      return {
        success: false,
        message: 'ไม่สามารถอ่านจำนวนเงินจาก API ได้'
      };
    }

    return {
      success: true,
      amount,
      name: result?.data?.name || 'ไม่ทราบชื่อ'
    };

  } catch (error) {
    console.error('TrueMoney API Error:', error);

    return {
      success: false,
      message: 'เชื่อมต่อระบบรับเงินไม่สำเร็จ'
    };
  }
}

// =========================
// สร้างหน้าร้าน
// =========================

function buildShopEmbed() {
  return new EmbedBuilder()
    .setTitle('🛒 ร้านขาย Key')
    .setDescription(
      [
        'เลือกแพ็กเกจที่ต้องการซื้อด้านล่าง',
        '',
        '🟢 **2 วัน — 10 บาท**',
        '🔵 **3 วัน — 15 บาท**',
        '🟣 **7 วัน — 35 บาท**',
        '',
        'เมื่อกดซื้อ ระบบจะให้ใส่ลิงก์ซอง TrueMoney',
        'หลังชำระเงินสำเร็จ Key จะถูกส่งไปทาง DM'
      ].join('\n')
    )
    .setColor(0x5865F2)
    .setFooter({
      text: 'กรุณาเปิดรับ DM จากสมาชิกเซิร์ฟเวอร์'
    });
}

function buildShopButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('buy_day2')
        .setLabel('2 วัน • 10 บาท')
        .setEmoji('🟢')
        .setStyle(ButtonStyle.Success)
        .setDisabled(keys.day2.length === 0),

      new ButtonBuilder()
        .setCustomId('buy_day3')
        .setLabel('3 วัน • 15 บาท')
        .setEmoji('🔵')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(keys.day3.length === 0),

      new ButtonBuilder()
        .setCustomId('buy_day7')
        .setLabel('7 วัน • 35 บาท')
        .setEmoji('🟣')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(keys.day7.length === 0)
    )
  ];
}

// =========================
// Refresh Panel
// =========================

async function refreshPanels() {
  for (const panel of panels) {
    try {
      const channel = await client.channels.fetch(
        panel.channelId
      );

      if (!channel) continue;

      const message = await channel.messages.fetch(
        panel.messageId
      );

      await message.edit({
        embeds: [buildShopEmbed()],
        components: buildShopButtons()
      });

    } catch (error) {
      console.log(
        `ไม่สามารถอัปเดต Panel ${panel.messageId}`
      );
    }
  }
}

// =========================
// Slash Commands
// =========================

async function deployCommands() {
  const commands = [

    new SlashCommandBuilder()
      .setName('เลือกห้อง')
      .setDescription('สร้างหน้าร้านขาย Key')
      .addStringOption(option =>
        option
          .setName('รายการ1')
          .setDescription('ชื่อรายการ / ชื่อร้าน')
          .setRequired(true)
          .setMaxLength(80)
      )
      .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator
      )
      .toJSON(),

    new SlashCommandBuilder()
      .setName('เพิ่มคีย์')
      .setDescription('เพิ่ม Key เข้าสต็อก')
      .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator
      )
      .addStringOption(option =>
        option
          .setName('ประเภท')
          .setDescription('เลือกแพ็กเกจ')
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
      .addStringOption(option =>
        option
          .setName('keys')
          .setDescription(
            'ใส่ Key คั่นด้วย , หรือขึ้นบรรทัดใหม่'
          )
          .setRequired(true)
      )
      .toJSON(),

    new SlashCommandBuilder()
      .setName('ดูคีย์')
      .setDescription('ดูจำนวน Key ในสต็อก')
      .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator
      )
      .toJSON(),

    new SlashCommandBuilder()
      .setName('ล้างคีย์')
      .setDescription('ล้าง Key ในสต็อก')
      .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator
      )
      .addStringOption(option =>
        option
          .setName('ประเภท')
          .setDescription('เลือกประเภท')
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
            },
            {
              name: 'ทั้งหมด',
              value: 'all'
            }
          )
      )
      .toJSON()
  ];

  const rest = new REST({
    version: '10'
  }).setToken(process.env.TOKEN);

  try {
    if (process.env.GUILD_ID) {

      await rest.put(
        Routes.applicationGuildCommands(
          process.env.CLIENT_ID,
          process.env.GUILD_ID
        ),
        {
          body: commands
        }
      );

      console.log(
        '✅ ลงทะเบียน Slash Commands สำเร็จ'
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

      console.log(
        '✅ ลงทะเบียน Global Commands สำเร็จ'
      );
    }

  } catch (error) {
    console.error(
      '❌ ลงทะเบียน Commands ไม่สำเร็จ:',
      error
    );
  }
}

// =========================
// Slash Command Interaction
// =========================

client.on(
  Events.InteractionCreate,
  async interaction => {

    try {

      // =====================
      // Slash Commands
      // =====================

      if (interaction.isChatInputCommand()) {

        // /เลือกห้อง
        if (interaction.commandName === 'เลือกห้อง') {

          const itemName =
            interaction.options.getString('รายการ1');

          const message = await interaction.channel.send({
            embeds: [
              buildShopEmbed().setTitle(
                `🛒 ${itemName}`
              )
            ],
            components: buildShopButtons()
          });

          panels.push({
            channelId: interaction.channel.id,
            messageId: message.id
          });

          savePanels(panels);

          await interaction.reply({
            content: '✅ สร้างหน้าร้านเรียบร้อยแล้ว',
            flags: MessageFlags.Ephemeral
          });

          return;
        }

        // /เพิ่มคีย์
        if (interaction.commandName === 'เพิ่มคีย์') {

          const type =
            interaction.options.getString('ประเภท');

          const input =
            interaction.options.getString('keys');

          const newKeys = input
            .split(/[\n,]+/)
            .map(key => key.trim())
            .filter(Boolean);

          if (newKeys.length === 0) {
            await interaction.reply({
              content: '❌ ไม่พบ Key',
              flags: MessageFlags.Ephemeral
            });
            return;
          }

          keys[type].push(...newKeys);

          saveKeys(keys);

          await interaction.reply({
            content:
              `✅ เพิ่ม Key สำเร็จ **${newKeys.length}** รายการ\n` +
              `ประเภท: **${PRODUCTS[type].label}**\n` +
              `คงเหลือ: **${keys[type].length}**`,
            flags: MessageFlags.Ephemeral
          });

          await refreshPanels();

          return;
        }

        // /ดูคีย์
        if (interaction.commandName === 'ดูคีย์') {

          await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setTitle('📦 สต็อก Key')
                .setDescription(
                  [
                    `🟢 2 วัน: **${keys.day2.length}**`,
                    `🔵 3 วัน: **${keys.day3.length}**`,
                    `🟣 7 วัน: **${keys.day7.length}**`
                  ].join('\n')
                )
                .setColor(0x57F287)
            ],
            flags: MessageFlags.Ephemeral
          });

          return;
        }

        // /ล้างคีย์
        if (interaction.commandName === 'ล้างคีย์') {

          const type =
            interaction.options.getString('ประเภท');

          if (type === 'all') {
            keys.day2 = [];
            keys.day3 = [];
            keys.day7 = [];
          } else {
            keys[type] = [];
          }

          saveKeys(keys);

          await interaction.reply({
            content: '🗑️ ล้าง Key เรียบร้อยแล้ว',
            flags: MessageFlags.Ephemeral
          });

          await refreshPanels();

          return;
        }
      }

      // =====================
      // ปุ่มซื้อ
      // =====================

      if (interaction.isButton()) {

        if (!interaction.customId.startsWith('buy_')) {
          return;
        }

        const productId =
          interaction.customId.replace('buy_', '');

        const product = PRODUCTS[productId];

        if (!product) {
          await interaction.reply({
            content: '❌ ไม่พบสินค้านี้',
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        if (!keys[productId] || keys[productId].length === 0) {
          await interaction.reply({
            content:
              `❌ Key ${product.label} หมดแล้ว`,
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        const modal =
          new ModalBuilder()
            .setCustomId(
              `payment_${productId}`
            )
            .setTitle(
              `ซื้อ Key ${product.label} • ${product.price} บาท`
            );

        const linkInput =
          new TextInputBuilder()
            .setCustomId('truemoney_link')
            .setLabel('ลิงก์ซอง TrueMoney')
            .setPlaceholder(
              'https://gift.truemoney.com/campaign/?v=...'
            )
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(10)
            .setMaxLength(500);

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            linkInput
          )
        );

        await interaction.showModal(modal);

        return;
      }

      // =====================
      // Modal ชำระเงิน
      // =====================

      if (interaction.isModalSubmit()) {

        if (
          !interaction.customId.startsWith(
            'payment_'
          )
        ) {
          return;
        }

        const productId =
          interaction.customId.replace(
            'payment_',
            ''
          );

        const product =
          PRODUCTS[productId];

        if (!product) {
          await interaction.reply({
            content: '❌ ไม่พบสินค้า',
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        const link =
          interaction.fields.getTextInputValue(
            'truemoney_link'
          ).trim();

        if (!keys[productId] ||
            keys[productId].length === 0) {

          await interaction.reply({
            content:
              '❌ สินค้าหมดแล้ว กรุณาติดต่อแอดมิน',
            flags: MessageFlags.Ephemeral
          });

          return;
        }

        await interaction.reply({
          content:
            `⏳ กำลังตรวจสอบการชำระเงิน **${product.price} บาท** ...`,
          flags: MessageFlags.Ephemeral
        });

        // รับเงิน
        const payment =
          await receiveTrueMoney(link);

        if (!payment.success) {

          await interaction.editReply({
            content:
              `❌ ชำระเงินไม่สำเร็จ\n\n` +
              `เหตุผล: ${payment.message}`
          });

          return;
        }

        // =====================
        // ตรวจยอด
        // =====================

        const paidAmount =
          Math.round(
            Number(payment.amount) * 100
          ) / 100;

        if (paidAmount !== product.price) {

          await interaction.editReply({
            content:
              `❌ จำนวนเงินไม่ตรงกับสินค้า\n\n` +
              `สินค้า: **${product.price.toFixed(2)} บาท**\n` +
              `ได้รับ: **${paidAmount.toFixed(2)} บาท**\n\n` +
              `ระบบไม่แจก Key เนื่องจากยอดไม่ตรง`
          });

          return;
        }

        // =====================
        // ตัด Key
        // =====================

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
          keys[productId].shift();

        saveKeys(keys);

        // =====================
        // ส่ง DM
        // =====================

        let dmSuccess = true;

        try {

          await interaction.user.send({
            embeds: [
              new EmbedBuilder()
                .setTitle('🎉 ซื้อ Key สำเร็จ')
                .setDescription(
                  [
                    `แพ็กเกจ: **${product.label}**`,
                    `ราคา: **${product.price} บาท**`,
                    '',
                    '🔑 **Key ของคุณ**',
                    '```',
                    key,
                    '```',
                    '',
                    'กรุณาเก็บ Key ไว้ให้ดี'
                  ].join('\n')
                )
                .setColor(0x57F287)
                .setTimestamp()
            ]
          });

        } catch (error) {

          dmSuccess = false;

          // ถ้าส่ง DM ไม่ได้
          // คืน Key กลับเข้าสต็อก
          keys[productId].unshift(key);
          saveKeys(keys);
        }

        if (!dmSuccess) {

          await interaction.editReply({
            content:
              '⚠️ ตรวจสอบเงินสำเร็จแล้ว แต่ส่ง DM ไม่ได้\n\n' +
              'กรุณาเปิดรับ DM จากสมาชิกเซิร์ฟเวอร์ แล้วติดต่อแอดมิน'
          });

          await refreshPanels();

          return;
        }

        // =====================
        // สำเร็จ
        // =====================

        await interaction.editReply({
          content:
            `✅ ชำระเงินสำเร็จ **${product.price} บาท**\n` +
            `📦 สินค้า: **${product.label}**\n\n` +
            `📩 Key ถูกส่งไปทาง DM แล้ว`
        });

        await refreshPanels();

        return;
      }

    } catch (error) {

      console.error(
        'Interaction Error:',
        error
      );

      try {

        if (interaction.replied ||
            interaction.deferred) {

          await interaction.editReply({
            content:
              '❌ เกิดข้อผิดพลาดในระบบ'
          });

        } else {

          await interaction.reply({
            content:
              '❌ เกิดข้อผิดพลาดในระบบ',
            flags: MessageFlags.Ephemeral
          });

        }

      } catch {}
    }
  }
);

// =========================
// Ready
// =========================

client.once(
  Events.ClientReady,
  async clientUser => {

    console.log(
      `✅ ออนไลน์: ${clientUser.user.tag}`
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
  }
);

// =========================
// Login
// =========================

client.login(process.env.TOKEN);
