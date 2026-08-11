# 🔓 Luarmor Deobfuscator Bot

Discord bot แกะโค้ด Lua (Luarmor + generic obfuscation)

## คำสั่ง

- `/deob code:<โค้ด>` — แปะโค้ดตรงๆ
- `/deob file:<ไฟล์>` — แนบไฟล์ .lua / .txt
- `/deob-stats` — ดูสถิติครั้ งล่ าสุด
- `/deob-help` — ค่ ูมือ

## ติดตั้ ง

1. Clone repo นี้
2. `pip install -r requirements.txt`
3. คัดลอก `.env.example` → `.env` แล้ วใส่ Discord token
4. `python main.py`

## ข้ อจำกั ด

- สู งสุ ด 500,000 ตัวอักษร / 5 MB ต่ อครั้ ง
