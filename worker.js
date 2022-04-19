import { getAssetFromKV } from "@cloudflare/kv-asset-handler";
import { parts } from ".";

addEventListener("fetch", (event) => {
  event.respondWith(handleEvent(event));
});

const fileTemplate = (file) =>
  `<li><a href="${file.filename}">${file.filename}</a></li>`;

const partTemplate = ({ part, partNumber }) => `<!DOCTYPE html>
<html>
  <head>
    <title>${part.name ?? partNumber}</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-1BmE4kWBq78iYhFldvKuhfTAU6auU8tT94WrHftjDbrCEXSU1oBoqyl2QvZ6jIW3" crossorigin="anonymous">
    <style>
      .partNumber {
        font-family: monospace;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Lutris Parts Database</h1>
      ${
        part.name
          ? `<h2>${part.name}</h2><h3 class="partNumber">${partNumber}</h3>`
          : `<h2 class="partNumber">${partNumber}</h2>`
      }
      <div class="accordion" id="accordion">
      <div class="accordion-item">
          <h2 class="accordion-header" id="jsonHeading">
            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#jsonCollapse" aria-expanded="false" aria-controls="jsonCollapse">
              JSON
            </button>
          </h2>
          <div id="jsonCollapse" class="p-3 accordion-collapse collapse" aria-labelledby="jsonHeading" data-bs-parent="#accordion">
            <pre><code>${JSON.stringify(part, null, 2)}</code></pre>
          </div>
        </div>
        <div class="accordion-item">
          <h2 class="accordion-header" id="rawJsonHeading">
            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#rawJsonCollapse" aria-expanded="false" aria-controls="rawJsonCollapse">
              Raw JSON
            </button>
          </h2>
          <div id="rawJsonCollapse" class="p-3 accordion-collapse collapse" aria-labelledby="rawJsonHeading" data-bs-parent="#accordion">
            <pre><code>${JSON.stringify(part.raw, null, 2)}</code></pre>
          </div>
        </div>
        ${
          (part.files ?? []).length === 0
            ? ""
            : `<div class="accordion-item">
        <h2 class="accordion-header" id="filesHeading">
          <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#filesCollapse" aria-expanded="false" aria-controls="filesCollapse">
            Files
          </button>
        </h2>
        <div id="filesCollapse" class="p-3 accordion-collapse collapse" aria-labelledby="filesHeading" data-bs-parent="#accordion">
          <ul>
            ${part.files.map(fileTemplate).join(" ")}
          </ul>
        </div>
      </div>`
        }
        ${
          part.readmeHTML
            ? `<div class="accordion-item">
          <h2 class="accordion-header" id="readmeHeading">
            <button class="accordion-button" type="button" data-bs-toggle="collapse" data-bs-target="#readmeCollapse" aria-expanded="true" aria-controls="readmeCollapse">
              README
            </button>
          </h2>
          <div id="readmeCollapse" class="p-3 accordion-collapse collapse show" aria-labelledby="readmeHeading" data-bs-parent="#accordion">
            ${part.readmeHTML}
          </div>
        </div>`
            : ""
        }
      </div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js" integrity="sha384-ka7Sk0Gln4gmtz2MlQnikT1wXgYsOg+OMhuP+IlRH9sENBO0LRn5q+8nbTov4+1p" crossorigin="anonymous"></script>
  </body>
</html>
`;

async function handleEvent(event) {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/parts/")) {
    const [_, __, partNumberMixedCase, filename] = url.pathname.split("/");
    const partNumber = partNumberMixedCase.toUpperCase();
    const part = parts[partNumber];
    if (!part) {
      return new Response(`Couldn't find part ${partNumber}`, { status: 404 });
    }
    if (!filename || filename === "") {
      return Response.redirect(
        `${event.request.url.replace(/\/$/, "")}/README.md`
      );
    }
    if (filename === "README.md") {
      return new Response(
        partTemplate({
          part,
          partNumber,
        }),
        {
          headers: {
            "Content-Type": "text/html",
          },
        }
      );
    }
    const file = (part.files ?? []).find((file) => file.filename === filename);
    if (!file) {
      return new Response(
        `Couldn't find file ${filename} in part ${partNumber}`,
        { status: 404 }
      );
    }
    if (!file.url) {
      return new Response(
        `File ${filename} in part ${partNumber} is missing a URL`,
        { status: 500 }
      );
    }
    return await fetch(file.url);
  }

  try {
    return await getAssetFromKV(event);
  } catch (e) {
    let pathname = new URL(event.request.url).pathname;
    return new Response(`"${pathname}" not found`, {
      status: 404,
      statusText: "not found",
    });
  }
}
