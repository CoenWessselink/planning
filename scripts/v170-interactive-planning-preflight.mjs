import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const router = read("js/core/router.js");
const interaction = read("js/core/interactive_planning.js");
const layers = read("js/core/complete_prompt_layers.js");

const conflictTypes = [
  "OVER_CAPACITY",
  "DOUBLE_BOOKED_EMPLOYEE",
  "DOUBLE_BOOKED_EQUIPMENT",
  "DOUBLE_BOOKED_TOOL",
  "OUTSIDE_WORKING_HOURS",
  "NON_WORKING_DAY",
  "OUTSIDE_GANTT_RANGE",
  "DEPENDENCY_NOT_DONE",
  "MATERIAL_NOT_AVAILABLE",
  "DRAWING_NOT_RELEASED",
  "MISSING_RESOURCE",
  "MISSING_EQUIPMENT",
  "MISSING_TOOL",
  "TASK_OVERDUE",
  "UNSCHEDULED_HOURS",
  "D1_SYNC_RISK"
];

const checks = [];
const add = (name, pass) => checks.push([name, !!pass]);

add("Afdelingsplanning routes aanwezig", ["afdelingsplanning-maand","afdelingsplanning-week","afdelingsplanning-dag"].every(x => router.includes(x)));
add("Werkvoorraad/resources/conflicten routes aanwezig", ["werkvoorraad","resources","conflicten"].every(x => router.includes(x)));
add("Generiek contextmenu manager aanwezig", interaction.includes("showContextMenu") && interaction.includes("cws-context-menu"));
add("Generieke modal manager aanwezig", interaction.includes("openModal"));
add("Long-press ondersteuning aanwezig", interaction.includes("bindLongPress") && interaction.includes("touchstart"));
add("Drag/drop utilities aanwezig", layers.includes("dragstart") && layers.includes("dragover") && layers.includes("drop"));
add("PlanningAssignments datamodel aanwezig", interaction.includes("planningAssignments") && interaction.includes("employeeIds") && interaction.includes("equipmentIds") && interaction.includes("toolIds"));
add("ResourceAvailability datamodel aanwezig", interaction.includes("resourceAvailability"));
add("Maand/week/dag renderers aanwezig", ["monthPlanning","weekPlanning","dayPlanning"].every(x => layers.includes(`function ${x}`)));
add("Dagplanning heeft resource-fallback zonder kolomoverlap", layers.includes("dayResources") && layers.includes("grid-template-columns:92px") && layers.includes("Geen resources ingericht"));
add("Werkvoorraad render aanwezig", layers.includes("renderWorkload") && layers.includes("Wacht op materiaal") && layers.includes("Zonder medewerker/materieel/gereedschap"));
add("Resources planbaar types aanwezig", ["employee","team","equipment","tool","vehicle","workspace","machine","external"].every(x => interaction.includes(x)));
add("Conflict types volledig geregistreerd", conflictTypes.every(x => interaction.includes(x)));
add("Drilldown routes vanuit planning aanwezig", ["gantt","capaciteit","projecten","afdelingsplanning-week","afdelingsplanning-dag"].every(x => layers.includes(x) || interaction.includes(x)));
add("Viewerrollen blokkeren drag/drop edit", interaction.includes('role === "medewerker_viewer"') && interaction.includes('role === "extern_viewer"') && layers.includes('draggable="${CP().canEdit()}"'));
add("Geen destructieve calls in interactieve planning", !/clearAll|resetDemo|fetch\s*\([^)]*(PUT|POST)/s.test(interaction + layers));
add("Package registreert preflight:interactive-planning", pkg.scripts?.["preflight:interactive-planning"] === "node scripts/v170-interactive-planning-preflight.mjs");

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
