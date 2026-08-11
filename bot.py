import discord
from discord.ext import commands
import os

TOKEN = os.getenv("MTUzMzg1Nzc2MjA4ODU4MzE2OQ.GYpjY5.8k1JpNQvM7v1xcpC1-SG-2VBXYjymv3FxE4SnI")

intents = discord.Intents.default()
intents.message_content = True

bot = commands.Bot(command_prefix="!", intents=intents)

@bot.event
async def on_ready():
    print(f"บอทออนไลน์แล้ว: {bot.user}")

@bot.event
async def on_message(message):
    if message.author == bot.user:
        return

    if message.content.lower() == "สวัสดี":
        await message.channel.send("สวัสดีครับ! บอทรันจาก GitHub Actions")

    await bot.process_commands(message)

bot.run(TOKEN)
