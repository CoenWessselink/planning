import { readFile } from "node:fs/promises";

const [indexHtml, renderer, packageJsonText] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../js/core/gantt_print_a3_bouwplanning.js", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
]);

const checks = [
  ["index build marker V136", indexHtml.includes("CWS_UI_REBUILD_V136_BWS_A3_PRINT_RENDERER")],
  ["renderer loaded in index", indexHtml.includes("js/core/gantt_print_a3_bouwplanning.js?v=136")],
  ["renderer marker", renderer.includes("CWS_BWS_PRINT_A3_RENDERER_V136")],
  ["separate print window", renderer.includes("window.open") && renderer.includes("document.write")],
  ["BWS required columns", ["Regel", "Naam", "Bouwkundig"].every((needle) => renderer.includes(needle))],
  ["BWS required layout blocks", ["title-block", "planning-frame", "legend", "calendar-top", "calendar-bottom"].every((needle) => renderer.includes(needle))],
  ["A3 landscape page", renderer.includes("@page{size:A3 landscape;margin:6mm;}")],
  ["bottom calendar inverted", renderer.includes('calendar(d.days,"bottom")') && renderer.includes('pos==="bottom"')],
  ["screen Gantt safe interception", renderer.includes("bridge") && renderer.includes("inject") && renderer.includes("installIframe")],
  ["read-only renderer", !/CWS\.(setState|mutate|save|clearAll|resetDemo)|fetch\s*\(/.test(renderer)],
  ["package script registered", packageJsonText.includes('"preflight:v136"')],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? "OK" : "FAIL"} ${name}`);
if (failed.length) {
  throw new Error(`V136 BWS A3 print renderer preflight mislukt: ${failed.map(([name]) => name).join(", ")}`);
}
console.log("v136 BWS A3 print renderer preflight OK");
