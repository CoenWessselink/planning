// API middleware is intentionally pass-through. Route-specific files perform
// authentication, authorization, validation and schema verification.
export async function onRequest(context) {
  return context.next();
}
