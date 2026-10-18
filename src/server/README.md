# Server integrations

เพิ่ม database/auth/private storage ในรอบที่ใช้งานจริง ตรวจสิทธิ์จาก session ก่อนเข้าถึงข้อมูล ไม่ส่ง secrets หรือเอกสารส่วนตัวผ่าน public/static assets

รอบ 1 มี lazy PostgreSQL/Prisma client, Better Auth, identity binding, AccountContext, account CRUD และการแปลง errors ที่ไม่เผย credentials แล้ว หน้าเริ่มต้นสาธารณะรันได้โดยไม่ใช้ credentials กลไกวิเคราะห์ในอนาคตไม่ import integration นี้ พื้นที่ไฟล์ส่วนตัวยังไม่พัฒนา

## Google login diagnostics

`google-profile.ts` uses jose (also used by Better Auth) directly so token failures
remain distinguishable. It accepts only RS256, Google's issuers, the configured
audience, a valid expiry/maximum age of one hour (with 30 seconds of clock-skew
tolerance), the expected nonce when supplied,
and verified email claims. Identity/domain/ownership checks remain in the account
binding layer. No database migration or manual account provisioning is needed.

Google public keys use a fixed HTTPS endpoint, a five-second fetch timeout,
manual redirects and jose's bounded ten-minute cache. Failed fetches are not
cached; signature checks run for every token even when keys are cached.

Logs have only `event`, `stage`, and fixed `code` values. `KEYS_NETWORK_FAILED`,
`KEYS_TIMEOUT`, `KEYS_HTTP_FAILED` or `KEYS_INVALID` identify key retrieval issues;
`TOKEN_SIGNATURE_INVALID`, `TOKEN_AUDIENCE_INVALID`, `TOKEN_ISSUER_INVALID`,
`TOKEN_EXPIRED` and `TOKEN_NONCE_INVALID` identify token rejection. Incomplete
signed profiles use `PROFILE_*`; callback failures have separate fixed codes.
Unknown upstream messages become `AUTH_CALLBACK_FAILED`. Never add raw provider
errors, JWT payloads, URLs, cookies, or tokens to these logs.

For `unable_to_get_user_info`, ask the owner to start a fresh login at `/sign-in`,
then inspect the new log's stage/code. This public error covers both unavailable
profiles and invalid provider account subjects; it alone does not prove an email
permission problem. Synthetic tests do not establish real Google acceptance.
