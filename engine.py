import re
import base64
import codecs
from typing import Tuple, List

def detect_obfuscator(content: str) -> str:
    c = content.lower()
    if "luraph" in c or "lph@" in c:
        return "Luraph"
    if "ironbrew" in c or "ib2" in c:
        return "IronBrew"
    if "prometheus" in c:
        return "Prometheus"
    if "moonsec" in c:
        return "Moonsec"
    if "psu" in c or "perth" in c:
        return "PSU"
    if "synapse" in c and "xen" in c:
        return "Synapse Xen"
    if "boronide" in c:
        return "Boronide"
    if "loadstring" in c and ("httpget" in c or "http" in c):
        return "Loader / Remote Script"
    if re.search(r"\\224\\184|\\x[0-9a-f]{2}|[A-Za-z0-9+/]{40,}={0,2}", content):
        return "Simple Encoding"
    return "Unknown / Custom"

def decode_utf8_escapes(text: str) -> List[str]:
    results = []
    for match in re.finditer(r"(?:\\\d{1,3}){3,}", text):
        try:
            codes = [int(x) for x in re.findall(r"\\(\d{1,3})", match.group(0))]
            decoded = bytes(codes).decode("utf-8", errors="ignore").strip()
            if len(decoded) >= 2 and any(c.isalnum() for c in decoded):
                results.append(decoded)
        except:
            pass
    return results

def decode_base64(text: str) -> List[str]:
    results = []
    for m in re.findall(r"[A-Za-z0-9+/]{32,}={0,2}", text):
        try:
            decoded = base64.b64decode(m).decode("utf-8", errors="ignore").strip()
            if len(decoded) >= 4 and any(c.isalpha() for c in decoded):
                results.append(decoded)
        except:
            pass
    return results

def decode_hex(text: str) -> List[str]:
    results = []
    for m in re.findall(r"(?:\\x[0-9a-fA-F]{2}){4,}", text):
        try:
            decoded = codecs.decode(m, "unicode_escape", errors="ignore").strip()
            if len(decoded) >= 2:
                results.append(decoded)
        except:
            pass
    return results

def extract_strings(text: str) -> List[str]:
    results = []
    for m in re.findall(r'["\']([a-zA-Z0-9_ ./\\-]{4,80})["\']', text):
        if any(c.isalpha() for c in m):
            results.append(m)
    return results

def clean_results(values: List[str]) -> List[str]:
    """กรองค่ามั่วๆ ออก เหลือแต่ที่ดูอ่านได้"""
    cleaned = []
    for v in values:
        v = v.strip()
        if not v or len(v) < 2:
            continue
        # ตัดค่าที่มั่วเกินไป
        if sum(1 for c in v if ord(c) < 32 or ord(c) > 126) > len(v) * 0.3:
            continue
        if re.fullmatch(r"[\W_]+", v):
            continue
        cleaned.append(v)
    return list(dict.fromkeys(cleaned))  # ลบซ้ำ

def run_engine(content: str) -> Tuple[str, int, str]:
    obfuscator = detect_obfuscator(content)
    found = []

    found.extend(decode_utf8_escapes(content))
    found.extend(decode_base64(content))
    found.extend(decode_hex(content))
    found.extend(extract_strings(content))

    unique = clean_results(found)

    # คำนวณ % ตามชนิด
    if obfuscator in ["Luraph", "IronBrew", "Prometheus", "Moonsec", "PSU", "Synapse Xen", "Boronide"]:
        if len(unique) == 0:
            percent = 5
        elif len(unique) < 8:
            percent = 20
        else:
            percent = 35
    elif obfuscator == "Simple Encoding":
        percent = 75 if unique else 25
    elif obfuscator == "Loader / Remote Script":
        percent = 15
    else:
        percent = 30 if unique else 10

    # สร้างผลลัพธ์
    result = "===== ผลการแกะ (Multi Engine) =====\n"
    result += f"ชนิดที่ตรวจพบ     : {obfuscator}\n"
    result += f"ความสำเร็จโดยประมาณ : {percent}%\n"
    result += f"จำนวนค่าที่แกะได้  : {len(unique)}\n"
    result += "=" * 40 + "\n\n"

    if unique:
        result += "ค่าที่แกะได้ (กรองแล้ว):\n\n"
        for i, val in enumerate(unique[:60], 1):
            result += f"{i}. {val}\n"
        if len(unique) > 60:
            result += f"\n... และอีก {len(unique) - 60} ค่า"
    else:
        result += "ไม่พบค่าที่อ่านรู้เรื่องจากวิธีปัจจุบัน\n"
        result += "แนะนำ: ใช้เครื่องมือเฉพาะทาง (LD / IronbrewDeobfuscator / Luaxom)\n"

    result += "\n\n--- หมายเหตุ ---\n"
    result += "บอทนี้รวมหลายวิธีพื้นฐานไว้แล้ว\n"
    result += "สำหรับ Luraph / PSU / IronBrew หนักๆ ยังต้องใช้เครื่องมือภายนอกเพิ่ม\n"

    return result, percent, obfuscator
