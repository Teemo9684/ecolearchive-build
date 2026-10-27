import { readFileSync, readdirSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve("desktop/src-tauri/target/release/bundle/nsis");
const files = readdirSync(root);
const exe = files.find((f) => f.toLowerCase().endsWith(".exe"));
if (!exe || !files.includes(exe + ".sig")) throw Error("Signed NSIS installer and matching .sig are required");
const cfg = JSON.parse(readFileSync("desktop/src-tauri/tauri.conf.json", "utf8"));
const version = cfg.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error("Invalid release version");
const signature = readFileSync(resolve(root, exe + ".sig"),"utf8").trim();
if (signature.length < 50) throw Error("Missing valid installer signature");
const tag = "v" + version;
const assetName = `EcoleArchive-${version}-x64-setup.exe`;
const url = `https://github.com/Teemo9684/ecolearchive-updates/releases/download/${tag}/${assetName}`;
const manifest = {
 version,
 notes: "تحديث منظومة التسيير الإداري والأرشيف الرقمي",
 pub_date: new Date().toISOString(),
 platforms: { "windows-x86_64": { signature, url } },
};
mkdirSync("desktop/update-release", {recursive:true});
copyFileSync(resolve(root, exe), resolve("desktop/update-release", assetName));
copyFileSync(resolve(root, exe + ".sig"), resolve("desktop/update-release", assetName + ".sig"));
writeFileSync("desktop/update-release/latest.json",JSON.stringify(manifest,null,2)+"\n");
console.log(`Prepared signed release manifest for ${tag}; installer: ${exe}`);
