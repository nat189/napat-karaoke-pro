# 🎤 Napat Karaoke Pro (Cloudflare Pages Edition)

ระบบเว็บแอปพลิเคชันคาราโอเกะ 2 หน้าจอ (จอแสดงผล Smart TV + รีโมตควบคุมบนมือถือ) ทำงานแบบ **100% Serverless** บน **Cloudflare Pages & Functions** โดยไม่ต้องเปิดคอมพิวเตอร์เซิร์ฟเวอร์ทิ้งไว้ ไม่ต้องติดตั้ง Node.js หรือ Docker และไม่มีค่าใช้จ่าย

---

## ✨ คุณสมบัติเด่น (Features)

* **⚡ 100% Serverless & Zero Maintenance:** รันโค้ดฝั่ง Client และ Edge Functions ผ่าน Cloudflare Pages ฟรีตลอดชีพ
* **📱 Real-time Mobile Controller (WebRTC P2P):** เชื่อมต่อรีโมตมือถือกับจอทีวีโดยตรงผ่าน **PeerJS** ตอบสนองฉับไว เสถียร ไม่เปลืองแบนด์วิธเซิร์ฟเวอร์
* **🎯 Unlimited Karaoke Search:** ค้นหาเพลงผ่าน YouTube Web Scraping บน Functions (`/api/search`) ไม่ใช้ YouTube Data API Key หมดปัญหาโควตาเต็ม 10,000 หน่วยประจำวัน
* **📺 Smart Display TV:**
  * สุ่มรหัสห้องอัตโนมัติ พร้อมสร้าง **QR Code** สำหรับสแกนเข้าใช้งานได้ทันที
  * ซ่อน QR Code และคิวเพลงอัตโนมัติหลังเพลงเริ่ม 15 วินาที และดึงกลับมาแสดงก่อนจบเพลง 15 วินาที
  * ระบบสลับภาพพื้นหลังแบบ Crossfade สุ่มภาพคมชัดจาก Bing Wallpaper อัตโนมัติทุก 20 วินาทีเมื่อไม่มีการเล่นเพลง
  * บล็อกและปิด Subtitle / คำบรรยายแปลภาษาของ YouTube ถาวร ไม่ให้บดบังเนื้อเพลงคาราโอเกะ
* **🎉 Singing Score FX:** แสดงคะแนนร้องเพลงตัวเลขยักษ์ (80–100 คะแนน) พร้อมคำชมสุดกวน 5 วินาทีสุดท้ายก่อนตัดเข้าเพลงถัดไป
* **🎛️ Full Remote Control:** ค้นหาเพลง, จองเพลง, สั่งข้าม, หยุด/เล่นต่อ, แทรกคิวขึ้น-ลง, และกดค้าง 2 วินาทีเพื่อลบเพลงออกจากคิว

---

## 📂 โครงสร้างโปรเจกต์ (Project Structure)

```text
napat-karaoke-pro/
├── functions/
│   └── api/
│       └── search.js       # Backend Function ดึงผลการค้นหาเพลงคาราโอเกะจาก YouTube
├── controller.html         # หน้ารีโมตคอนโทรลสำหรับสมาร์ตโฟน
├── display.html            # หน้าจอแสดงผลหลักสำหรับ Smart TV / จอคอมพิวเตอร์
├── index.html              # หน้าแรกสำหรับเลือกเปิดหน้าจอหรือเข้าใช้งาน
└── README.md               # คู่มือการติดตั้งและใช้งานโปรเจกต์
