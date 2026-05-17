const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "..", "js", "trip-data.js");
const s = fs.readFileSync(src, "utf8");
const marker = "window.WANDERLUX_TRIP_CATALOG = ";
const start = s.indexOf(marker);
if (start < 0) throw new Error("catalog marker not found");

let i = s.indexOf("{", start);
let depth = 0;
let j = i;
for (; j < s.length; j++) {
  const c = s[j];
  if (c === "{") depth++;
  else if (c === "}") {
    depth--;
    if (depth === 0) {
      j++;
      break;
    }
  }
}

const expr = s.slice(i, j);
const obj = Function('"use strict"; return (' + expr + ")")();
const outDir = path.join(__dirname, "..", "data");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "catalog.json");
fs.writeFileSync(outFile, JSON.stringify(obj, null, 2));
console.log("Wrote", outFile, "keys:", Object.keys(obj).join(", "));
