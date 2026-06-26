import { readFile } from "node:fs/promises";

const [indexHtml, finalRenderer, bridge, legacyRenderer, packageJsonText] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../js/core/gantt_print_bws_a3_final.js", import.meta.url), "utf8"),
  readFile(new URL("../js/core/gantt_print_bws_css.js", import.meta.url), "utf8"),
  readFile(new URL("../js/core/gantt_print_a3_bouwplanning.js", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
]);

const checks = [
  ["V145 final renderer marker", finalRenderer.includes("CWS_BWS_A3_PRINT_FINAL_V145_SSOT")],
  ["single full-page SVG", finalRenderer.includes('width="408mm" height="285mm"') && finalRenderer.includes("data-bws-marker")],
  ["bars drawn as SVG rects", finalRenderer.includes("data-taakbalken") && finalRenderer.includes('stroke="#000" stroke-width="0.32"')],
  ["calendar drawn in SVG", finalRenderer.includes("calendarSvg") && finalRenderer.includes("segments(data.range.days")],
  ["no browser popup", !finalRenderer.includes("window.open") && finalRenderer.includes("cwsBwsA3PrintFrame")],
  ["screen Gantt source is primary", finalRenderer.includes("getBwsPrintModel") && finalRenderer.includes("screen-gantt-getBwsPrintModel")],
  ["BWS required columns", ["Regel", "Naam", "Bouwkundig"].every(needle => finalRenderer.includes(needle))],
  ["A3 landscape page", finalRenderer.includes("@page { size: A3 landscape; margin: 6mm; }")],
  ["read-only renderer", !/CWS\.(setState|mutate|save|clearAll|resetDemo)|fetch\s*\(/.test(finalRenderer)],
  ["old bridge not active in index", !indexHtml.includes("js/core/gantt_print_bws_css.js")],
  ["old A3 renderer not active in index", !indexHtml.includes("js/core/gantt_print_a3_bouwplanning.js")],
  ["old final renderer not active in index", !indexHtml.includes("js/core/gantt_print_bws_final.js")],
  ["legacy files retained but inert", bridge.includes("CWS_BWS_PRINT_CSS") && legacyRenderer.includes("CWS_BWS_PRINT_A3_RENDERER")],
  ["package scripts registered", packageJsonText.includes('"preflight:v136"') && packageJsonText.includes('"preflight:v145"')],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? "OK" : "FAIL"} ${name}`);
if (failed.length) {
  throw new Error(`BWS A3 print compatibility preflight failed: ${failed.map(([name]) => name).join(", ")}`);
}
console.log("BWS A3 print compatibility preflight OK");
