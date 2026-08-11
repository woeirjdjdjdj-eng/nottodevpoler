#!/usr/bin/env python3
"""
Luarmor Deobfuscator Discord Bot
Usage: python main.py
"""

import os
import re
import base64
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

import discord
from discord import app_commands
from discord.ext import commands
from dotenv import load_dotenv

# ── Config ──────────────────────────────────────────────────────────────

load_dotenv()

DISCORD_TOKEN = os.getenv("DISCORD_TOKEN", "")
MAX_CODE_LENGTH = 500_000
MAX_FILE_SIZE = 5_000_000

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── Deobfuscation Engine ────────────────────────────────────────────────


@dataclass
class DeobStats:
    strings_decrypted: int = 0
    dead_code_removed: int = 0
    variables_renamed: int = 0
    numbers_decoded: int = 0
    control_flow_simplified: int = 0
    cleanups: int = 0


class DeobEngine:
    """Simple multi-pass Lua deobfuscator."""

    def __init__(self) -> None:
        self.stats = DeobStats()

    def _decrypt_xor_strings(self, code: str) -> str:
        """Decrypt string.char(bit.bxor(string.byte(s, off), key))."""
        pattern = re.compile(
            r'string\.char\s*\(\s*bit\.bxor\s*\(\s*string\.byte\s*\(\s*'
            r'["\'](.+?)["\']\s*,\s*\d+\s*\)\s*,\s*(\d+)\s*\)\s*\)',
            re.IGNORECASE,
        )
        for match in pattern.finditer(code):
            try:
                chars, key = match.group(1), int(match.group(2))
                decoded = "".join(chr(ord(c) ^ key) for c in chars)
                code = code.replace(match.group(0), f'"{decoded}"', 1)
                self.stats.strings_decrypted += 1
            except (ValueError, IndexError):
                pass
        return code

    def _decrypt_byte_arrays(self, code: str) -> str:
        """Decrypt string.char(XX, YY, ZZ, ...)."""
        pattern = re.compile(r'string\.char\s*\(\s*([\d,\s]+)\s*\)')
        for match in pattern.finditer(code):
            try:
                nums = [int(x.strip()) for x in match.group(1).split(",") if x.strip()]
                if all(0 <= n < 256 for n in nums) and len(nums) > 1:
                    decoded = "".join(chr(n) for n in nums)
                    if decoded.isprintable() and len(decoded) > 1:
                        code = code.replace(match.group(0), f'"{decoded}"', 1)
                        self.stats.strings_decrypted += 1
            except (ValueError, IndexError):
                pass
        return code

    def _decrypt_base64(self, code: str) -> str:
        """Decrypt base64 strings."""
        pattern = re.compile(r'["\']([A-Za-z0-9+/=]{20,})["\']')
        for match in pattern.finditer(code):
            try:
                decoded = base64.b64decode(match.group(1)).decode("utf-8", errors="ignore")
                if decoded.isprintable() and len(decoded) > 3:
                    code = code.replace(match.group(0), f'"{decoded}"', 1)
                    self.stats.strings_decrypted += 1
            except Exception:
                pass
        return code

    def _remove_dead_code(self, code: str) -> str:
        """Remove while false / if false blocks."""
        for pattern in [
            r'while\s+(false|nil|0)\s+do\s*?.*?end',
            r'if\s+(false|nil)\s+then\s*?.*?end',
        ]:
            new_code = re.sub(pattern, "", code, flags=re.DOTALL | re.IGNORECASE)
            if new_code != code:
                self.stats.dead_code_removed += 1
                code = new_code
        return code

    def _rename_variables(self, code: str) -> str:
        """Rename _0xABC123 → var_N / fn_N."""
        rename_map: dict[str, str] = {}
        counters = {"func": 0, "var": 0}

        for match in re.finditer(r'_0x[a-fA-F0-9]{3,}', code):
            name = match.group(0)
            if name not in rename_map:
                # Check if it's called as function
                if re.search(rf'{re.escape(name)}\s*\(', code):
                    counters["func"] += 1
                    rename_map[name] = f"fn_{counters['func']}"
                else:
                    counters["var"] += 1
                    rename_map[name] = f"var_{counters['var']}"
                self.stats.variables_renamed += 1

        for old, new in sorted(rename_map.items(), key=lambda x: len(x[0]), reverse=True):
            code = code.replace(old, new)
        return code

    def _decode_numbers(self, code: str) -> str:
        """Decode ~-NNN → -NNN."""
        for match in re.finditer(r'~-(\d+)', code):
            code = code.replace(match.group(0), str(-int(match.group(1))), 1)
            self.stats.numbers_decoded += 1
        return code

    def _unwrap_loadstring(self, code: str) -> str:
        """Unwrap loadstring(loadstring("..."))."""
        for _ in range(5):
            match = re.search(
                r'loadstring\s*\(\s*loadstring\s*\(\s*["\'](.+?)["\']\s*\)\s*\)',
                code,
                re.DOTALL,
            )
            if match:
                code = code.replace(match.group(0), f'loadstring("{match.group(1)}")', 1)
                self.stats.cleanups += 1
            else:
                break
        return code

    def _cleanup(self, code: str) -> str:
        """General cleanup."""
        code = re.sub(r'\n{3,}', "\n\n", code)
        code = re.sub(r'[ \t]+', " ", code)
        return code.strip()

    def _detect_signatures(self, code: str) -> list[str]:
        """Detect obfuscation signatures."""
        sigs = []
        checks = {
            "XOR strings": r'string\.char.*bit\.bxor',
            "Byte arrays": r'string\.char\s*\(\s*[\d,]+',
            "Base64": r'["\'][A-Za-z0-9+/=]{30,}["\']',
            "Dead code": r'while\s+(false|nil)\s+do',
            "Obf vars": r'_0x[a-fA-F0-9]{3,}',
            "Encoded nums": r'~-\d+',
            "loadstring": r'loadstring\s*\(',
        }
        for name, pat in checks.items():
            if re.search(pat, code, re.IGNORECASE):
                sigs.append(name)
        return sigs

    def _calc_percentage(self, original: str, result: str) -> float:
        """Calculate deob effectiveness."""
        if not original.strip():
            return 0.0

        score = 0.0
        # Size reduction
        orig_len = len(original.strip())
        new_len = len(result.strip())
        if orig_len > 0:
            score += min(((orig_len - new_len) / orig_len) * 100, 30)

        # Pattern-based scoring
        score += min(self.stats.strings_decrypted * 5, 25)
        score += min(self.stats.dead_code_removed * 4, 15)
        score += min(self.stats.variables_renamed * 2, 15)
        score += min(self.stats.numbers_decoded * 3, 10)

        return round(min(score, 100.0), 1)

    def run(self, code: str) -> tuple[str, float, dict, list[str]]:
        """Run all deob passes. Returns (output, percentage, stats_dict, signatures)."""
        original = code

        # Run passes
        code = self._decrypt_xor_strings(code)
        code = self._decrypt_byte_arrays(code)
        code = self._decrypt_base64(code)
        code = self._remove_dead_code(code)
        code = self._rename_variables(code)
        code = self._decode_numbers(code)
        code = self._unwrap_loadstring(code)
        code = self._cleanup(code)

        percentage = self._calc_percentage(original, code)

        stats_dict = {
            "strings_decrypted": self.stats.strings_decrypted,
            "dead_code_removed": self.stats.dead_code_removed,
            "variables_renamed": self.stats.variables_renamed,
            "numbers_decoded": self.stats.numbers_decoded,
            "control_flow_simplified": self.stats.control_flow_simplified,
            "cleanups": self.stats.cleanups,
        }

        signatures = self._detect_signatures(original)

        # Build header
        header = (
            f"-- ============================================\n"
            f"-- Deobfuscated Output\n"
            f"-- Effectiveness: {percentage}%\n"
            f"-- Signatures: {', '.join(signatures) if signatures else 'Generic Lua'}\n"
            f"-- Stats: {stats_dict}\n"
            f"-- ============================================\n\n"
        )

        return header + code, percentage, stats_dict, signatures


# ── Bot Setup ───────────────────────────────────────────────────────────

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)

engine = DeobEngine()
last_results: dict[int, tuple[str, float, dict, list[str]]] = {}


# ── Commands ────────────────────────────────────────────────────────────

@bot.tree.command(name="deob", description="แกะโค้ด Lua (Luarmor)")
@app_commands.describe(
    code="แปะโค้ด Lua ที่ obfuscate มา",
    file="หรือแนบไฟล์ .lua / .txt",
)
async def deob_command(
    interaction: discord.Interaction,
    code: Optional[str] = None,
    file: Optional[discord.Attachment] = None,
):
    """Deobfuscate Lua code."""
    if not code and not file:
        await interaction.response.send_message(
            "❌ ส่งโค้ดหรือไฟล์มาด้วย! ใช้ `/deob code=...` หรือแนบไฟล์",
            ephemeral=True,
        )
        return

    lua_code = code

    if file:
        if file.size > MAX_FILE_SIZE:
            await interaction.response.send_message(
                f"❌ ไฟล์ใหญ่เกิน! สูงสุด {MAX_FILE_SIZE // 1_000_000}MB",
                ephemeral=True,
            )
            return
        try:
            lua_code = (await file.read()).decode("utf-8", errors="ignore")
        except Exception as e:
            await interaction.response.send_message(f"❌ อ่านไฟล์ไม่ออก: {e}", ephemeral=True)
            return

    if not lua_code or not lua_code.strip():
        await interaction.response.send_message("❌ โค้ดว่างเปล่า!", ephemeral=True)
        return

    if len(lua_code) > MAX_CODE_LENGTH:
        await interaction.response.send_message(
            f"❌ โค้ดยาวเกิน! สูงสุด {MAX_CODE_LENGTH:,} ตัวอักษร",
            ephemeral=True,
        )
        return

    await interaction.response.send_message("⚙️ กำลังแกะโค้ด... รอสักครู่")
    msg = await interaction.original_response()

    try:
        # Reset engine stats
        engine.stats = DeobStats()

        output, pct, stats, sigs = engine.run(lua_code)
        last_results[interaction.user.id] = (output, pct, stats, sigs)

        # Build embed
        color = (
            discord.Color.green() if pct >= 70
            else discord.Color.orange() if pct >= 40
            else discord.Color.red()
        )
        embed = discord.Embed(
            title="🔓 Deobfuscation Complete",
            description=f"**Effectiveness: {pct}%**",
            color=color,
            timestamp=datetime.utcnow(),
        )
        embed.set_author(name=interaction.user.display_name, icon_url=interaction.user.display_avatar.url)

        if sigs:
            embed.add_field(name="📋 Signatures", value="\n".join(f"• `{s}`" for s in sigs), inline=False)

        stat_lines = [f"{k}: **{v}**" for k, v in stats.items() if v > 0]
        if stat_lines:
            embed.add_field(name="📊 Stats", value="\n".join(stat_lines), inline=False)

        embed.set_footer(text=f"Requested by {interaction.user.name}")

        # Create .txt file
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"deob_{timestamp}.txt"

        with open(filename, "w", encoding="utf-8") as f:
            f.write(output)

        file_output = discord.File(filename, filename=filename)

        await msg.edit(
            content=f"🎯 **{pct}%** — ไฟล์ผลลัพธ์อยู่ด้านล่าง 👇",
            embed=embed,
            attachments=[file_output],
        )

        os.remove(filename)

    except Exception as e:
        await msg.edit(content=f"❌ เกิดข้อผิดพลาด: `{e}`", embed=None, attachments=[])


@bot.tree.command(name="deob-stats", description="ดูสถิติการแกะครั้งล่าสุด")
async def deob_stats_command(interaction: discord.Interaction):
    """Show last deob stats."""
    data = last_results.get(interaction.user.id)
    if not data:
        await interaction.response.send_message(
            "❌ ยังไม่มีข้อมูล — ใช้ `/deob` ก่อนแล้วค่อยมาเช็ค",
            ephemeral=True,
        )
        return

    output, pct, stats, sigs = data

    color = (
        discord.Color.green() if pct >= 70
        else discord.Color.orange() if pct >= 40
        else discord.Color.red()
    )
    embed = discord.Embed(
        title="📊 Last Deobfuscation Stats",
        description=f"**Effectiveness: {pct}%**",
        color=color,
    )

    if sigs:
        embed.add_field(name="Signatures", value="\n".join(f"• `{s}`" for s in sigs), inline=False)

    stat_lines = [f"{k}: **{v}**" for k, v in stats.items() if v > 0]
    if stat_lines:
        embed.add_field(name="Stats", value="\n".join(stat_lines), inline=False)

    await interaction.response.send_message(embed=embed)


@bot.tree.command(name="deob-help", description="คู่มือการใช้งาน")
async def deob_help_command(interaction: discord.Interaction):
    """Show help."""
    embed = discord.Embed(
        title="🔓 Luarmor Deobfuscator — Help",
        description=(
            "**คำสั่ง:**\n"
            "`/deob code:<โค้ด>` — แปะโค้ดตรงๆ\n"
            "`/deob file:<ไฟล์>` — แนบไฟล์ .lua / .txt\n"
            "`/deob-stats` — ดูสถิติครั้งล่าสุด\n"
            "`/deob-help` — หน้าจอนี้\n\n"
            "**รองรับ:** Luarmor XOR, Base64, byte arrays, dead code, "
            "variable rename, encoded numbers, loadstring unwrap\n\n"
            "**จำกัด:** 500K chars / 5MB ต่อครั้ง"
        ),
        color=discord.Color.blue(),
    )
    embed.set_footer(text="Built for BZMEMBER")
    await interaction.response.send_message(embed=embed)


# ── Events ──────────────────────────────────────────────────────────────

@bot.event
async def on_ready():
    logger.info(f"✅ Bot online: {bot.user} (ID: {bot.user.id})")
    try:
        synced = await bot.tree.sync()
        logger.info(f"🔄 Synced {len(synced)} slash commands")
    except Exception as e:
        logger.error(f"⚠️ Sync failed: {e}")


# ── Entry Point ─────────────────────────────────────────────────────────

if __name__ == "__main__":
    if not DISCORD_TOKEN or DISCORD_TOKEN == "ใส่_token_ของมึงตรงนี้":
        print("❌ ไม่พบ DISCORD_TOKEN! แก้ไข .env ก่อนรัน")
        exit(1)

    logger.info("🚀 Starting Luarmor Deob Bot...")
    bot.run(DISCORD_TOKEN)
