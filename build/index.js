import { mkdir, readFile, writeFile, readdir, stat } from "fs/promises";
import { exit } from "process";
import { basename, join } from "path";
import { parse } from "yaml";
import { build } from "esbuild";
import { pnpPlugin } from "@yarnpkg/esbuild-plugin-pnp";
import spdxLicenses from "spdx-license-data";
import spdxParse from "spdx-expression-parse";
import { marked } from "marked";

function escape(unsafe) {
  return unsafe
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function entryType(entry) {
  const stats = await stat(entry);
  if (stats.isDirectory()) {
    return "project";
  } else if (entry.endsWith(".part.yml")) {
    return "part";
  } else if (entry.endsWith("README.md")) {
    return "readme";
  } else if (entry.endsWith(".part.md")) {
    return "partReadme";
  }
}

async function readPart(path) {
  const contents = await readFile(path);
  return parse(contents.toString("utf-8"));
}

function partNameToNumber(parent, name) {
  const prefix = "LUTRIS.";
  if (parent) {
    return `${prefix}${parent}.${name}`;
  } else {
    return prefix + name;
  }
}

function allReferencedLicenses(spdxTree) {
  if (spdxTree.license) {
    return [spdxTree.license];
  } else {
    return [
      ...allReferencedLicenses(spdxTree.left),
      ...allReferencedLicenses(spdxTree.right),
    ];
  }
}

const seenLicenses = {};
const seenParts = [];

async function readProject(path, parent = null) {
  const entries = await readdir(path);
  const id = (parent ? `${parent}.` : "") + basename(path);
  const project = {
    id,
    projectList: [],
    partList: [],
  };
  const partReadmes = new Map();
  await Promise.all(
    entries.map(async (entry) => {
      const fullEntry = join(path, entry);
      const type = await entryType(fullEntry);
      switch (type) {
        case "project":
          project.projectList.push(await readProject(fullEntry, id));
          break;
        case "part":
          const part = await readPart(fullEntry);
          part.partNumber = partNameToNumber(
            id,
            basename(entry).replace(/\.part\.yml$/, "")
          );
          if (part.files) {
            for (const file of part.files) {
              if (file.ipfs) {
                file.url = `https://cf-ipfs.com/ipfs/${file.ipfs}`;
                if (file.filename) {
                  file.url += `?filename=${encodeURIComponent(file.filename)}`;
                }
              }
              if (file.license) {
                file.licenses = allReferencedLicenses(spdxParse(file.license));
                for (const license of file.licenses) {
                  if (!seenLicenses[license]) {
                    seenLicenses[license] = spdxLicenses.find(
                      (info) => info.id === license
                    ).text;
                  }
                }
              }
            }
          }
          project.partList.push(part);
          seenParts.push(part);
          break;
        case "readme":
          project.readme = (await readFile(fullEntry)).toString("utf-8");
          break;
        case "partReadme":
          const partNumber = partNameToNumber(
            id,
            basename(entry).replace(/\.part\.md$/, "")
          );
          partReadmes.set(
            partNumber,
            (await readFile(fullEntry)).toString("utf-8")
          );
          break;
      }
    })
  );
  if (project.readme) {
    project.readmeHTML = marked.parse(project.readme);
  }
  const parts = [];
  for (const part of project.partList) {
    parts[part.partNumber] = part;
  }
  for (const [partNumber, readme] of partReadmes.entries()) {
    parts[partNumber].readme = readme;
  }
  return project;
}

const projectEntries = await readdir("./projects");
const projects = await Promise.all(
  projectEntries.map((entry) => readProject(join("./projects", entry)))
);

for (const part of seenParts) {
  if (part.readme) {
    part.readmeHTML = marked.parse(part.readme);
  }
}

async function readVendor(path) {
  return {
    ...parse((await readFile(path)).toString("utf-8")),
    id: basename(path).replace(/\.yml$/, ""),
  };
}

const vendorEntries = await readdir("./vendors");
const vendors = await Promise.all(
  vendorEntries.map((entry) => readVendor(join("./vendors", entry)))
);

const json = JSON.stringify(
  { projects, vendors, licenses: seenLicenses },
  null,
  2
);
await writeFile("dist.json", json);
await writeFile("dist.js", `export default ${json};`);
try {
  // Ensure the new file loads properly
  const denormalized = await import("..");
  await writeFile("denormalized.json", JSON.stringify(denormalized, null, 2));
} catch (e) {
  console.error("Newly generated file fails to load!");
  console.error(e);
  exit(1);
}
await mkdir("public", { recursive: true });
await writeFile("public/parts.json", json);
await writeFile(
  "public/index.html",
  `<html><body><h1><code>import * from "https://parts.lutris.engineering/parts.js";</code></h1><pre><code>${escape(
    json
  )}</code></pre><script type="module">import * as parts from "./parts.js"; for (const [k, v] of Object.entries(parts)) window[k] = v</script></body></html>`
);
await build({
  entryPoints: ["worker.js"],
  bundle: true,
  outfile: "worker.dist.js",
  plugins: [pnpPlugin()],
});
await build({
  entryPoints: ["index.js"],
  bundle: true,
  minify: true,
  outfile: "public/parts.js",
  plugins: [pnpPlugin()],
  format: "esm",
});
