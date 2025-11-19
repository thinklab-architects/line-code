# line-code 法規紀錄

這個專案會擷取高雄市建築師公會官網「法規訊息」頁面，整理成單頁應用程式，方便部署到 GitHub Pages。

## 主要功能

- 透過 
pm run fetch 自動下載最新法規清單，並且解析各條文的附件與相關網址
- 支援快速搜尋條文主旨、發文字號、發文單位與附件檔名
- 依發文時間自動分成「最新 / 近期 / 較早」三種狀態，並提供排序選項
- 響應式版面，可直接部署到 GitHub Pages

## 使用方式

1. 安裝相依套件：
   `ash
   npm install
   `
2. 擷取最新資料：
   `ash
   npm run fetch
   `
   產出的 public/data/documents.json 會被前端直接載入。
3. 本地預覽：
   `ash
   npx serve public
   `
4. 發布到 GitHub Pages 時，可將 public 目錄指定為 Pages 的根目錄。

> 若要自動更新資料，可設定排程（例如 GitHub Actions）定期執行 
pm run fetch 後重新部署。
