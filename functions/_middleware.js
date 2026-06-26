// CWS Planning root middleware
//
// Belangrijk: /api/state moet NIET hier worden afgehandeld.
// De canonical D1-state route staat in functions/api/state.js en bevat de
// herstel-/chunklogica. Deze root middleware veroorzaakte opnieuw 500-fouten
// bij raw-state/chunked state doordat hij een oudere state-handler gebruikte.
// Daarom is deze middleware bewust alleen nog pass-through.

export async function onRequest(context) {
  return context.next();
}
