import { readFileSync } from "node:fs";

const read = file => readFileSync(file, "utf8");
let failed = false;
function check(label, pass, detail="") {
  console.log(`${pass ? "OK" : "FAIL"} - ${label}${detail ? `: ${detail}` : ""}`);
  if(!pass) failed = true;
}

const pkg = JSON.parse(read("package.json"));
const gantt = read("layers/laag4_gantt.html");

const finishMatch = gantt.match(/function finishPointerMutation\(event, cancelled=false\)\{([\s\S]*?)\r?\n    \}\r?\n    window\.addEventListener\("pointerup"/);
const finishBody = finishMatch?.[1] || "";
const beforeSave = finishBody.split(/const result\s*=\s*saveModel/)[0] || finishBody;
const afterSave = finishBody.split(/const result\s*=\s*saveModel/)[1] || "";
const subscriberMatch = gantt.match(/CWS\.subscribe\(\(\)=>\{([\s\S]*?)\}\); let resizeTimer/);
const subscriberBody = subscriberMatch?.[1] || "";

check("package bevat preflight:v75", pkg.scripts?.["preflight:v75"] === "node scripts/v75-gantt-pointer-lifecycle-preflight.mjs");
check("V75 lifecycle marker aanwezig", /v75PointerLifecycleFix/.test(gantt) && /_lastPointerLifecycleFix:\"v75\"/.test(gantt));
check("UI bevat suppressie- en finishing-flags", /_suppressSubscriberRender:false/.test(gantt) && /_finishingPointerMutation:false/.test(gantt) && /_pendingSubscriberRender:false/.test(gantt));
check("subscriber respecteert suppressie/finishing/drag", /UI\._suppressSubscriberRender/.test(subscriberBody) && /UI\._finishingPointerMutation/.test(subscriberBody) && /UI\.drag/.test(subscriberBody) && /return;/.test(subscriberBody));
check("finishPointerMutation gevonden", Boolean(finishMatch));
check("UI.drag wordt niet vóór saveModel gewist", !/UI\.drag\s*=\s*null\s*;/.test(beforeSave), "drag blijft actief tijdens saveModel subscriber-notify");
check("saveModel wordt onder suppressievlag uitgevoerd", /UI\._suppressSubscriberRender\s*=\s*true/.test(beforeSave) && /UI\._suppressSubscriberRender\s*=\s*false/.test(afterSave));
check("v75 metadata gaat mee met saveModel", /v75PointerLifecycleFix:true/.test(finishBody));
check("cleanup in finally zet flags terug", /finally\s*\{[\s\S]*UI\._suppressSubscriberRender\s*=\s*false[\s\S]*UI\._finishingPointerMutation\s*=\s*false[\s\S]*UI\.drag\s*=\s*null[\s\S]*render\(\)/.test(finishBody));
check("oude directe subscriber-render is verdwenen", !/CWS\.subscribe\(\(\)=>\{render\(\);\}\)/.test(gantt));
check("V74 performancefix blijft aanwezig", /requestAnimationFrame/.test(gantt) && /deferPersistence:true/.test(gantt) && /v74DragResizeFreezeFix:true/.test(gantt));
check("bar pointerdown en window pointermove/pointerup lifecycle aanwezig", /\.bar"\)\.forEach[\s\S]{0,1800}addEventListener\("pointerdown"/.test(gantt) && /window\.addEventListener\("pointermove"[\s\S]*passive:false/.test(gantt) && /window\.addEventListener\("pointerup",event=>finishPointerMutation\(event,false\)\)/.test(gantt));
check("pointercancel en blur ruimen zonder save op", /window\.addEventListener\("pointercancel",event=>finishPointerMutation\(event,true\)\)/.test(gantt) && /window\.addEventListener\("blur",\(\)=>\{ if\(UI\.drag\) finishPointerMutation\(\{ pointerId:UI\.drag\.pointerId \}, true\); \}\)/.test(gantt));
check("movement threshold scheidt klik van drag", /GANTT_POINTER_MOVE_THRESHOLD_PX\s*=\s*4/.test(gantt) && /drag\.moved\s*=\s*true/.test(gantt) && /!drag\.tempSchedule \|\| !drag\.moved/.test(finishBody));
check("click/dblclick na drag wordt kort onderdrukt", /_lastDragClickSuppressUntil/.test(gantt) && /Date\.now\(\)\+350/.test(finishBody));
check("labels en raster-overlays eten geen pointer events", /\.bar-label,\s*\.bar-text-before,\s*\.bar-text-after,\s*\.day-grid-line,\s*\.nonwork-shade\{pointer-events:none!important\}/.test(gantt) && /\.bar:not\(\.summary\) \.handle\{pointer-events:auto;min-width:14px;z-index:20\}/.test(gantt));
check("development/test diagnostiek zonder productiespam", /function ganttDebug/.test(gantt) && /debugGantt/.test(gantt) && /console\.debug\("\[gantt:pointer\]"/.test(gantt));

if(failed) process.exit(1);
console.log("V75 Gantt pointer lifecycle preflight geslaagd.");
