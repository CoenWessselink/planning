import { readFile } from "node:fs/promises";

const [indexHtml, renderer, bridge, packageJsonText] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../js/core/gantt_print_a3_bouwplanning.js", import.meta.url), "utf8"),
  readFile(new URL("../js/core/gantt_print_bws_css.js", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
]);

const checks = [
  ["renderer marker V140", renderer.includes("CWS_BWS_PRINT_A3_RENDERER_V140")],
  ["single full-page SVG", renderer.includes('width="408mm" height="285mm"') && renderer.includes("fullPageSvg:true")],
  ["bars drawn as SVG rects", renderer.includes('stroke="#000" stroke-width="0.32"') && renderer.includes('fill="${color(x.r,x.i)}"')],
  ["calendar drawn in SVG", renderer.includes("drawCalendar") && renderer.includes("segments(d.days,type)")],
  ["no browser popup", !renderer.includes("window.open") && renderer.includes("cwsBwsA3PrintFrame")],
  ["DOM date/bar fallback", renderer.includes("domSchedule") && renderer.includes("#tableRows tr[data-id]") && renderer.includes(".bar[data-id]")],
  ["missing schedule hydration", renderer.includes("hydrate") && renderer.includes("generated:true")],
  ["BWS required columns", ["Regel", "Naam", "Bouwkundig"].every((needle) => renderer.includes(needle))],
  ["A3 landscape page", renderer.includes("@page{size:A3 landscape;margin:6mm;}")],
  ["read-only renderer", !/CWS\.(setState|mutate|save|clearAll|resetDemo)|fetch\s*\(/.test(renderer)],
  ["bridge injects V140", bridge.includes("gantt_print_a3_bouwplanning.js?v=140") && bridge.includes("CWS_BWS_PRINT_A3_RENDERER_V140")],
  ["index loads bridge", indexHtml.includes("js/core/gantt_print_bws_css.js")],
  ["package script registered", packageJsonText.includes('"preflight:v136"')],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? "OK" : "FAIL"} ${name}`);
if (failed.length) {
  throw new Error(`V140 BWS A3 full-page SVG print preflight mislukt: ${failed.map(([name]) => name).join(", ")}`);
}
console.log("v140 BWS A3 full-page SVG print preflight OK");
