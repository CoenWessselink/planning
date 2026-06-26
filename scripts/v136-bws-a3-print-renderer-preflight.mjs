import { readFile } from "node:fs/promises";

const [indexHtml, renderer, bridge, packageJsonText] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../js/core/gantt_print_a3_bouwplanning.js", import.meta.url), "utf8"),
  readFile(new URL("../js/core/gantt_print_bws_css.js", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
]);

const checks = [
  ["renderer marker V139", renderer.includes("CWS_BWS_PRINT_A3_RENDERER_V139")],
  ["SVG chart renderer", renderer.includes("svgChart") && renderer.includes("chart-svg")],
  ["SVG calendar renderer", renderer.includes("svgCalendar") && renderer.includes("cal-svg")],
  ["no browser popup", !renderer.includes("window.open") && renderer.includes("cwsBwsA3PrintFrame")],
  ["DOM date/bar fallback", renderer.includes("domSchedule") && renderer.includes("#tableRows tr[data-id]") && renderer.includes(".bar[data-id]")],
  ["missing schedule hydration", renderer.includes("hydrate") && renderer.includes("generated:true")],
  ["BWS required columns", ["Regel", "Naam", "Bouwkundig"].every((needle) => renderer.includes(needle))],
  ["A3 landscape page", renderer.includes("@page{size:A3 landscape;margin:6mm;}")],
  ["bottom calendar inverted", renderer.includes('svgCalendar(d,"bottom")')],
  ["read-only renderer", !/CWS\.(setState|mutate|save|clearAll|resetDemo)|fetch\s*\(/.test(renderer)],
  ["bridge injects V139", bridge.includes("gantt_print_a3_bouwplanning.js?v=139") && bridge.includes("CWS_BWS_PRINT_A3_RENDERER_V139")],
  ["index loads bridge", indexHtml.includes("js/core/gantt_print_bws_css.js")],
  ["package script registered", packageJsonText.includes('"preflight:v136"')],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? "OK" : "FAIL"} ${name}`);
if (failed.length) {
  throw new Error(`V139 BWS A3 SVG print preflight mislukt: ${failed.map(([name]) => name).join(", ")}`);
}
console.log("v139 BWS A3 SVG print preflight OK");
