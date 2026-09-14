# AGENTS.md - AI Agent Automated Execution Guide 🤖

This document provides explicit, structured, and non-interactive instructions for AI coding assistants (such as Antigravity, Claude Code, Cursor, Aider, GitHub Copilot) to inspect, launch, and execute this repository autonomously.

---

## 📌 Architecture & Prerequisites

- **Runtime**: Node.js >= 20.0.0 (uses built-in `fetch` and global `WebSocket`).
- **Dependencies**: 0 external npm packages. No `npm install` required.
- **Protocol**: Chrome DevTools Protocol (CDP) on default port `9222`.
- **Target URL**: `https://istudy.ntut.edu.tw/learn/index.php`

---

## ⚡ Step-by-Step Autonomous Workflow for Agents

### Step 1: Verify Node.js Environment
```bash
node -v
```
**Assertion**: Must return `v20.0.0` or higher. If not installed, see [README.md](README.md#2-安裝-nodejs-推薦-lts-穩定版).

---

### Step 2: Check or Launch Google Chrome with CDP
Before running the downloader, verify if Chrome is already listening on port `9222`:

```bash
curl -s http://127.0.0.1:9222/json/version
```

- **If HTTP 200 returned**: Chrome is already ready. Proceed to Step 3.
- **If connection refused**: Launch Chrome in the background according to host OS:

#### macOS
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/Library/Application Support/Google/Chrome-iStudy" \
  "https://istudy.ntut.edu.tw/learn/index.php" >/dev/null 2>&1 &
```

#### Windows (PowerShell / CMD)
```cmd
start chrome.exe --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\Chrome-iStudy" "https://istudy.ntut.edu.tw/learn/index.php"
```

#### Linux
```bash
google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.config/chrome-istudy" "https://istudy.ntut.edu.tw/learn/index.php" >/dev/null 2>&1 &
```

---

### Step 3: Verify User Authentication
NTUT iStudy requires student Single Sign-On (SSO) and Captcha. The user must complete login manually in the opened Chrome window.

To verify login programmatically from the agent:
```bash
curl -s http://127.0.0.1:9222/json/list | grep -i "istudy.ntut.edu.tw/learn/index.php"
```
When this returns a valid tab target, authentication is complete.

---

### Step 4: Run the Downloader (Non-Interactive CLI Flags)

Agents should **NEVER** use interactive prompts. Use explicit CLI flags:

#### Option A: Download All Enrolled Courses (`--all` or `-a`)
```bash
node index.mjs --all
```

#### Option B: Download Specific Courses by Index (`--courses` or `-c`)
```bash
# Downloads courses #1 and #2 from the detected course menu
node index.mjs -c 1,2
```

#### Option C: Pass via Environment Variable
```bash
COURSES=all node index.mjs
```

---

## 📂 Output Artifacts & Verification

After execution, files are saved in the workspace root:

```text
./downloads/
├── <Course_Name_1>/
│   ├── <Chapter_Title>.pdf
│   └── 課程外部資源與錄影連結.md
└── <Course_Name_2>/
    ├── <Slide_Deck>.pdf
    └── 課程外部資源與錄影連結.md
```

### Agent Verification Commands
To verify downloaded documents and links:
```bash
ls -lh ./downloads/*/*.pdf
cat ./downloads/*/課程外部資源與錄影連結.md
```

---

## ⚠️ Critical Constraints for AI Agents

1. **DO NOT commit `./downloads/`**: The `.gitignore` excludes all `.pdf` and `downloads/` directories. Never force-add copyrighted slides to git.
2. **DO NOT run `npm install`**: There are zero npm dependencies.
3. **DO NOT kill the user's Chrome**: The Chrome instance retains the user's active session cookie.
