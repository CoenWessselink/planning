import fs from "node:fs";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const pkg = JSON.parse(read("package.json"));
const capacity = read("layers/laag5_capaciteit.html");
const store = read("js/core/store.js");

function check(label, ok) {
  if (!ok) throw new Error(`[preflight:v146] ${label}`);
  console.log(`OK - ${label}`);
}

check("package.json bevat preflight:v146", pkg.scripts?.["preflight:v146"] === "node scripts/v146-capacity-range-hours-preflight.mjs");
check("Capaciteit start standaard vandaag met 26 weken", capacity.includes("const UI={year:2026,week:15,weeks:26") && capacity.includes("const start=current") && capacity.includes("const end=addWeeks(current.year,current.week,25)"));
check("Toolbar bevat Na vandaag en 26 weken", capacity.includes('id="afterTodayBtn"') && capacity.includes(">Na vandaag<") && capacity.includes('data-weeks="26"'));
check("Mobiele capaciteit bevat Na vandaag en 26 weken", capacity.includes('id="mobileCapAfterToday"') && capacity.includes('data-mobile-cap-weeks="26"'));
check("Na vandaag zet periode op huidige week plus 26 weken", capacity.includes("const setAfterTodayRange=()=>") && capacity.includes("UI.weeks=26") && capacity.includes("todayWeek()"));
check("Capaciteitsprint is 3 weken terug tot 26 weken vooruit", capacity.includes("function capacityPrintWeeks(){") && capacity.includes("addWeeks(tw.year,tw.week,-3)") && capacity.includes("addWeeks(tw.year,tw.week,26)") && capacity.includes("3 weken terug t/m 26 weken vooruit"));
check("Verborgen printkop gebruikt altijd printweken", capacity.includes("const printWeeks=capacityPrintWeeks()") && capacity.includes("updatePrintHeader(printWeeks)") && capacity.includes("renderA0DayPrint(printWeeks)"));
check("Print en tabel blijven op geselecteerde afdeling filteren", capacity.includes("deptList(st).filter(d=>!UI.dept||d===UI.dept)") && capacity.includes("if(UI.dept) filterParts.push(`afdeling ${UI.dept}`)"));
check("Capaciteit dedupet bronregels voor dag/weektotalen", capacity.includes("dedupeCapacitySourceItems") && capacity.includes("capacitySourceKey(date, dept, item)") && capacity.includes("dedupeCapacitySourceItems(date,d,arr)"));
check("Store dedupet dubbele project-afdelingsuren", store.includes("getProjectDeptHoursRows") && store.includes("seen.has(key)") && store.includes("getProjectDeptHoursRows(st, projectId, dept).reduce"));

console.log("[preflight:v146] capacity range and hours checks OK");
