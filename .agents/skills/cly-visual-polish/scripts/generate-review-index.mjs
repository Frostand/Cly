import { readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const directory = path.resolve(process.argv[2] ?? "artifacts/ui-review/final");
const images = readdirSync(directory)
  .filter((file) => file.endsWith(".png"))
  .sort();
const body = images
  .map(
    (file) =>
      `<figure><img src="${file}" loading="lazy"><figcaption>${file}</figcaption></figure>`,
  )
  .join("\n");
writeFileSync(
  path.join(directory, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>Cly UI review</title><style>body{background:#111;color:#ddd;font:13px system-ui}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:16px}img{width:100%;border:1px solid #333}figure{margin:0}figcaption{padding:6px}</style><main>${body}</main>`,
);
console.log(`Indexed ${images.length} screenshots in ${directory}`);
