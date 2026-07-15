# 今天吃哪支？全台全家霜淇淋地圖

一個可直接部署到 GitHub Pages 的靜態網站，整理全台全家 Fami!ce 門市，提供：

- 單口味、雙口味、特殊造型門市篩選
- 縣市、店名與地址搜尋
- 地圖與列表兩種瀏覽模式
- 手機與桌面版響應式介面
- 每週三透過 GitHub Actions 重新取得官方資料

資料來源：[全家便利商店門市查詢](https://www.family.com.tw/Marketing/storemap/inquiry_iceCream.aspx)。門市設備與現場供應仍可能臨時異動，出發前建議致電門市確認。

## 本機預覽

專案不需要安裝前端套件。先驗證資料，再啟動任一靜態檔案伺服器：

```bash
npm test
npm run check
python3 -m http.server 8000 -d docs
```

瀏覽 `http://localhost:8000`。不要直接雙擊 `docs/index.html`，因為瀏覽器會阻擋本機檔案讀取 JSON。

## 更新門市資料

```bash
npm run update-data
npm run check
```

更新器會依縣市與行政區讀取官方 API，合併一般霜淇淋與特殊造型兩組資料，並在筆數過少、欄位不完整或座標無效時停止寫入。輸出位於 `docs/data/stores.json`。

## GitHub Pages 部署

1. 將 repository 的預設分支設為 `main`。
2. 到 **Settings → Pages → Build and deployment**，將 Source 設為 **GitHub Actions**。
3. Push 到 `main`，`Deploy GitHub Pages` workflow 會自動發布 `docs/`。

`Update store data` workflow 會在台灣時間每週三 20:30 執行，也可以從 Actions 頁面手動觸發。資料若成功更新，workflow 會提交新的 JSON，並在同一次執行中部署最新版網站。

## 專案結構

```text
docs/                         靜態網站與資料
scripts/update-stores.mjs     官方資料更新器
scripts/validate-data.mjs     發布前資料驗證
test/                         解析與分類測試
.github/workflows/            定期更新與 Pages 部署
```

地圖介面使用 [Leaflet](https://leafletjs.com/)，圖資來自 [OpenStreetMap](https://www.openstreetmap.org/copyright)。本站為非官方整理工具，未使用全家商標圖像。
