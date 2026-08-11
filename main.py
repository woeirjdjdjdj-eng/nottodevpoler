#!/usr/bin/env python3
"""
Discord Auto-Reply Bot
บอทตอบกลับอัตโนมัติ — ไม่ใช้ AI, ใช้คำสั่ง/คำหลักที่กำหนดเองจากไฟล์ responses.json

วิธีใช้:
1. ตั้งค่า DISCORD_TOKEN เป็น environment variable
2. แก้ไฟล์ responses.json เพื่อเพิ่ม/ลบคำสั่งตอบกลับ
3. รัน: python autoreply_bot.py

รูปแบบ responses.json:
{
    "สวัสดี": "สวัสดีครับ! 👋",
    "help": "พิมพ์ !commands เพื่อดูคำสั่งทั้งหมด",
    "bye": ["บ๊ายบาย!", "แล้วเจอกันใหม่นะ", "ไปดีมาดี"]
}

- key คือคำที่จะจับ (ไม่สนตัวพิมพ์เล็ก/ใหญ่ ค้นหาแบบ "มีคำนี้อยู่ในข้อความ")
- value เป็น string เดียว หรือ list ของ string (บอทจะสุ่มเลือกหนึ่งอัน)
"""

import os
import json
import random
import logging

import discord
from discord.ext import commands

# ── Logging ──────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── Config ───────────────────────────────────────────────────────────────

RESPONSES_FILE = "responses.json"
COOLDOWN_SECONDS = 3  # กันสแปม: แต่ละคนต้องรอกี่วินาทีก่อนบอทจะตอบอีกครั้ง

DEFAULT_RESPONSES = {
    "สวัสดี": ["สวัสดีครับ! 👋", "หวัดดีครับ 😄"],
    "hello": "Hello there! 👋",
    "help": "พิมพ์ `!commands` เพื่อดูคำสั่งตอบกลับทั้งหมดที่บอทรู้จักครับ",
}


def load_responses() -> dict:
    """โหลดคำสั่งตอบกลับจากไฟล์ JSON (สร้างไฟล์ default ถ้ายังไม่มี)"""
    if not os.path.exists(RESPONSES_FILE):
        with open(RESPONSES_FILE, "w", encoding="utf-8") as f:
            json.dump(DEFAULT_RESPONSES, f, ensure_ascii=False, indent=2)
        logger.info(f"สร้างไฟล์ {RESPONSES_FILE} เริ่มต้นให้แล้ว")
        return DEFAULT_RESPONSES

    with open(RESPONSES_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


# ── Bot ──────────────────────────────────────────────────────────────────

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)

responses: dict = load_responses()
last_reply_time: dict[int, float] = {}  # user_id -> timestamp กันสแปม


def find_response(content: str) -> str | None:
    """หาว่าข้อความมีคำหลักที่ตรงกับ responses.json ไหม (ตรงตัวแรกที่เจอ)"""
    lowered = content.lower()
    for keyword, reply in responses.items():
        if keyword.lower() in lowered:
            if isinstance(reply, list):
                return random.choice(reply)
            return reply
    return None


# ── Events ───────────────────────────────────────────────────────────────


@bot.event
async def on_ready():
    logger.info(f"✅ Bot online: {bot.user} (ID: {bot.user.id})")
    logger.info(f"📋 โหลดคำสั่งตอบกลับ {len(responses)} รายการ")


@bot.event
async def on_message(message: discord.Message):
    # เมิน message จากบอทเอง (รวมบอทตัวอื่นด้วย กันบอทคุยกันเองไม่หยุด)
    if message.author.bot:
        return

    reply = find_response(message.content)
    if reply:
        import time
        now = time.time()
        uid = message.author.id
        # กันสแปม: ถ้าคนนี้เพิ่งได้รับคำตอบไปเมื่อกี้ ให้ข้าม
        if now - last_reply_time.get(uid, 0) >= COOLDOWN_SECONDS:
            last_reply_time[uid] = now
            await message.channel.send(reply, reference=message)

    # ให้คำสั่งที่ขึ้นต้นด้วย ! ยังทำงานได้ปกติ
    await bot.process_commands(message)


# ── Commands ─────────────────────────────────────────────────────────────


@bot.command(name="commands")
async def list_commands(ctx: commands.Context):
    """แสดงคำหลักที่บอทตอบกลับได้ทั้งหมด"""
    if not responses:
        await ctx.send("ยังไม่มีคำสั่งตอบกลับที่ตั้งไว้ครับ")
        return

    keywords = ", ".join(f"`{k}`" for k in responses.keys())
    embed = discord.Embed(
        title="📋 คำหลักที่บอทตอบกลับได้",
        description=keywords,
        color=discord.Color.blue(),
    )
    embed.set_footer(text=f"ทั้งหมด {len(responses)} คำ — แก้ไขได้ที่ responses.json")
    await ctx.send(embed=embed)


@bot.command(name="reload")
@commands.has_permissions(administrator=True)
async def reload_responses(ctx: commands.Context):
    """โหลด responses.json ใหม่ (ใช้หลังแก้ไฟล์) — เฉพาะแอดมิน"""
    global responses
    responses = load_responses()
    await ctx.send(f"🔄 โหลดคำสั่งตอบกลับใหม่แล้ว ({len(responses)} รายการ)")


@bot.command(name="addreply")
@commands.has_permissions(administrator=True)
async def add_reply(ctx: commands.Context, keyword: str, *, reply_text: str):
    """เพิ่มคำสั่งตอบกลับใหม่ — เฉพาะแอดมิน
    ตัวอย่าง: !addreply สวัสดี สวัสดีครับ ยินดีต้อนรับ!
    """
    global responses
    responses[keyword] = reply_text
    with open(RESPONSES_FILE, "w", encoding="utf-8") as f:
        json.dump(responses, f, ensure_ascii=False, indent=2)
    await ctx.send(f"✅ เพิ่มคำสั่งตอบกลับ: `{keyword}` → {reply_text}")


@bot.command(name="delreply")
@commands.has_permissions(administrator=True)
async def del_reply(ctx: commands.Context, keyword: str):
    """ลบคำสั่งตอบกลับ — เฉพาะแอดมิน"""
    global responses
    if keyword in responses:
        del responses[keyword]
        with open(RESPONSES_FILE, "w", encoding="utf-8") as f:
            json.dump(responses, f, ensure_ascii=False, indent=2)
        await ctx.send(f"🗑️ ลบคำสั่งตอบกลับ `{keyword}` แล้ว")
    else:
        await ctx.send(f"❌ ไม่พบคำสั่งตอบกลับ `{keyword}`")


# ── Entry Point ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    token = os.getenv("DISCORD_TOKEN", "").strip()

    if not token:
        print("❌ DISCORD_TOKEN not found!")
        print("   → ตั้งค่า environment variable ชื่อ DISCORD_TOKEN ก่อนรันบอท")
        exit(1)

    logger.info("🚀 Starting Auto-Reply Bot...")
    bot.run(token)
