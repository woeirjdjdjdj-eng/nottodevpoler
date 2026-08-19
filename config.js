module.exports = {
  // === DISCORD CONFIG ===
  ownerId: "1425184210976505898",   // ← ใส่ Discord User ID ของคุณที่นี่

  // === KEY CONFIG ===
  keys: {
    day1: [],   // 1 วัน
    day2: [],   // 2 วัน
    day3: []    // 3 วัน
  },

  // === โอกาสสุ่ม (ปรับได้ตามที่คุณต้องการ) ===
  chances: {
    day1: 0.45,   // 45%
    day2: 0.20,   // 20%
    day3: 0.10    // 10%
  },

  // === คำแนะนำการเพิ่มคีย์ (DM เฉพาะเจ้าของ) ===
  addKeyInstructions: `
  ใช้ใน DM กับบอทเท่านั้น:

  ชื้อ1: KEY1
  KEY2
  KEY3

  หรือคั่นด้วย comma:
  ชื้อ2: KEY-001,KEY-002,KEY-003
  `,

  // === คำสั่งอื่น ๆ (ถ้าต้องการเพิ่มเติม) ===
  commands: {
    defaultTitle: "🎡 ร้าน / สุ่มรางวัล",
    defaultItem: "รางวัลพิเศษ"
  }
};
