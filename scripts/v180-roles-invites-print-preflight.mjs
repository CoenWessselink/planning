import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const store = read("js/core/store.js");
const permissions = read("js/core/permissions.js");
const interaction = read("js/core/interactive_planning.js");
const layers = read("js/core/complete_prompt_layers.js");
const ui = read("js/core/ui.js");
const capacityPrint = read("js/core/capacity_print_tasche_a3.js");

const checks = [];
const add = (name, pass) => checks.push([name, !!pass]);

add("Alle promptrollen bestaan", ["admin","planner","afdelingsplanner","projectleider","medewerker_viewer","extern_viewer"].every(x => store.includes(x)));
add("Permissies bevatten planning/invite/resource/viewer scopes", ["planning_assign","invite_employee","view_resources","view_own_work","view_shared_readonly","print_export"].every(x => store.includes(x) && permissions.includes(x)));
add("Medewerker_viewer read-only afgedwongen", interaction.includes('role === "medewerker_viewer"') && interaction.includes("return false") && layers.includes("Read-only"));
add("Extern_viewer read-only afgedwongen", interaction.includes('role === "extern_viewer"'));
add("Invitefunctie bewaart tokenHash", interaction.includes("tokenHash") && interaction.includes("portalInvites") && interaction.includes("expiresAt") && interaction.includes("revokedAt"));
add("Plain token wordt niet opgeslagen of gelogd", !/token\s*:\s*token|console\.(log|info|warn|error)\([^)]*token/i.test(interaction));
add("Mailconfigfout is eerlijk aanwezig", interaction.includes("mail_config_missing") && layers.includes("Geen fake succes") && layers.includes("mailprovider/env"));
add("Medewerker uitnodigen knop aanwezig", layers.includes("Medewerker uitnodigen") && layers.includes("data-invite-resource"));
add("Tokens intrekken aanwezig", layers.includes("Token intrekken") && layers.includes("revokedAt"));
add("Medewerkerportaal toont alleen eigen/read-only werk", layers.includes("Mijn werk") && layers.includes("alleen eigen werkzaamheden") && layers.includes("geen drag/drop, geen edit"));
add("Printbare dag/weekoverzichten aanwezig", layers.includes("Print dag") && layers.includes("Print week"));
add("Algemene print gebruikt hidden iframe", ui.includes('document.createElement("iframe")') && ui.includes("frame.contentWindow.print()"));
add("Capaciteit print gebruikt hidden iframe", capacityPrint.includes('document.createElement("iframe")') && capacityPrint.includes("iframe.contentWindow.print()"));
add("Read-only portal bevat geen CWS.save", !/CWS\.save/.test(layers));
add("Geen hardcoded secrets", !/(api[_-]?key|secret|password)\s*[:=]\s*['"][^'"]+['"]/i.test(interaction + layers));
add("Geen destructieve calls in rollen/invite/printcode", !/clearAll|resetDemo|fetch\s*\([^)]*(PUT|POST)/s.test(interaction + layers + capacityPrint));
add("Package registreert preflight:roles-invites-print", pkg.scripts?.["preflight:roles-invites-print"] === "node scripts/v180-roles-invites-print-preflight.mjs");

let ok = 0;
for(const [name, pass] of checks){
  console.log(`${pass ? "OK" : "FOUT"} - ${name}`);
  if(pass) ok += 1;
}
if(ok !== checks.length){
  console.error(`${ok}/${checks.length} controles OK.`);
  process.exit(1);
}
console.log(`${ok}/${checks.length} controles OK.`);
