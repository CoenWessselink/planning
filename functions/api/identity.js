import { actorEmail, json } from "./_shared.js";

export function onRequestGet(context) {
  const email = actorEmail(context.request);
  if (!email) {
    return json({ ok:false, present:false, error:"Cloudflare Access-identiteit ontbreekt." }, 401);
  }
  return json({
    ok:true,
    present:true,
    email,
    source:"cloudflare-access",
    version:"internal-test-v78"
  });
}

export function onRequestOptions() {
  return json({ ok:true });
}

export function onRequest() {
  return json({ ok:false, error:"Method not allowed." }, 405);
}
