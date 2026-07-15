import { mkdir, writeFile } from "node:fs/promises";
import {
  API_ENDPOINT,
  API_KEY,
  CITY_ORDER,
  SOURCE_PAGE,
  buildMetadata,
  normalizeStore,
  parseJsonp
} from "./lib/store-data.mjs";

const outputPath = new URL("../docs/data/stores.json", import.meta.url);
const requestHeaders = {
  Accept: "text/javascript, application/javascript, application/json;q=0.9, */*;q=0.8",
  Referer: SOURCE_PAGE,
  "User-Agent": "FamiIceMap data updater (+GitHub Actions)"
};

async function fetchJsonp(params, retries = 5) {
  const url = new URL(API_ENDPOINT);
  url.search = new URLSearchParams({
    ...params,
    fun: "famiIceMapCallback",
    key: API_KEY
  });

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: requestHeaders,
        signal: AbortSignal.timeout(30_000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return parseJsonp(await response.text());
    } catch (error) {
      if (attempt === retries) {
        const location = [url.searchParams.get("city"), url.searchParams.get("area")]
          .filter(Boolean)
          .join(" ");
        throw new Error(`讀取 ${location || "縣市清單"} 失敗`, {
          cause: error
        });
      }

      await new Promise((resolve) => setTimeout(resolve, attempt * 1_500));
    }
  }

  return [];
}

async function fetchCities() {
  const cities = await fetchJsonp({ searchType: "ShowCityList", type: "ice" });
  const available = new Set(cities.map((item) => item.city));
  return CITY_ORDER.filter((city) => available.has(city));
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const cities = await fetchCities();

if (cities.length < 20) {
  throw new Error(`官方端點只回傳 ${cities.length} 個縣市，為避免覆蓋正常資料，本次停止更新`);
}

// Whole-city responses are capped at 20 records. Fetch each administrative
// district to avoid silently publishing partial data. The official service keeps
// standard machines (`ice`) and special-shape machines (`Famiice`) in separate
// groups, so both groups must be fetched and merged.
async function fetchStoresByType(type) {
  const townsByCity = await mapWithConcurrency(cities, 4, async (city) => {
    const towns = await fetchJsonp({
      searchType: "ShowTownList",
      type,
      city
    });
    return towns.map((town) => ({ city, town: town.town }));
  });

  const districts = townsByCity.flat();
  const districtStores = await mapWithConcurrency(districts, 2, async ({ city, town }) => {
    const rawStores = await fetchJsonp({
      searchType: "ShopList",
      type,
      city,
      area: town,
      road: ""
    });
    return rawStores.map((rawStore) => {
      const store = normalizeStore(rawStore, city);
      if (type.toLowerCase() === "famiice") store.specialShape = true;
      return store;
    });
  });

  return districtStores.flat();
}

const standardStores = await fetchStoresByType("ice");
const specialShapeStores = await fetchStoresByType("Famiice");

const storesById = new Map();
for (const store of [...standardStores, ...specialShapeStores]) {
  const existing = storesById.get(store.id);
  if (existing) {
    store.specialShape ||= existing.specialShape;
    if (store.machine === "unknown") store.machine = existing.machine;
  }
  storesById.set(store.id, store);
}

const stores = [...storesById.values()].sort((a, b) => {
  const cityDifference = CITY_ORDER.indexOf(a.city) - CITY_ORDER.indexOf(b.city);
  return cityDifference || a.address.localeCompare(b.address, "zh-Hant");
});

if (stores.length < 1_800) {
  throw new Error(`官方端點只回傳 ${stores.length} 間門市，為避免覆蓋正常資料，本次停止更新`);
}

const payload = {
  metadata: buildMetadata(stores),
  stores
};

await mkdir(new URL("../docs/data/", import.meta.url), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(`完成：寫入 ${stores.length} 間門市至 docs/data/stores.json`);
