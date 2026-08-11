#!/usr/bin/env python3
"""
Luarmor Deobfuscator Discord Bot — Auto-Detect Mode
แคแปะโค้ดหรอแนบไฟลในชองไหนก็ได บอทจะเจาะ obf ใหอตั โนมตั
Built for BZMEMBER
"""

import os
import re
import base64
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

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

MAX_CODE_LENGTH = 500_000
MAX_FILE_SIZE = 5_000_000

# ── Stats ────────────────────────────────────────────────────────────────


@dataclass
class DeobStats:
    strings_decrypted: int = 0
    functions_inlined: int = 0
    dead_code_removed: int = 0
    variables_renamed: int = 0
    wrappers_removed: int = 0
    total_changes: int = 0


# ── Deobfuscation Engine ─────────────────────────────────────────────────


class LuarmorCracker:
    """Cracks Luarmor & generic Lua obfuscation automatically."""

    def __init__(self) -> None:
        self.stats = DeobStats()

    def crack(self, code: str) -> str:
        """Run all deob passes and return cracked code."""
        self.stats = DeobStats()
        result = code

        # ── Phase 1: Decrypt string tables ───────────────────────────
        result = self._decrypt_string_tables(result)

        # ── Phase 2: Inline decrypt function calls ───────────────────
        result = self._inline_decrypt_calls(result)

        # ── Phase 3: Remove dead code ────────────────────────────────
        result = self._remove_dead_code(result)

        # ── Phase 4: Rename obf variables ────────────────────────────
        result = self._rename_variables(result)

        # ── Phase 5: Decode numbers ──────────────────────────────────
        result = self._decode_numbers(result)

        # ── Phase 6: Unwrap loadstring ───────────────────────────────
        result = self._unwrap_loadstring(result)

        # ── Phase 7: Cleanup ─────────────────────────────────────────
        result = self._cleanup(result)

        return result

    def _decrypt_string_tables(self, code: str) -> str:
        """Find and decrypt XOR-encoded string tables."""
        # Pattern: string.char(bit.bxor(string.byte(str, off), key))
        pattern = re.compile(
            r'string\.char\s*\(\s*bit\.bxor\s*\(\s*string\.byte\s*\(\s*'
            r'["\'](.+?)["\']\s*,\s*\d+\s*\)\s*,\s*(\d+)\s*\)\s*\)',
            re.IGNORECASE,
        )
        for match in pattern.finditer(code):
            try:
                chars = match.group(1)
                key = int(match.group(2))
                decoded = "".join(chr(ord(c) ^ key) for c in chars)
                code = code.replace(match.group(0), f'"{decoded}"', 1)
                self.stats.strings_decrypted += 1
            except (ValueError, IndexError):
                pass

        # Pattern: string.char(72, 101, 108, 108, 111)
        byte_pattern = re.compile(r'string\.char\s*\(\s*([\d,\s]+)\s*\)')
        for match in byte_pattern.finditer(code):
            try:
                nums = [int(x.strip()) for x in match.group(1).split(",") if x.strip()]
                if all(0 <= n < 256 for n in nums) and len(nums) > 1:
                    decoded = "".join(chr(n) for n in nums)
                    if decoded.isprintable() and len(decoded) > 1:
                        code = code.replace(match.group(0), f'"{decoded}"', 1)
                        self.stats.strings_decrypted += 1
            except (ValueError, IndexError):
                pass

        # Pattern: Base64 strings
        b64_pattern = re.compile(r'["\']([A-Za-z0-9+/=]{20,})["\']')
        for match in b64_pattern.finditer(code):
            try:
                decoded = base64.b64decode(match.group(1)).decode("utf-8", errors="ignore")
                if decoded.isprintable() and len(decoded) > 3:
                    code = code.replace(match.group(0), f'"{decoded}"', 1)
                    self.stats.strings_decrypted += 1
            except Exception:
                pass

        return code

    def _inline_decrypt_calls(self, code: str) -> str:
        """Replace _0x1(N) calls with decrypted strings from table."""
        # Find string table: local _0x = {"str1", "str2", ...}
        table_match = re.search(r'local\s+(_\w+)\s*=\s*\{([^}]+)\}', code, re.DOTALL)
        if not table_match:
            return code

        table_var = table_match.group(1)
        table_content = table_match.group(2)
        strings = re.findall(r'["\']([^"\']*)["\']', table_content)

        if not strings:
            return code

        # Find decrypt function
        func_match = re.search(
            r'local\s+function\s+(\w+)\s*\(\w+\)\s*return\s*string\.char\s*\(\s*'
            r'bit\.bxor\s*\(\s*string\.byte\s*\(\s*' + re.escape(table_var) +
            r'\s*\[\s*\w+\s*\]\s*,?\s*\d*\s*\)\s*,\s*(\d+)\s*\)',
            code,
            re.IGNORECASE,
        )

        if not func_match:
            # Try simpler pattern
            func_match = re.search(
                r'local\s+(\w+)\s*=\s*function\s*\(\w+\)\s*return\s*string\.char\s*\(\s*'
                r'bit\.bxor\s*\(\s*string\.byte\s*\(\s*' + re.escape(table_var) +
                r'\s*\[\s*\w+\s*\]\s*,?\s*\d*\s*\)\s*,\s*(\d+)\s*\)',
                code,
                re.IGNORECASE,
            )

        if func_match:
            func_name = func_match.group(1)
            key = int(func_match.group(2))

            # Replace func_name(N) with decrypted strings
            for i, enc_str in enumerate(strings):
                try:
                    decoded = "".join(chr(ord(c) ^ key) for c in enc_str)
                    call_pattern = rf'{re.escape(func_name)}\s*\(\s*{i}\s*\)'
                    code = re.sub(call_pattern, f'"{decoded}"', code)
                    self.stats.functions_inlined += 1
                except Exception:
                    pass

        return code

    def _remove_dead_code(self, code: str) -> str:
        """Remove dead code blocks."""
        patterns = [
            r'while\s+(false|nil|0)\s+do\s*?.*?end',
            r'if\s+(false|nil)\s+then\s*?.*?end',
        ]
        for pat in patterns:
            new_code = re.sub(pat, "", code, flags=re.DOTALL | re.IGNORECASE)
            if new_code != code:
                self.stats.dead_code_removed += 1
                code = new_code
        return code

    def _rename_variables(self, code: str) -> str:
        """Rename _0xABC123 → var_N / fn_N."""
        rename_map: dict[str, str] = {}
        counters = {"fn": 0, "var": 0}

        for match in re.finditer(r'_0x[a-fA-F0-9]{3,}', code):
            name = match.group(0)
            if name not in rename_map:
                if re.search(rf'{re.escape(name)}\s*\(', code):
                    counters["fn"] += 1
                    rename_map[name] = f"fn_{counters['fn']}"
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
        """Unwrap nested loadstring wrappers."""
        for _ in range(5):
            match = re.search(
                r'loadstring\s*\(\s*loadstring\s*\(\s*["\'](.+?)["\']\s*\)\s*\)',
                code,
                re.DOTALL,
            )
            if match:
                code = code.replace(match.group(0), f'loadstring("{match.group(1)}")', 1)
                self.stats.wrappers_removed += 1
            else:
                break
        return code

    def _cleanup(self, code: str) -> str:
        """Final cleanup."""
        code = re.sub(r'\n{3,}', '\n\n', code)
        code = re.sub(r'[ \t]+', ' ', code)
        return code.strip()

    def calc_percentage(self, original: str, result: str) -> float:
        """Calculate deob effectiveness."""
        if not original.strip():
            return 0.0

        score = 0.0
        orig_len = len(original.strip())
        new_len = len(result.strip())

        if orig_len > 0:
            score += min(max(0, (orig_len - new_len) / orig_len * 100), 30)

        score += min(self.stats.strings_decrypted * 5, 25)
        score += min(self.stats.functions_inlined * 4, 20)
        score += min(self.stats.dead_code_removed * 4, 15)
        score += min(self.stats.variables_renamed * 2, 10)
        score += min(self.stats.numbers_decoded * 3, 10)
        score += min(self.stats.wrappers_removed * 5, 10)

        return round(min(score, 100.0), 1)


# ── Bot ──────────────────────────────────────────────────────────────────

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)

cracker = LuarmorCracker()


# ── Auto-Detect Handler ──────────────────────────────────────────────────


def is_obfuscated(code: str) -> bool:
    """Check if code looks obfuscated."""
    indicators = [
        r'string\.char',
        r'bit\.bxor',
        r'loadstring',
        r'_0x[a-fA-F0-9]{3,}',
        r'~-\d+',
        r'while\s+(false|nil)\s+do',
        r'_ENV',
    ]
    return any(re.search(pat, code, re.IGNORECASE) for pat in indicators)


async def process_code(message: discord.Message, code: str) -> None:
    """Process obfuscated code and send deobfuscated result."""
    if len(code) > MAX_CODE_LENGTH:
        await message.channel.send(
            f"❌ โค้ดยาวเกนไป! สูงสุด {MAX_CODE_LENGTH:,} ตัวอักษร",
            reference=message,
        )
        return

    if not is_obfuscated(code):
        return  # Not obfuscated, ignore

    processing_msg = await message.channel.send(
        "⚙️ กำลั งเจาะ obf... รอสั กครู",
        reference=message,
    )

    try:
        cracked = cracker.crack(code)
        pct = cracker.calc_percentage(code, cracked)

        # Build stats text
        s = cracker.stats
        stats_text = (
            f"🔓 Strings: {s.strings_decrypted} | "
            f"⚡ Inlined: {s.functions_inlined} | "
            f"🗑️ Dead: {s.dead_code_removed} | "
            f"🏷️ Renamed: {s.variables_renamed} | "
            f"🔢 Numbers: {s.numbers_decoded} | "
            f"🔄 Unwrapped: {s.wrappers_removed}"
        )

        # Create .txt file
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"cracked_{timestamp}.txt"

        header = (
            f"-- ============================================\n"
            f"-- Luarmor Cracked Output\n"
            f"-- Effectiveness: {pct}%\n"
            f"-- {stats_text}\n"
            f"-- ============================================\n\n"
        )

        with open(filename, "w", encoding="utf-8") as f:
            f.write(header + cracked)

        file_output = discord.File(filename, filename=filename)

        color = discord.Color.green() if pct >= 70 else discord.Color.orange() if pct >= 40 else discord.Color.red()
        embed = discord.Embed(
            title=f"🔓 Cracked! — {pct}%",
            description=stats_text,
            color=color,
        )
        embed.set_author(name=message.author.display_name, icon_url=message.author.display_avatar.url)
        embed.set_footer(text=f"Detected from: {message.channel}")

        await processing_msg.edit(
            content=f"🎯 **{pct}%** — ไฟลผลลัพธด้านล่าง 👇",
            embed=embed,
            attachments=[file_output],
        )

        os.remove(filename)

    except Exception as e:
        logger.error(f"Crack error: {e}", exc_info=True)
        await processing_msg.edit(
            content=f"❌ เกิดข้อผิดพลาด: `{e}`",
            embed=None,
            attachments=[],
        )


# ── Message Events ───────────────────────────────────────────────────────


@bot.event
async def on_message(message: discord.Message):
    """Auto-detect and process obfuscated code in any message."""
    # Ignore bot's own messages
    if message.author.bot:
        return

    code_to_process = None

    # Check for file attachments
    for attachment in message.attachments:
        if attachment.size > MAX_FILE_SIZE:
            await message.channel.send(
                f"❌ ไฟลใหญเกิน! สูงสุด {MAX_FILE_SIZE // 1_000_000}MB",
                reference=message,
            )
            continue

        if attachment.filename.endswith(('.lua', '.txt', '.luau')):
            try:
                code_to_process = (await attachment.read()).decode("utf-8", errors="ignore")
            except Exception:
                await message.channel.send(
                    f"❌ อ่านไฟลไมได: {attachment.filename}",
                    reference=message,
                )
                continue

    # Check message content for pasted code
    if not code_to_process and message.content.strip():
        content = message.content.strip()
        # Check if it looks like Lua code
        if any(marker in content for marker in ['function', 'local', 'end', 'loadstring', 'string.', '_ENV']):
            code_to_process = content

    if code_to_process:
        await process_code(message, code_to_process)

    # Still process regular commands
    await bot.process_commands(message)


# ── Optional: Help command ───────────────────────────────────────────────


@bot.command(name="deobhelp")
async def help_cmd(ctx: commands.Context):
    """Show help info."""
    embed = discord.Embed(
        title="🔓 Luarmor Cracker — Help",
        description=(
            "บอทนี้จะ **จับอตั โนมัติ** เมื่อคณุ แปะโค้ด Lua หรอื แนบไฟลในชองใดก็ได้\n\n"
            "**วธิ ใช:**\n"
            "• แปะโค้ด Lua ที่ obfuscate มาในชองไหนก็ได้\n"
            "• แนบไฟล .lua / .txt มาในชองไหนก็ได้\n"
            "• บอทจะเจาะ obf แลวสงผลเปน .txt กลับมา\n\n"
            "**รองรบั :**\n"
            "• Luarmor XOR string tables\n"
            "• Byte array strings\n"
            "• Base64 encoded strings\n"
            "• Dead code removal\n"
            "• Variable renaming\n"
            "• Encoded numbers (~-5)\n"
            "• loadstring unwrap\n\n"
            "**จำกด:** 500K chars / 5MB ตอครัง้"
        ),
        color=discord.Color.blue(),
    )
    embed.set_footer(text="Built for BZMEMBER")
    await ctx.send(embed=embed)


# ── Events ───────────────────────────────────────────────────────────────


@bot.event
async def on_ready():
    logger.info(f"✅ Bot online: {bot.user} (ID: {bot.user.id})")
    try:
        synced = await bot.tree.sync()
        logger.info(f"🔄 Synced {len(synced)} slash commands")
    except Exception as e:
        logger.error(f"⚠️  Sync failed: {e}")


# ── Entry Point ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    token = os.getenv("DISCORD_TOKEN", "").strip()

    if not token:
        print("❌ DISCORD_TOKEN not found!")
        print("   → Go to Railway dashboard → Variables → Add DISCORD_TOKEN")
        exit(1)

    logger.info("🚀 Starting Luarmor Cracker Bot...")
    bot.run(token)
