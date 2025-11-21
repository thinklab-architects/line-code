# line-code 法規紀錄

這個專案會擷取高雄市建築師公會官網「法規訊息」，彙整成可掛在 GitHub Pages 上的單頁應用程式。

## 主要功能

- `npm run fetch` 會下載法規列表並解析每一條的附件、相關網址與條文內容
- 介面支援搜尋主旨、字號、發文單位、附件檔名與條文內容
- 依發文時間自動分類為「最新 / 近期 / 較早 / 未備日期」，並提供多種排序方式
- 響應式 UI，可直接部署在 GitHub Pages（使用 `docs/` 為根目錄）

## 使用方式

1. 安裝相依套件
   ```bash
   npm install
   ```
2. 擷取最新資料（會逐頁抓取 3,800+ 筆法規與附件，約需 6~7 分鐘；結果會寫入 `docs/data/documents.json`，前端載入即更新，可視需求設定排程每小時執行）
   ```bash
   npm run fetch
   ```
   - 若只想跑部分頁面，可透過環境變數（例如 `FETCH_MAX_PAGES=2`、`DETAIL_CONCURRENCY=1`）控制，本倉庫排程預設只跑前 2 頁以縮短時間。
3. 本地預覽
   ```bash
   npx serve docs
   ```
4. GitHub Pages 設定
   - Build and deployment > Source：`Deploy from a branch`
   - Branch：`master`（或你使用的主分支）
   - Folder：`/docs`

> 若要自動更新資料，可建立 GitHub Actions Workflow 定期執行 `npm run fetch` 再觸發 Pages 重新部署。
