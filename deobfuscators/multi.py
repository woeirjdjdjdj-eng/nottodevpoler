import re
import base64
import codecs

def detect_obfuscator(content: str) -> str:
    content_lower = content.lower()

    if "luraph" in content_lower or "lph@" in content_lower:
        return "Luraph"
    if "ironbrew" in content_lower or "ib2" in content_lower:
        return "IronBrew"
    if "prometheus" in content_lower:
        return "Prometheus"
    if "moonsec" in content_lower:
        return "Moonsec"
    if "psu" in content_lower or "perth" in content_lower:
        return "PSU"
    if "synapse" in content_lower and "xen" in content_lower:
        return "Synapse Xen"
    if "loadstring" in content_lower and "httpget" in content_lower:
        return "Loader / Remote Script"
    if re.search(r"\\224\\184|\\x[0-9a-f]{2}|[A-Za-z0-9+/]{40,}={0,2}", content):
        return "Simple Encoding (UTF-8 / Base64 / Hex)"
    return "Unknown / Custom"

def decode_utf8_escapes(text: str) -> list[str]:
    results = []
    for match in re.finditer(r"(?:\\\d{1,3}){3,}", text):
        try:
            codes = [int(x) for x in re.findall(r"\\(\d{1,3})", match.group(0))]
            decoded = bytes(codes).decode("utf-8", errors="ignore").strip()
            if len(decoded) >= 2:
                results.append(decoded)
        except:
            pass
    return results

def decode_base64(text: str) -> list[str]:
    results = []
    for m in re.findall(r"[A-Za-z0-9+/]{32,}={0,2}", text):
        try:
            decoded = base64.b64decode(m).decode("utf-8", errors="ignore").strip()
            if len(decoded) >= 3:
                results.append(decoded)
        except:
            pass
    return results

def decode_hex(text: str) -> list[str]:
    results = []
    for m in re.findall(r"(?:\\x[0-9a-fA-F]{2}){4,}", text):
        try:
            decoded = codecs.decode(m, "unicode_escape", errors="ignore").strip()
            if len(decoded) >= 2:
                results.append(decoded)
        except:
            pass
    return results

def extract_readable_strings(text: str) -> list[str]:
    """ดึง string ที่อ่านได้จากโค้ด"""
    results = []
    # หา "..." หรือ '...'
    for m in re.findall(r'["\']([^"\']{4,})["\']', text):
        if any(c.isalpha() for c in m) and not m.isnumeric():
            results.append(m)
    return results

def multi_deobfuscate(content: str) -> tuple[str, int, str]:
    """
    คืนค่า: (ผลลัพธ์, เปอร์เซ็นต์ที่แกะได้, ชนิด obfuscator)
    """
    obfuscator = detect_obfuscator(content)
    found = []

    # วิธีที่ 1: UTF-8 Escape
    found.extend(decode_utf8_escapes(content))

    # วิธีที่ 2: Base64
    found.extend(decode_base64(content))

    # วิธีที่ 3: Hex
    found.extend(decode_hex(content))

    # วิธีที่ 4: Readable strings
    found.extend(extract_readable_strings(content))

    # ลบซ้ำ
    unique = list(dict.fromkeys([x for x in found if x and len(x.strip()) > 1]))

    # คำนวณ % คร่าวๆ
    if obfuscator in ["Luraph", "IronBrew", "Prometheus", "Moonsec", "PSU", "Synapse Xen"]:
        if len(unique) == 0:
            percent = 5
        elif len(unique) < 5:
            percent = 15
        else:
            percent = 30
    elif obfuscator == "Simple Encoding (UTF-8 / Base64 / Hex)":
        percent = 70 if unique else 20
    elif obfuscator == "Loader / Remote Script":
        percent = 10
    else:
        percent = 25 if unique else 5

    # สร้างข้อความผลลัพธ์
    result = f"===== ผลการแกะ =====\n"
    result += f"ชนิดที่ตรวจพบ : {obfuscator}\n"
    result += f"ความสำเร็จโดยประมาณ : {percent}%\n"
    result += f"จำนวนค่าที่แกะได้ : {len(unique)}\n"
    result += "=" * 30 + "\n\n"

    if unique:
        result += "ค่าที่แกะได้:\n\n"
        for i, val in enumerate(unique[:50], 1):  # จำกัด 50 ค่า
            result += f"{i}. {val}\n"
        if len(unique) > 50:
            result += f"\n... และอีก {len(unique)-50} ค่า"
    else:
        result += "ไม่พบค่าที่สามารถแกะออกมาได้ด้วยวิธีปัจจุบัน\n"
        result += "(อาจเป็น obfuscator หนักอย่าง Luraph v14+ / IronBrew ล่าสุด)"

    return result, percent, obfuscator
