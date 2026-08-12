import { applySecurityHeaders } from "./api/_shared.js";

export async function onRequest(context) {
  try {
    return applySecurityHeaders(await context.next());
  } catch (error) {
    const response = new Response(JSON.stringify({ ok: false, error: "Onverwachte serverfout." }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
    });
    return applySecurityHeaders(response);
  }
}
