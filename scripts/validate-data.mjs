import { readFile } from "node:fs/promises";

const dataPath = new URL("../docs/data/stores.json", import.meta.url);
const payload = JSON.parse(await readFile(dataPath, "utf8"));
const { metadata, stores } = payload;

const failures = [];

if (!metadata || !Array.isArray(stores)) failures.push("資料缺少 metadata 或 stores");
if (stores.length < 1_800) failures.push(`門市數量異常：${stores.length}`);
if (new Set(stores.map((store) => store.id)).size !== stores.length) failures.push("店號不唯一");
if (metadata?.count !== stores.length) failures.push("metadata.count 與門市數量不符");

for (const store of stores) {
  if (!store.id || !store.name || !store.address || !store.city) {
    failures.push(`門市欄位不完整：${store.id || "未知店號"}`);
    break;
  }

  if (!Array.isArray(store.services)) {
    failures.push(`門市服務欄位缺失：${store.id}`);
    break;
  }

  if (!Number.isFinite(store.latitude) || !Number.isFinite(store.longitude)) {
    failures.push(`門市座標無效：${store.id}`);
    break;
  }

  if (!['single', 'double', 'unknown'].includes(store.machine)) {
    failures.push(`門市分類無效：${store.id}`);
    break;
  }
}

if (failures.length) {
  throw new Error(`資料驗證失敗：\n- ${failures.join("\n- ")}`);
}

console.log(`資料驗證通過：${stores.length} 間門市，更新於 ${metadata.updatedAt}`);
