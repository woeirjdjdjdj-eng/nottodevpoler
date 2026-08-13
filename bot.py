import discord
from discord.ext import commands
from discord import app_commands
import os
import tempfile
from deobfuscators.simple import simple_deobfuscate

# ==================== ใส่ Token ตรงนี้ ====================
TOKEN = "MTUzMzg1Nzc2MjA4ODU4MzE2OQ.GvEBD_.dEyTtgSHU9cvJJGB5dSLP0uwr4iS4uyb4gKKhg"

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

@bot.tree.command(name="deobf", description="แกะโค้ดที่ถูก obfuscate")
@app_commands.describe(file="ไฟล์ .lua หรือ .txt ที่ต้องการแกะ")
async def deobf(interaction: discord.Interaction, file: discord.Attachment):
    await interaction.response.defer(thinking=True)

    try:
        if not file.filename.lower().endswith((".lua", ".txt", ".luau")):
            return await interaction.followup.send("รองรับเฉพาะไฟล์ .lua .txt .luau เท่านั้น")

        # ดาวน์โหลดไฟล์
        temp = tempfile.NamedTemporaryFile(delete=False, suffix=".lua")
        await file.save(temp.name)

        with open(temp.name, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()

        # แกะ
        result = simple_deobfuscate(content)

        # สร้างไฟล์ผลลัพธ์
        output_name = "deobfuscated.txt"
        with open(output_name, "w", encoding="utf-8") as f:
            f.write("-- ผลลัพธ์จากการแกะ\n\n")
            f.write(result)

        await interaction.followup.send(
            content="แกะเสร็จแล้ว",
            file=discord.File(output_name)
        )

        os.remove(temp.name)
        os.remove(output_name)

    except Exception as e:
        await interaction.followup.send(f"เกิดข้อผิดพลาด: {e}")

bot.run(TOKEN)
