export const SOURCE_PAGE =
  "https://www.family.com.tw/Marketing/storemap/inquiry_iceCream.aspx";

export const API_ENDPOINT = "https://api.map.com.tw/net/familyShop.aspx";
export const API_KEY = "6F30E8BF706D653965BDE302661D1241F8BE9EBC";

export const CITY_ORDER = [
  "基隆市",
  "台北市",
  "新北市",
  "桃園市",
  "新竹市",
  "新竹縣",
  "苗栗縣",
  "台中市",
  "彰化縣",
  "南投縣",
  "雲林縣",
  "嘉義市",
  "嘉義縣",
  "台南市",
  "高雄市",
  "屏東縣",
  "宜蘭縣",
  "花蓮縣",
  "台東縣",
  "澎湖縣",
  "金門縣",
  "連江縣"
];

export function parseJsonp(body) {
  const text = body.replace(/^\uFEFF/, "").trim();
  const firstParen = text.indexOf("(");
  const lastParen = text.lastIndexOf(")");

  if (firstParen < 1 || lastParen <= firstParen) {
    throw new Error("官方端點回傳了無法辨識的 JSONP 格式");
  }

  return JSON.parse(text.slice(firstParen + 1, lastParen));
}

export function getServices(rawServices) {
  return String(rawServices ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function classifyStore(rawServices) {
  const services = getServices(rawServices);
  let machine = "unknown";

  if (services.includes("twoice")) machine = "double";
  else if (services.includes("icecream")) machine = "single";

  return {
    machine,
    specialShape: services.includes("famiice")
  };
}

export function cityFromAddress(address) {
  return String(address ?? "").slice(0, 3);
}

export function normalizeStore(raw, cityOverride) {
  const classification = classifyStore(raw.all);
  const latitude = Number(raw.py);
  const longitude = Number(raw.px);

  if (!raw.pkey || !raw.NAME || !raw.addr) {
    throw new Error("門市資料缺少店號、名稱或地址");
  }

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error(`門市 ${raw.pkey} 缺少有效座標`);
  }

  return {
    id: String(raw.pkey).padStart(6, "0"),
    serviceId: String(Math.trunc(Number(raw.SERID))).padStart(5, "0"),
    name: String(raw.NAME).trim(),
    address: String(raw.addr).trim(),
    city: cityOverride || cityFromAddress(raw.addr),
    postalCode: String(raw.post ?? ""),
    phone: String(raw.TEL ?? "").trim(),
    latitude,
    longitude,
    machine: classification.machine,
    specialShape: classification.specialShape
  };
}

export function buildMetadata(stores, updatedAt = new Date().toISOString()) {
  return {
    updatedAt,
    source: SOURCE_PAGE,
    count: stores.length,
    counts: {
      single: stores.filter((store) => store.machine === "single").length,
      double: stores.filter((store) => store.machine === "double").length,
      specialShape: stores.filter((store) => store.specialShape).length,
      unclassified: stores.filter((store) => store.machine === "unknown").length
    }
  };
}
