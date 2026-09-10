# 🎤 Napat Karaoke Pro

ระบบเว็บแอปพลิเคชันคาราโอเกะแยก 2 หน้าจอ (TV Display + Mobile Remote) ทำงานแบบเรียลไทม์ผ่าน WebRTC (PeerJS) ออกแบบให้รองรับการทำงานได้ทั้ง 3 แพลตฟอร์ม: Local SBC (NanoPi / Raspberry Pi), Cloudflare Pages Functions และ Vercel / Node.js Serverless API

---

## ✨ คุณสมบัติเด่น (Features)

* **Dual-Screen Architecture:** แยกหน้าจอแสดงผลบนทีวี (`display.html`) และหน้ารีโมตควบคุมบนมือถือ (`controller.html`)
* **Realtime Synchronization:** ควบคุมคิวเพลง ข้ามเพลง สลับลำดับเพลง และเล่น/หยุดเพลงทันทีผ่าน PeerJS (WebRTC DataChannel)
* **Smart UI Auto-Hide:** แถบสถานะ กล่องคิวเพลง และ QR Code ซ่อนตัวอัตโนมัติขณะเล่นเพลง และปรากฏขึ้นเมื่อแตะหน้าจอหรือขยับเมาส์
* **Multi-Platform Search API:** รองรับระบบค้นหา YouTube Karaoke ในตัว ทั้งแบบ Node.js Native (`server.js`), Cloudflare Pages (`functions/api/`), และ Serverless Route (`api/`)
* **Zero-Dependency Native Server:** ไม่ต้องติดตั้งแพ็กเกจภายนอก ประหยัด CPU และ RAM เหมาะสำหรับบอร์ดขนาดเล็ก

---

## 📂 โครงสร้างโปรเจกต์ (Project Structure)

```text
napat-karaoke-pro/
├── api/                  # Endpoint API ค้นหาเพลง (สำหรับ Vercel / Serverless / Node Routes)
│   └── search.js
├── functions/            # Endpoint API ค้นหาเพลง (สำหรับ Cloudflare Pages Functions)
│   └── api/
│       └── search.js
├── controller.html       # หน้าจอด้านรีโมตมือถือ (ค้นหาเพลง, ส่งคิว, ควบคุม)
├── display.html          # หน้าจอสำหรับเปิดบน TV (แสดงวิดีโอ, คิวเพลง, QR Code)
├── index.html            # หน้า All-in-One (โหมดเล่นบนจอเดียว)
├── package.json          # กำหนดคำสั่งรันและ Metadata ของโปรเจกต์
├── server.js             # HTTP Server แบบ Native สำหรับรันบน NanoPi / Linux SBC
└── README.md             # เอกสารแนะนำการติดตั้งและใช้งาน

🚀 1. การติดตั้งและใช้งานบน NanoPi / Linux SBC
ติดตั้ง Node.js และ PM2
sudo apt update
sudo apt install -y nodejs npm
sudo npm install -g pm2

ดึงโปรเจกต์และสั่งรัน
cd /opt
git clone [https://github.com/nat189/napat-karaoke-pro.git](https://github.com/nat189/napat-karaoke-pro.git)
cd napat-karaoke-pro

pm2 start server.js --name "karaoke"
pm2 save
pm2 startup

URL สำหรับเข้าใช้งาน
​หน้าจอ TV Display: http://<IP_เครื่อง>:8085/display.html
​หน้ารีโมตมือถือ Controller: http://<IP_เครื่อง>:8085/controller.html
​หน้า All-in-One: http://<IP_เครื่อง>:8085/index.html


☁️ 2. การ Deploy บน Cloudflare Pages (ผ่าน functions/api/)
เชื่อมต่อ GitHub Repository กับ Cloudflare Pages
ตั้งค่าการสร้าง (Build Settings):
Framework preset: None
Build command: (เว้นว่าง)
Build output directory: /
กด Save and Deploy
(Cloudflare Pages จะนำไฟล์ในโฟลเดอร์ functions/api/search.js มาทำงานเป็น Serverless API ให้โดยอัตโนมัติ)

⚡ 3. การ Deploy บน Vercel (ผ่าน api/)
นำเข้า Repository เข้าสู่ Vercel
ตั้งค่า Output Directory เป็น Root (./)
กด Deploy
(Vercel จะตรวจพบโฟลเดอร์ api/search.js และสร้าง Serverless Function สำหรับค้นหาเพลงให้อัตโนมัติ)


คำสั่งจัดการระบบประจำวัน (บน NanoPi)

# ตรวจสอบสถานะ
pm2 status

# ดู Logs การทำงาน
pm2 logs karaoke

# รีสตาร์ตระบบ
pm2 restart karaoke

# อัปเดตโค้ดล่าสุดจาก GitHub
cd /opt/napat-karaoke-pro && git pull && pm2 restart karaoke





🔄 คำสั่งจัดการระบบประจำวัน (บน NanoPi)
