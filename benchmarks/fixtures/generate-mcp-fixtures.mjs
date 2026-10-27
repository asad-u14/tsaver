// Generates two realistic MCP-shaped JSON fixtures without needing a live
// network call at benchmark time: an array-shaped response (like a search
// result list) and an object-keyed response (like a package registry's
// per-version map) — the two shapes that behave differently in
// mcpCompact.ts, so both need their own benchmark scenario.
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const arrayShaped = {
  total: 250,
  results: Array.from({ length: 250 }, (_, i) => ({
    id: `pkg-${i}`,
    name: `example-package-${i}`,
    version: `1.${i % 10}.${i % 5}`,
    description: "A small utility package used in many real-world projects for common tasks.",
    keywords: ["utility", "helper", "tools"],
  })),
};

const objectShaped = {
  name: "express",
  "dist-tags": { latest: "4.18.2" },
  versions: Object.fromEntries(
    Array.from({ length: 290 }, (_, i) => {
      const v = `${Math.floor(i / 100)}.${Math.floor(i / 10) % 10}.${i % 10}`;
      return [
        v,
        {
          name: "express",
          version: v,
          dist: { tarball: `https://registry.npmjs.org/express/-/express-${v}.tgz`, shasum: "a".repeat(40) },
          dependencies: { accepts: "~1.3.8", "body-parser": "1.20.1", cookie: "0.5.0" },
        },
      ];
    }),
  ),
};

writeFileSync(join(here, "mcp-array.json"), JSON.stringify(arrayShaped));
writeFileSync(join(here, "mcp-object.json"), JSON.stringify(objectShaped));
console.log("Wrote mcp-array.json and mcp-object.json");
