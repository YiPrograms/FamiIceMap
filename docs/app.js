const DATA_URL = "./data/stores.json";
const PAGE_SIZE = 24;
const TAIWAN_CENTER = [23.72, 120.97];
const TAIWAN_BOUNDS = [
  [21.7, 118.0],
  [26.6, 122.6]
];

const state = {
  stores: [],
  filteredStores: [],
  filter: "all",
  city: "all",
  query: "",
  mode: "map",
  page: 1,
  map: null,
  markerLayer: null,
  markerRenderer: null,
  markersById: new Map()
};

const elements = {
  heroCount: document.querySelector("#hero-count"),
  countAll: document.querySelector("#count-all"),
  countSingle: document.querySelector("#count-single"),
  countDouble: document.querySelector("#count-double"),
  countSpecial: document.querySelector("#count-special"),
  searchInput: document.querySelector("#search-input"),
  citySelect: document.querySelector("#city-select"),
  resetButton: document.querySelector("#reset-button"),
  resultsSummary: document.querySelector("#results-summary"),
  updatedAt: document.querySelector("#updated-at"),
  errorMessage: document.querySelector("#error-message"),
  mapView: document.querySelector("#map-view"),
  listView: document.querySelector("#list-view"),
  storeList: document.querySelector("#store-list"),
  pagination: document.querySelector("#pagination"),
  previousPage: document.querySelector("#previous-page"),
  nextPage: document.querySelector("#next-page"),
  pageStatus: document.querySelector("#page-status")
};

const numberFormatter = new Intl.NumberFormat("zh-TW");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeSearchText(value) {
  return String(value)
    .normalize("NFKC")
    .toLocaleLowerCase("zh-Hant")
    .replaceAll("臺", "台")
    .replaceAll("巿", "市")
    .replace(/\s+/g, "");
}

function formatCount(value) {
  return `${numberFormatter.format(value)} 間`;
}

function directionsUrl(store) {
  const query = encodeURIComponent(`${store.name} ${store.address}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function phoneUrl(phone) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

function getStoreLabels(store) {
  const labels = [];
  if (store.machine === "single") labels.push({ label: "單口味", className: "single" });
  if (store.machine === "double") labels.push({ label: "雙口味", className: "double" });
  if (store.specialShape) labels.push({ label: "特殊造型", className: "special" });
  return labels;
}

function getMarkerStyle(store) {
  if (store.specialShape) return { color: "#a85714", fillColor: "#f2a25f" };
  if (store.machine === "double") return { color: "#12698e", fillColor: "#2086b1" };
  return { color: "#075d47", fillColor: "#0c785c" };
}

function matchesType(store) {
  if (state.filter === "all") return true;
  if (state.filter === "special") return store.specialShape;
  return store.machine === state.filter;
}

function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  const requestedFilter = params.get("type");
  const requestedMode = params.get("view");

  if (["all", "single", "double", "special"].includes(requestedFilter)) {
    state.filter = requestedFilter;
  }
  if (["map", "list"].includes(requestedMode)) state.mode = requestedMode;

  state.city = params.get("city") || "all";
  state.query = params.get("q") || "";
}

function writeUrlState() {
  const params = new URLSearchParams();
  if (state.filter !== "all") params.set("type", state.filter);
  if (state.city !== "all") params.set("city", state.city);
  if (state.query) params.set("q", state.query);
  if (state.mode !== "map") params.set("view", state.mode);
  const query = params.toString();
  history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
}

function syncControls() {
  document.querySelectorAll("[data-filter]").forEach((button) => {
    const isActive = button.dataset.filter === state.filter;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  document.querySelectorAll("[data-mode]").forEach((button) => {
    const isActive = button.dataset.mode === state.mode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  elements.searchInput.value = state.query;
  elements.citySelect.value = state.city;
  elements.mapView.hidden = state.mode !== "map";
  elements.listView.hidden = state.mode !== "list";
}

function populateCitySelect() {
  const cities = [...new Set(state.stores.map((store) => store.city))];
  const collator = new Intl.Collator("zh-Hant");
  cities.sort(collator.compare);

  for (const city of cities) {
    const option = document.createElement("option");
    option.value = city;
    option.textContent = city;
    elements.citySelect.append(option);
  }

  if (!cities.includes(state.city)) state.city = "all";
}

function renderCounts(metadata) {
  elements.heroCount.textContent = numberFormatter.format(metadata.count);
  elements.countAll.textContent = formatCount(metadata.count);
  elements.countSingle.textContent = formatCount(metadata.counts.single);
  elements.countDouble.textContent = formatCount(metadata.counts.double);
  elements.countSpecial.textContent = formatCount(metadata.counts.specialShape);

  const date = new Date(metadata.updatedAt);
  const formattedDate = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
  elements.updatedAt.textContent = `資料更新時間：${formattedDate}`;
}

function initializeMap() {
  if (!window.L) throw new Error("Leaflet failed to load");

  state.map = L.map("map", {
    center: TAIWAN_CENTER,
    zoom: 7,
    minZoom: 6,
    maxZoom: 18,
    maxBounds: TAIWAN_BOUNDS,
    preferCanvas: true,
    zoomControl: false
  });

  L.control.zoom({ position: "topright" }).addTo(state.map);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(state.map);

  state.markerRenderer = L.canvas({ padding: 0.5 });
  state.markerLayer = L.layerGroup().addTo(state.map);
}

function createPopup(store) {
  const labels = getStoreLabels(store)
    .map((item) => `<span class="tag ${item.className}">${item.label}</span>`)
    .join("");
  const phoneAction = store.phone
    ? `<a href="${phoneUrl(store.phone)}">致電門市</a>`
    : "";

  return `
    <article class="popup-card">
      <div class="tag-row">${labels}</div>
      <h3>${escapeHtml(store.name)}</h3>
      <p>${escapeHtml(store.address)}<br />店號 ${escapeHtml(store.id)}</p>
      <div class="popup-actions">
        <a href="${directionsUrl(store)}" target="_blank" rel="noreferrer">開啟導航 ↗</a>
        ${phoneAction}
      </div>
    </article>`;
}

function renderMap({ fitMap = false } = {}) {
  if (!state.map) return;
  state.markerLayer.clearLayers();
  state.markersById.clear();

  const bounds = [];
  for (const store of state.filteredStores) {
    const style = getMarkerStyle(store);
    const marker = L.circleMarker([store.latitude, store.longitude], {
      renderer: state.markerRenderer,
      radius: store.specialShape ? 6 : 5,
      weight: 1.5,
      color: style.color,
      fillColor: style.fillColor,
      fillOpacity: 0.84
    });
    marker.bindPopup(() => createPopup(store), { maxWidth: 290 });
    marker.addTo(state.markerLayer);
    state.markersById.set(store.id, marker);
    bounds.push([store.latitude, store.longitude]);
  }

  if (fitMap && bounds.length) {
    state.map.fitBounds(bounds, { padding: [35, 35], maxZoom: 13 });
  }
}

function renderStoreCard(store) {
  const labels = getStoreLabels(store)
    .map((item) => `<span class="tag ${item.className}">${item.label}</span>`)
    .join("");
  const phoneAction = store.phone
    ? `<a href="${phoneUrl(store.phone)}">☎ ${escapeHtml(store.phone)}</a>`
    : "";

  return `
    <article class="store-card">
      <div class="store-card-top">
        <h3>${escapeHtml(store.name)}</h3>
        <span class="store-id">#${escapeHtml(store.id)}</span>
      </div>
      <p class="store-address">${escapeHtml(store.address)}</p>
      <div class="tag-row">${labels}</div>
      <div class="store-actions">
        <button class="primary-action" type="button" data-show-on-map="${escapeHtml(store.id)}">地圖查看</button>
        <a href="${directionsUrl(store)}" target="_blank" rel="noreferrer">導航 ↗</a>
        ${phoneAction}
      </div>
    </article>`;
}

function renderList() {
  const totalPages = Math.max(1, Math.ceil(state.filteredStores.length / PAGE_SIZE));
  if (state.page > totalPages) state.page = totalPages;
  const start = (state.page - 1) * PAGE_SIZE;
  const pageStores = state.filteredStores.slice(start, start + PAGE_SIZE);

  if (!pageStores.length) {
    elements.storeList.innerHTML = `
      <div class="empty-state">
        <strong>這次沒有找到符合的門市</strong>
        <span>換個店名、地址或篩選條件再試試看。</span>
      </div>`;
  } else {
    elements.storeList.innerHTML = pageStores.map(renderStoreCard).join("");
  }

  elements.pagination.hidden = state.filteredStores.length <= PAGE_SIZE;
  elements.pageStatus.textContent = `第 ${state.page} / ${totalPages} 頁`;
  elements.previousPage.disabled = state.page <= 1;
  elements.nextPage.disabled = state.page >= totalPages;
}

function applyFilters({ fitMap = false } = {}) {
  const normalizedQuery = normalizeSearchText(state.query);
  state.filteredStores = state.stores.filter((store) => {
    const matchesCity = state.city === "all" || store.city === state.city;
    const searchable = normalizeSearchText(`${store.name}${store.address}${store.id}`);
    const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery);
    return matchesType(store) && matchesCity && matchesQuery;
  });

  state.page = 1;
  const scope = state.city === "all" ? "全台" : state.city;
  elements.resultsSummary.textContent = `${scope}找到 ${formatCount(state.filteredStores.length)}符合門市`;
  syncControls();
  writeUrlState();
  renderMap({ fitMap });
  renderList();
}

function setMode(mode) {
  state.mode = mode;
  syncControls();
  writeUrlState();
  if (mode === "map" && state.map) {
    requestAnimationFrame(() => state.map.invalidateSize());
  }
}

function showStoreOnMap(storeId) {
  setMode("map");
  const store = state.stores.find((item) => item.id === storeId);
  const marker = state.markersById.get(storeId);
  if (!store || !marker) return;

  requestAnimationFrame(() => {
    state.map.setView([store.latitude, store.longitude], 16);
    marker.openPopup();
    elements.mapView.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

function bindEvents() {
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      applyFilters({ fitMap: true });
    });
  });

  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });

  elements.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim();
    applyFilters();
  });

  elements.citySelect.addEventListener("change", (event) => {
    state.city = event.target.value;
    applyFilters({ fitMap: true });
  });

  elements.resetButton.addEventListener("click", () => {
    state.filter = "all";
    state.city = "all";
    state.query = "";
    applyFilters({ fitMap: true });
  });

  elements.previousPage.addEventListener("click", () => {
    state.page -= 1;
    renderList();
    elements.listView.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  elements.nextPage.addEventListener("click", () => {
    state.page += 1;
    renderList();
    elements.listView.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  elements.storeList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-show-on-map]");
    if (button) showStoreOnMap(button.dataset.showOnMap);
  });
}

async function start() {
  readUrlState();
  bindEvents();

  try {
    const response = await fetch(DATA_URL, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    state.stores = payload.stores;
    renderCounts(payload.metadata);
    populateCitySelect();
    initializeMap();
    applyFilters({ fitMap: state.city !== "all" || state.filter !== "all" });
    setMode(state.mode);
  } catch (error) {
    console.error(error);
    elements.errorMessage.hidden = false;
    elements.resultsSummary.textContent = "資料載入失敗";
    elements.mapView.hidden = true;
  }
}

start();
