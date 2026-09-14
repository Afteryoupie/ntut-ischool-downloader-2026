# NTUT iStudy Downloader (北科大數位學園自動化教材下載器) 🎓

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-success.svg)](package.json)

專為**國立臺北科技大學 (NTUT)** 學生設計的 [iStudy 數位學園](https://istudy.ntut.edu.tw) 課程講義與線上錄影自動化下載/彙整工具。

傳統校園平台因安全防護（如 F5 WAF、動態驗證碼與 Single Sign-On SSO）常導致一般爬蟲失效；本專案採用 **Chrome DevTools Protocol (CDP)** 技術，直接與您本機登入後的真實 Chrome 瀏覽器通訊，達成 **「零帳密洩漏風險、100% 繞過 WAF 檢測、一鍵批量下載課程全部講義與線上錄影」**。

---

## ✨ 核心特色

- ⚡ **零套件依賴 (Zero Dependencies)**：基於 Node.js 原生 ES Modules 與內建 WebSocket，無需安裝重型 Playwright / Puppeteer，秒開即用。
- 🛡️ **安全無隱私疑慮**：由您本人在自己的 Chrome 瀏覽器正常登入校園入口網站或數位學園，程式碼不存取、不記錄任何帳號密碼。
- 📑 **智慧講義下載**：自動掃描各週教材樹狀目錄（IMS Manifest），精準提取高畫質 PDF 講義，並依課程名稱自動分門別類建檔。
- 🎬 **外部資源與錄影彙整**：針對教授上傳的線上錄影（如 iStream / 錄影串流）或外部共享資料夾（如 Dropbox / Google Drive），自動擷取直連網址並匯出為 `課程外部資源與錄影連結.md` 清單。
- 🔄 **智慧續傳機制**：自動比對已下載檔案與容量，重複執行時自動跳過已完成項目，省時省頻寬。
- 🖥️ **跨平台支援**：支援 macOS、Windows、Linux。

---

## 📋 系統需求與環境配置

本工具使用現代原生 Node.js 功能（內建 WebSocket 與 Fetch），需使用 **Node.js 20.0.0** 或以上版本。

### 1. 檢查是否已安裝 Node.js
請在終端機輸入：
```bash
node -v
```
- 若顯示 `v20.x.x` 或 `v22.x.x` 等 >= 20 的版本號，代表已就緒，可直接跳至下方「快速上手教學」。
- 若未安裝或版本過低，請參考以下方式安裝：

### 2. 安裝 Node.js (推薦 LTS 穩定版)

#### 🍏 macOS
- **使用 Homebrew (推薦)**：
  ```bash
  brew install node
  ```
- **官方安裝檔**：前往 [Node.js 繁體中文官網](https://nodejs.org/zh-tw/) 下載 macOS (`.pkg`) 安裝包雙擊安裝。

#### 🪟 Windows
- **使用 winget (命令提示字元或 PowerShell)**：
  ```cmd
  winget install OpenJS.NodeJS.LTS
  ```
- **官方安裝檔**：前往 [Node.js 官方網站](https://nodejs.org/zh-tw/) 下載 Windows (`.msi`) 安裝包安裝。

#### 🐧 Linux (Ubuntu / Debian)
```bash
# 使用 NodeSource 安裝最新 LTS 版本
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs
```

#### 💡 多版本管理 (nvm - 適用 macOS / Linux)
若您經常在不同專案切換版本，推薦使用 `nvm`：
```bash
# 1. 安裝 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# 2. 重新開啟終端機後安裝最新 LTS
nvm install --lts
nvm use --lts
```

---

## 🚀 快速上手教學

### 步驟 1：啟動附帶遠端偵錯通訊埠的 Chrome

請依據您的作業系統，在終端機（Terminal 或 PowerShell）執行對應指令啟動 Chrome：

#### 🍏 macOS
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir="$HOME/Library/Application Support/Google/Chrome-iStudy" "https://istudy.ntut.edu.tw/learn/index.php" &
```

#### 🪟 Windows (CMD 或 PowerShell)
```cmd
start chrome.exe --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\Chrome-iStudy" "https://istudy.ntut.edu.tw/learn/index.php"
```

#### 🐧 Linux
```bash
google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.config/chrome-istudy" "https://istudy.ntut.edu.tw/learn/index.php" &
```

---

### 步驟 2：在開啟的 Chrome 中完成登入

在彈出的 Chrome 視窗中，如同平時一般輸入帳密登入北科大入口網站，直到畫面成功進入 **iStudy 數位學園** 課程首頁。

---

### 步驟 3：執行下載工具

回到終端機專案目錄，執行：

```bash
npm start
# 或是直接執行：node index.mjs
```

程式將自動列出您本學期或歷年所有已修讀的課程名稱，例如：
```text
偵測到您目前修讀的課程清單：
  [1] 1151_材料科學與工程特論_366167
  [2] 1151_數值分析_365990
  [3] 1151_界面活性劑原理與應用_364453
  [4] 1151_專題研討_364435
  [A] 全部下載 (All)

請輸入欲下載的課程編號 (例如: 1 或 1,2,3 或 A 全部): 
```
輸入欲下載的課程編號或 `A`，程式便會自動依序切換課程並完成下載！

---

## 📁 下載目錄結構說明

下載完成後，所有檔案將按課程名稱分類存放於 `./downloads/` 目錄：

```text
downloads/
├── 1151_材料科學與工程特論_366167/
│   ├── ch00_MSE_overview_2026.pdf
│   ├── Callister ch01 intro jkchen.pdf
│   ├── Callister ch02 atomic bonding jkchen.pdf
│   └── 課程外部資源與錄影連結.md
└── 1151_數值分析_365990/
    ├── Syllabus_16.pdf
    ├── Ch01.pdf
    └── 課程外部資源與錄影連結.md
```

> **注意**：專案 `.gitignore` 預設已將 `downloads/` 排除，避免個人修課檔案或教授版權教材誤傳至公開版本庫。

---

## 🛠️ 開源推送到 GitHub 操作步驟

若您想將此工具開源到自己的 GitHub 帳號，請依照以下步驟操作：

1. **前往 GitHub 建立新儲存庫**：
   - 瀏覽 [https://github.com/new](https://github.com/new)
   - 輸入 Repository 名稱（例如：`ntut-istudy-downloader`）
   - 建議選擇 **Public**
   - 不要勾選 *Initialize with README*（因為本機已建立）
   - 點擊 **Create repository**

2. **在終端機將本機目錄初始化並推送到 GitHub**：
   ```bash
   # 1. 初始化 Git 版本庫
   git init

   # 2. 將專案原始碼加入暫存區
   git add .

   # 3. 提交第一個 Commit
   git commit -m "feat: initial commit of NTUT iStudy downloader"

   # 4. 建立 main 分支
   git branch -M main

   # 5. 關聯到您的 GitHub 儲存庫 (請將 YOUR_USERNAME 換成您的 GitHub 帳號)
   git remote add origin https://github.com/YOUR_USERNAME/ntut-istudy-downloader.git

   # 6. 推送至 GitHub
   git push -u origin main
   ```

---

## ⚖️ 免責聲明 (Disclaimer)

本專案僅供學術交流與個人離線閱讀課程講義之便利輔助使用。使用者應恪守著作權法及國立臺北科技大學校園網路使用規範，不得將下載之教材、錄影或檔案用於任何商業營利、未經授權之散布或侵害授課教師著作權之行為。

---

## 📄 授權條款 (License)

本專案採用 [MIT License](LICENSE) 授權。
