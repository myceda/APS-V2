import { requireAccount } from "@/server/account-context";
import { errorResponse, privateHeaders } from "@/server/http";
import { ownDocument } from "@/server/academic";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const document = await ownDocument(
      await requireAccount(request.headers),
      (await context.params).id,
    );
    return new Response(new Uint8Array(document.content), {
      headers: {
        ...privateHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="aps-transcript.pdf"',
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
