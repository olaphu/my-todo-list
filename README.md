# 我的待辦清單

使用原生 HTML、CSS 與 JavaScript 建立的繁體中文待辦清單網站，不需要後端、資料庫或安裝套件。

## 如何執行

建議使用本機 HTTP 伺服器。在專案目錄執行：

```bash
python3 -m http.server 8000
```

接著用瀏覽器開啟 `http://localhost:8000`。按 `Ctrl+C` 停止伺服器。也可直接開啟 `index.html`，但各瀏覽器對本機檔案的 localStorage 支援不同，建議使用上述方式。

## 使用方式

- 輸入待辦事項，按「新增」或 Enter（最多 200 字，不能只有空白）。
- 勾選事項表示完成，再次取消勾選可取消完成。
- 按「刪除」移除事項。
- 資料自動儲存在目前瀏覽器的 localStorage，重新整理後保留。
- 支援手機、電腦與鍵盤操作。

資料不會跨裝置或瀏覽器同步；清除網站資料也會移除清單。請勿將此網站當成重要資料的唯一備份。無法讀取或儲存資料時，介面會顯示提醒。

## 專案檔案

- `index.html`：繁體中文頁面結構、輸入表單與清單。
- `style.css`：響應式版面、完成狀態與鍵盤焦點樣式。
- `script.js`：新增、完成、取消完成、刪除、資料驗證與 localStorage 儲存。

## 驗證方式

JavaScript 語法檢查：

```bash
node --check script.js
```

開啟網站後，依序新增事項、勾選完成、取消完成、重新整理、刪除，再以手機尺寸確認版面。重新整理後應保留事項與完成狀態；輸入 HTML 應顯示為純文字。

## 分類、期限與進度

新增任務時可選擇工作、生活或學習分類，以及高、中、低優先順序；截止日期可留空。分類選單只篩選顯示內容，完成進度仍計算全部任務。高、中、低優先順序以不同顏色及文字標示。

截止日期依瀏覽器的本地日期判斷，當天不算逾期；超過截止日期且尚未完成才顯示「逾期未完成」。頁面每分鐘更新提醒。

沿用 `my-todo-list.v1` 儲存鍵。舊任務的內容、識別碼及完成狀態保留；缺少欄位時預設為生活分類、中優先順序、無截止日期。讀取時不覆寫原始資料，下次新增、勾選或刪除才儲存補齊的欄位。

## GitHub Pages 部署

仍是純靜態網站，無需建置。程式碼經審查合併到 `main` 後，在 GitHub 儲存庫的 Settings → Pages 選擇 Deploy from a branch，分支 `main`、資料夾 `/ (root)`。若已採用此設定，合併後會沿用既有部署方式。

CSS 與 JavaScript 使用相對路徑，適用於 `https://olaphu.github.io/my-todo-list/`。請維持原本網域及瀏覽器使用，以便存取既有 localStorage；不同來源的資料不會自動轉移。本次開發不會變更 Pages 設定。

## 第三版：Supabase 會員與雲端任務

尚未設定 Supabase 時，畫面會明確提示，本機模式仍保留第二版功能。未登入使用 `my-todo-list.v1`；登入後只顯示目前帳號的 `public.tasks`，不會把本機任務混進雲端清單。登出此瀏覽器後回到本機清單。雲端清單需使用「重新載入雲端清單」取得其他裝置的最新變更，尚未提供即時訂閱或離線同步。

### 公開設定與資料表

編輯根目錄 `supabase-config.js`，將空白 `url`、`key` 分別填入 Supabase 後台的 HTTPS Project URL 與 **publishable key 或 anon key**。空白不是正式設定。程式會拒絕明顯範例網址、secret key 及 role 不是 anon 的 JWT。此版本使用標準 `https://專案識別碼.supabase.co` 網址。

這兩個設定會公開在 GitHub 與瀏覽器。**禁止填入 service_role、secret key、資料庫密碼或 SMTP 密碼**。使用者密碼僅交給 SDK 執行 Auth；程式不另行儲存或記錄密碼。SDK 自行管理登入 Session，請勿分享其 Token。本機備份可能含私人任務，請自行妥善保存。

目前預期表結構如下，請在接上正式專案前核對；本程式不執行 SQL、不修改政策：

- `id`：UUID 主鍵或唯一欄位，允許客戶端提供 UUID。
- `user_id`：UUID，對應 Auth 使用者；所有操作由 RLS 限制 `auth.uid() = user_id`。
- `title`：文字；`category` 可接受「工作／生活／學習」；`priority` 可接受「高／中／低」。若資料庫使用 enum，需包含這些值。
- `due_date`：可為 null 的 date；`is_completed`：boolean。
- `created_at`：具有資料庫時間預設值；前端不提供此欄位。

確認 authenticated 角色可在 RLS 控制下使用四種操作，INSERT／UPDATE 的 WITH CHECK 防止冒用或改成別人的 user_id。前端附加使用者查詢條件僅協助隔離，真正授權必須由 RLS 執行；不得關閉 RLS 排除錯誤。

SDK v2 固定為 `@supabase/supabase-js@2.49.1`，透過 jsDelivr ES module 動態載入；不需 npm 建置。瀏覽器需能連線 `cdn.jsdelivr.net`（及其模組依賴）與你的 Supabase HTTPS 專案。CDN 或網路失敗會提示錯誤，本機模式仍可使用。

### Email 註冊與回呼

在 Supabase Authentication 設定啟用 Email provider 與 Confirm email。將 Site URL 設為正式網站 `https://olaphu.github.io/my-todo-list/`，並在 Redirect URLs 加入同一完整網址與實際開發網址，例如 `http://localhost:8000/`。若使用 `127.0.0.1` 或其他連接埠，也要分別加入。不要用廣泛的正式回呼萬用字元。

註冊會將目前頁面所在目錄作為 `emailRedirectTo`；收到確認信後開啟連結回到網站。此靜態版使用 SDK implicit callback，SDK 處理 URL fragment，之後移除地址列中的 Auth Token。沒有 Session 時只提示查收確認信，不會視為已登入。若 Email 已確認但未自動登入，可使用 Email 與密碼登入。請在 Supabase 後台確認寄信設定、限額及信件送達；自訂 SMTP 憑證只放後台。

### 舊資料匯入

登入後列出本機預覽、任務數量與目前 Email。必須先下載備份，再勾選確認歸屬，才允許匯入。**原本 localStorage 不清除、不自動覆寫**。舊資料缺少欄位時使用生活、中、無日期；本機資料格式損壞時停止本機持久化與匯入，避免破壞原資料。

匯入 ID 由 Project URL 與原始本機 ID 產生穩定 UUID，以資料庫唯一約束防止重複。寫入前保存在此瀏覽器的帳號歸屬紀錄，寫入後查詢核對內容再標記完成。網路中斷可重試，內容衝突會停止且不覆寫；已完成匯入的任務不再次同步本機內容，也不重新建立雲端已刪除的任務。

匯入歸屬紀錄以專案與任務 ID 區分，已歸屬其他帳號的任務不允許匯入。此紀錄是操作保護，不是資料庫權限機制；清除網站資料會失去紀錄，跨瀏覽器也不共享。舊任務本身沒有帳號資訊，仍必須由使用者確認擁有者。多個裝置／分頁同時匯入可能產生 ID 衝突，RLS 與唯一約束會阻止覆寫；出現衝突應人工核對，而非更換 ID 強行匯入。

### 測試與目前限制

語法及差異檢查：

```bash
node --check script.js
node --check supabase-client.js
node --check task-store.js
node --check supabase-config.js
git diff --check
```

提供 `tests/browser.cjs` 自動化測試。需要 Python 3、Playwright 與 Chromium；執行 `node tests/browser.cjs`。測試自行在專案根目錄啟動 8765 埠伺服器，Chromium 預設 `/usr/bin/chromium`，可用 `CHROMIUM_PATH` 指定。若要安裝測試工具，可在專案外安裝 Playwright 並設定 `NODE_PATH`，避免為部署增加框架或建置需求。

自動化雲端測試**使用模擬 SDK，不是實際 Supabase RLS 測試**。涵蓋本機資料回歸、舊資料、缺失設定、Email 確認提示、登入／登出、雲端 CRUD 與寫入失敗、欄位轉換、匯入確認／備份／重試防重複、帳號切換隔離與響應式版面。

正式啟用前仍需真人或授權整合測試：

1. 真實註冊、寄信、Email 確認回呼、登入、重新整理恢復 Session、到期與登出。
2. 真實 tasks CRUD、欄位型別／約束、匯入與網路中斷重試。
3. 使用兩個測試帳號 A／B 的一般使用者 Session：B 讀不到 A 的任務；B 更新或刪除 A 的任務後，A 的資料仍不變；B 不能用 A 的 user_id 新增任務或轉移所有權。匿名使用者也不得讀寫會員任務。
4. 真實手機、Safari／Firefox 與線上 GitHub Pages 回呼。

不得使用 service_role 來完成上述 RLS 測試，也不能將回傳零筆資料誤認為更新成功。本程式對單筆雲端變更要求返回實際資料才報成功。
