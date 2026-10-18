# Accounts — รอบ 1 / FR-01

รับ session ที่ตรวจแล้วจาก server แล้วคืนบริบทบัญชีและสิทธิ์หลักสูตร ตรวจรายชื่อที่อนุญาต เจ้าของข้อมูล และการมอบหมายหลักสูตรทุกคำขอ ข้อมูลใน PDF ไม่เปลี่ยนตัวตนบัญชี

รอบ 1 มี types/validation/guards และการทดสอบแล้ว ใช้ Better Auth + Google ผ่าน server integrations บัญชีที่อนุญาตอยู่ใน AccountAccess แยกจาก auth User ไม่ใช้ client-selected role/student_id เป็นสิทธิ์

บัญชีมหาวิทยาลัยใหม่ลงทะเบียนอัตโนมัติด้วย Google email_verified และ hd ที่ผ่านการตรวจลายเซ็นแล้ว นักศึกษาส่งคำขอบริบทแยกจาก enrollment จริง และผู้ดูแลหลักอนุมัติก่อนใช้ guard วิชาการ บัญชีเดิมและรายชื่ออนุญาตนอกโดเมนรักษาสิทธิ์เดิม

sessions ใน tests เป็น fixtures จากฐาน aps_v2_test ไม่มี endpoint ข้าม authentication ในเว็บ ผลเหล่านี้ไม่แทน Google OAuth จริง
