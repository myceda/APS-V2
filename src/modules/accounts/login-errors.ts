/** Public messages only. Never show upstream provider responses or tokens. */
export function loginErrorMessage(code?: string): string | null {
  if (!code) return null;
  switch (code) {
    case "unable_to_get_user_info":
      return "รับข้อมูลบัญชีจาก Google ไม่สำเร็จ กรุณากดเข้าสู่ระบบด้วย Google อีกครั้ง หากยังไม่ได้ ให้แจ้งผู้ดูแลพร้อมรหัส unable_to_get_user_info";
    case "access_denied":
      return "การเข้าสู่ระบบถูกยกเลิก หรือ Google ไม่อนุญาตบัญชีนี้ ลองใหม่และตรวจข้อความบนหน้า Google";
    case "GOOGLE_ACCOUNT_MISMATCH":
      return "บัญชีที่เลือกใน Google ไม่ตรงกับอีเมลที่กรอก กรุณาเลือกบัญชีให้ตรงกัน หากเป็นอีเมลสำรอง ให้ใช้อีเมลหลักที่ Google แสดง";
    case "ACCOUNT_NOT_ALLOWED":
      return "Google ยืนยันแล้ว แต่บัญชีนี้ไม่ผ่านเงื่อนไขเข้าใช้ ตรวจว่าใช้อีเมลมหาวิทยาลัย @silpakorn.edu บัญชีภายนอกต้องได้รับอนุญาตก่อน";
    case "IDENTITY_CONFLICT":
      return "บัญชี Google ไม่ตรงกับข้อมูลบัญชีเดิม กรุณาให้ผู้ดูแลตรวจการผูกบัญชี ระบบยังไม่ได้เปลี่ยนเจ้าของข้อมูล";
    case "GOOGLE_EMAIL_UNVERIFIED":
    case "EMAIL_NOT_VERIFIED":
      return "Google ยังไม่ยืนยันอีเมลนี้ กรุณาตรวจบัญชี Google ก่อนลองอีกครั้ง";
    case "state_mismatch":
    case "state_not_found":
      return "ขั้นตอนเข้าสู่ระบบหมดอายุ กรุณาเริ่มใหม่จากหน้านี้และใช้หน้าต่างเดิมจนเสร็จ";
    case "org_internal":
      return "Google จำกัดแอปนี้ไว้กับองค์กรอื่น ผู้ดูแลต้องตรวจการตั้งค่ากลุ่มผู้ใช้ของแอป";
    default:
      return "เข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง หากยังติด ให้แจ้งผู้ดูแลว่าปัญหาเกิดบนหน้า Google หรือหลังกลับมาหน้า APS";
  }
}
