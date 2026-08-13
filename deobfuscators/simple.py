import re
import base64
import codecs

def decode_utf8_escapes(text: str) -> str:
    def replace(match):
        try:
            codes = [int(x) for x in re.findall(r"\\(\d{1,3})", match.group(0))]
            return bytes(codes).decode("utf-8", errors="ignore")
        except:
            return match.group(0)
    return re.sub(r"(?:\\\d{1,3})+", replace, text)

def try_base64(text: str) -> str:
    matches = re.findall(r"[A-Za-z0-9+/]{40,}={0,2}", text)
    for m in matches:
        try:
            decoded = base64.b64decode(m).decode("utf-8", errors="ignore")
            if len(decoded) > 15:
                text = text.replace(m, decoded)
        except:
            pass
    return text

def simple_deobfuscate(content: str) -> str:
    content = decode_utf8_escapes(content)
    content = try_base64(content)
    try:
        content = codecs.decode(content, "unicode_escape", errors="ignore")
    except:
        pass
    return content
