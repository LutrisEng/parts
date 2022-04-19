import fetch from "node-fetch";
import { env, exit } from "process";

import { partList } from "..";

const token = env["PINATA_TOKEN"];

if (!token) {
  console.error("Missing Pinata token");
  exit(1);
}

let exitCode = 0;

async function pin(file) {
  if (file.ipfs) {
    const cid = file.ipfs;
    console.log("Pinning", file);
    const response = await fetch("https://api.pinata.cloud/psa/pins", {
      method: "POST",
      body: JSON.stringify({
        cid,
        name: file.filename,
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      const json = await response.json();
      if (
        response.status === 400 &&
        json.error?.reason === "DUPLICATE_OBJECT"
      ) {
        console.warn(cid, "was already pinned");
      } else {
        console.error("Got a", response.status, "error pinning", file);
        console.error(json);
        exitCode = 1;
      }
    }
  }
}

await Promise.all(
  partList.map(
    async (part) =>
      await Promise.all(
        (part.files ?? []).map(async (file) => {
          await pin(file);
        })
      )
  )
);

exit(exitCode);
