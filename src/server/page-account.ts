import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AccessError } from "@/modules/accounts/errors";
import { requireAccount } from "./account-context";

export async function readPageAccount() {
  try {
    return { account: await requireAccount(await headers()), error: null };
  } catch (error) {
    if (error instanceof AccessError && error.status === 401)
      redirect("/sign-in");
    return {
      account: null,
      error:
        error instanceof AccessError
          ? error.message
          : "ระบบไม่พร้อมใช้งาน กรุณาลองใหม่หรือติดต่อผู้ดูแล",
    };
  }
}
