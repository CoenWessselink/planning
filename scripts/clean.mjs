import { rm } from "node:fs/promises";

for (const target of ["dist", "test-results", "playwright-report", "playwright-artifacts", ".wrangler/tmp"]) {
  await rm(target, { recursive:true, force:true });
}
console.log("Tijdelijke build- en testoutput verwijderd.");
