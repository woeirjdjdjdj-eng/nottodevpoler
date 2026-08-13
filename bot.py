import discord
from discord.ext import commands
from discord import app_commands
import os
import tempfile
import aiohttp
from deobfuscators.engine import run_engine

TOKEN = os.getenv("DISCORD_TOKEN")
if not TOKEN:
    raise ValueError("ไม่พบ DISCORD_TOKEN")

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)

@bot.event
async def on_ready():
    print(f"บอทออนไลน์แล้ว → {bot.user}")
    try:
        synced = await bot.tree.sync()
        print(f"Sync สำเร็จ {len(synced)} คำสั่ง")
    except Exception as e:
        print(e)

async def fetch_url(url: str) -> str:
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    async with aiohttp.ClientSession(headers=headers) as session:
        async with session.get(url, timeout=20) as resp:
            if resp.status != 200:
                raise Exception(f"เข้าลิงก์ไม่ได้ ({resp.status})")
            return await resp.text()

@bot.tree.command(name="deobf", description="แกะโค้ด obfuscate (Multi Engine)")
@app_commands.describe(
    file="แนบไฟล์",
    code="แปะโค้ด",
    url="ลิงก์"
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
        source = "unknown"

        if file:
            temp = tempfile.NamedTemporaryFile(delete=False, suffix=".lua")
            await file.save(temp.name)
            with open(temp.name, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
            source = file.filename
            os.remove(temp.name)

        elif code and code.strip():
            content = code
            source = "pasted_code"

        elif url and url.strip():
            if not url.startswith("http"):
                return await interaction.followup.send("ลิงก์ต้องขึ้นต้นด้วย http")
            content = await fetch_url(url.strip())
            source = url

        else:
            return await interaction.followup.send("กรุณาใส่ไฟล์ / โค้ด / ลิงก์")

        result, percent, obfuscator = run_engine(content)

        output = "deobfuscated.txt"
        with open(output, "w", encoding="utf-8") as f:
            f.write(f"แหล่งที่มา: {source}\n")
            f.write(result)

        await interaction.followup.send(
            content=f"**Multi Engine Result**\nชนิด: `{obfuscator}`\nความสำเร็จ: **{percent}%**",
            file=discord.File(output)
        )
        os.remove(output)

    except Exception as e:
        await interaction.followup.send(f"เกิดข้อผิดพลาด: `{e}`")

bot.run(TOKEN)
