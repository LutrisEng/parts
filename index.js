import rawData from "./dist.js";
import spdxLicenses from "spdx-license-data";
import spdxParse from "spdx-expression-parse";
import { marked } from "marked";
import structuredClone from "@ungap/structured-clone";

const { projects: rawProjects, vendors: rawVendors } = rawData;

function addRaw(obj) {
  obj.raw = structuredClone(obj);
}

function denormalizeProject(project) {
  addRaw(project);
  project.projects = {};
  project.parts = {};
  for (const subproject of project.projectList) {
    denormalizeProject(subproject);
    project.projects[subproject.id] = subproject;
  }
  for (const part of project.partList) {
    denormalizePart(part);
    project.projects[part.partNumber] = part;
  }
  projectList.push(project);
  partList.push(...project.partList);
  if (project.readme) {
    project.readmeHTML = marked.parse(project.readme);
  }
}

function resolveVendor(id) {
  if (vendors[id]) {
    return vendors[id];
  } else {
    throw new Error(`Invalid vendor ${id}`);
  }
}

function resolvePart(id) {
  if (parts[id]) {
    return parts[id];
  } else {
    throw new Error(`Invalid part number ${id}`);
  }
}

function denormalizePart(part) {
  addRaw(part);
  for (const file of part.files ?? []) {
    denormalizeFile(file);
  }
  if (part.vendor) {
    part.vendorID = part.vendor;
    part.vendor = resolveVendor(part.vendorID);
  }
  if (part.readme) {
    part.readmeHTML = marked.parse(part.readme);
  }
}

const partReferences = [["manufacturing", "material"]];

function denormalizePartPass2(part) {
  for (const referencePath of partReferences) {
    let parent = null;
    let current = part;
    for (const portion of referencePath) {
      parent = current;
      current = current[portion];
      if (!current) {
        break;
      }
    }
    if (current) {
      parent[referencePath[referencePath.length - 1]] = resolvePart(current);
    }
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

function denormalizeFile(file) {
  if (file.license) {
    Object.defineProperty(file, "licenseText", {
      get() {
        const licenses = allReferencedLicenses(spdxParse(file.license));
        let licenseText = "LICENSES\n";
        for (const license of licenses) {
          const licenseInfo = spdxLicenses.find((info) => info.id === license);
          if (licenseInfo) {
            licenseText += `---
    ${license}
    ${licenseInfo.text}`;
          } else {
            licenseText += `---
    Couldn't find license text for ${license}
    `;
          }
        }
        return licenseText;
      },
    });
  }
}

export const projectList = [];
export const partList = [];
export const vendorList = rawVendors;
export const vendors = {};
export const projects = {};
export const topLevelProjects = {};
export const parts = {};

for (const vendor of vendorList) {
  vendors[vendor.id] = vendor;
}

for (const project of rawProjects) {
  denormalizeProject(project);
}

for (const project of projectList) {
  projects[project.id] = project;
}

for (const project of rawProjects) {
  topLevelProjects[project.id] = project;
}

for (const part of partList) {
  parts[part.partNumber] = part;
  denormalizePartPass2(part);
}
