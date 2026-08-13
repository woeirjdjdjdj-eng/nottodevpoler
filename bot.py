import discord
from discord.ext import commands
from discord import app_commands
import os
import tempfile
import aiohttp
from deobfuscators.simple import simple_deobfuscate

TOKEN = os.getenv("DISCORD_TOKEN")

if not TOKEN:
    raise ValueError("ไม่พบ DISCORD_TOKEN กรุณาใส่ใน Variables ของ Railway")

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)

@bot.event
async def on_ready():
    print(f"บอทออนไลน์แล้ว → {bot.user}")
    try:
        synced = await bot.tree.sync()
        print(f"Sync คำสั่งสำเร็จ {len(synced)} คำสั่ง")
    except Exception as e:
        print("เกิดข้อผิดพลาดตอน sync:", e)

async def fetch_code_from_url(url: str) -> str:
    """ดาวน์โหลดโค้ดจากลิงก์"""
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as resp:
            if resp.status != 200:
                raise Exception(f"ไม่สามารถเข้าถึงลิงก์ได้ (สถานะ {resp.status})")
            return await resp.text()

@bot.tree.command(name="deobf", description="แกะโค้ดที่ถูก obfuscate")
@app_commands.describe(
    file="แนบไฟล์ .lua หรือ .txt",
    code="แปะโค้ดตรงนี้",
    url="ลิงก์โค้ด (เช่น raw.githubusercontent.com หรือ pastebin)"
)
async def deobf(
    interaction: discord.Interaction,
    file: discord.Attachment = None,
    code: str = None,
    url: str = None
):
    await interaction.response.defer(thinking=True)

    try:
        content = None
        source_name = "unknown"

        # 1. กรณีแนบไฟล์
        if file is not None:
            if not file.filename.lower().endswith((".lua", ".txt", ".luau")):
                return await interaction.followup.send("❌ รองรับเฉพาะไฟล์ `.lua` `.txt` `.luau` เท่านั้น")

            temp = tempfile.NamedTemporaryFile(delete=False, suffix=".lua")
            await file.save(temp.name)

            with open(temp.name, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()

            source_name = file.filename
            os.remove(temp.name)

        # 2. กรณีแปะโค้ด
        elif code is not None and code.strip() != "":
            content = code
            source_name = "pasted_code"

        # 3. กรณีใส่ลิงก์
        elif url is not None and url.strip() != "":
            if not url.startswith("http"):
                return await interaction.followup.send("❌ ลิงก์ต้องขึ้นต้นด้วย http หรือ https")

            content = await fetch_code_from_url(url.strip())
            source_name = url

        else:
            return await interaction.followup.send("❌ กรุณาเลือกอย่างใดอย่างหนึ่ง: แนบไฟล์ / แปะโค้ด / ใส่ลิงก์")

        # แกะโค้ด
        result = simple_deobfuscate(content)

        # สร้างไฟล์ผลลัพธ์
        output_name = "deobfuscated.txt"
        with open(output_name, "w", encoding="utf-8") as f:
            f.write("-- ผลลัพธ์จากการแกะ\n")
            f.write(f"-- แหล่งที่มา: {source_name}\n\n")
            f.write(result)

        await interaction.followup.send(
            content="✅ แกะเสร็จแล้ว",
            file=discord.File(output_name)
        )

        os.remove(output_name)

    except Exception as e:
        await interaction.followup.send(f"❌ เกิดข้อผิดพลาด: `{e}`")

bot.run(TOKEN)
