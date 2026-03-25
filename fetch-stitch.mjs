#!/usr/bin/env node
import { StitchToolClient } from "@google/stitch-sdk";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

const API_KEY = process.env.STITCH_API_KEY;
const PROJECT_ID = "3881643013851982530";
const SCREENS = [
  { id: "488db51d34e440eeb255b2cc6ce79b37", name: "Final Multi-Agent Terminal Hub" },
  { id: "5c4568c5ee6342ec9f72bfb50a71c236", name: "Final Orchestration Center" },
  { id: "b5525957ccaa4f3d930d2fe6452eced9", name: "Final Project Dashboard" },
  { id: "0b87f4d9f1014da9b43a4213e061e07f", name: "Final Context & Rules Editor" },
  { id: "7d65996032974c0a8c65b565ebf113e1", name: "Final Deployment Manager" },
];

const OUT_DIR = join(process.cwd(), "stitch-export");

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  console.log(`  -> saved ${dest} (${buf.length} bytes)`);
}

async function main() {
  if (!API_KEY) {
    console.error("ERROR: Set STITCH_API_KEY environment variable.");
    process.exit(1);
  }

  // Try direct REST API with API key as query param
  const BASE = "https://stitch.googleapis.com/v1";
  await mkdir(OUT_DIR, { recursive: true });

  for (const { id, name } of SCREENS) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
    console.log(`\nFetching: ${name} (${id})`);

    const url = `${BASE}/projects/${PROJECT_ID}/screens/${id}?key=${API_KEY}`;
    console.log(`  GET ${BASE}/projects/${PROJECT_ID}/screens/${id}?key=***`);

    const res = await fetch(url);
    const body = await res.text();

    if (!res.ok) {
      console.error(`  ERROR ${res.status}: ${body.slice(0, 300)}`);
      // Try alternate endpoint pattern
      const alt = `${BASE}/projects/${PROJECT_ID}/screens/${id}:export?key=${API_KEY}`;
      const res2 = await fetch(alt);
      const body2 = await res2.text();
      if (!res2.ok) {
        console.error(`  ALT ERROR ${res2.status}: ${body2.slice(0, 300)}`);
        continue;
      }
      await writeFile(join(OUT_DIR, `${slug}-response.json`), body2);
      console.log(`  -> saved alt response`);
      continue;
    }

    // Parse response
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      await writeFile(join(OUT_DIR, `${slug}-raw.txt`), body);
      console.log(`  -> saved raw response (not JSON)`);
      continue;
    }

    await writeFile(join(OUT_DIR, `${slug}-response.json`), JSON.stringify(data, null, 2));
    console.log(`  -> saved response JSON`);

    // Try to extract download URLs
    const htmlUrl = data.htmlDownloadUrl || data.html_download_url || data.htmlUrl;
    const imgUrl = data.screenshotUrl || data.screenshot_url || data.imageUrl || data.thumbnailScreenshot?.downloadUrl;

    if (htmlUrl) {
      console.log(`  HTML URL: ${htmlUrl}`);
      await download(htmlUrl, join(OUT_DIR, `${slug}.html`));
    }
    if (imgUrl) {
      console.log(`  Image URL: ${imgUrl}`);
      await download(imgUrl, join(OUT_DIR, `${slug}.png`));
    }
  }

  console.log(`\nDone! Files saved to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
