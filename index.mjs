#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";

const CDP_HTTP = process.env.CDP_HTTP || "http://127.0.0.1:9222";
const DOWNLOADS_DIR = path.join(os.homedir(), "Downloads");
const WORKSPACE_DIR = process.cwd();

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function ask(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans.trim());
  }));
}

async function getWsUrl() {
  const res = await fetch(`${CDP_HTTP}/json/list`);
  const list = await res.json();
  const target = list.find(t => t.url && (t.url.includes("istudy.ntut.edu.tw/learn/index.php") || t.url.includes("istudy.ntut.edu.tw")));
  if (!target) throw new Error("找不到 Chrome 中的 iStudy 頁面！");
  return target.webSocketDebuggerUrl;
}

class CDPClient {
  constructor() {
    this.ws = null;
    this.pending = new Map();
    this.idCounter = 1;
    this.pingInterval = null;
  }

  async connect() {
    const wsUrl = await getWsUrl();
    this.ws = new WebSocket(wsUrl);

    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };

    this.ws.onclose = () => {
      if (this.pingInterval) clearInterval(this.pingInterval);
      for (const [id, { reject }] of this.pending) {
        reject(new Error(`WebSocket 連線已斷開`));
      }
      this.pending.clear();
      this.ws = null;
    };

    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send("Browser.getVersion").catch(() => {});
      }
    }, 5000);
  }

  async ensureConnected() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }
  }

  async send(method, params = {}) {
    await this.ensureConnected();
    return new Promise((resolve, reject) => {
      const id = this.idCounter++;
      this.pending.set(id, { resolve, reject });
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (err) {
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  async evaluate(expression, awaitPromise = false) {
    try {
      const res = await this.send("Runtime.evaluate", {
        expression,
        awaitPromise,
        returnByValue: true
      });
      return res.result?.value;
    } catch (err) {
      await this.connect().catch(() => {});
      const res = await this.send("Runtime.evaluate", {
        expression,
        awaitPromise,
        returnByValue: true
      });
      return res.result?.value;
    }
  }

  close() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.ws) this.ws.close();
  }
}

function sanitizeFilename(name) {
  return name.replace(/[/\\?%*:|"<>]/g, "_").trim();
}

function saveLinkRecord(courseDir, courseName, record) {
  const linkFile = path.join(courseDir, "課程外部資源與錄影連結.md");
  let prefix = "";
  if (!fs.existsSync(linkFile)) {
    prefix = `# ${courseName} - 課程外部資源與錄影連結\n\n`;
    prefix += `擷取時間：${new Date().toLocaleString()}\n\n`;
    prefix += `| 項目名稱 | 類型 | 連結網址 |\n| :--- | :--- | :--- |\n`;
  } else {
    const existing = fs.readFileSync(linkFile, "utf8");
    if (existing.includes(record.url)) return;
  }
  const entry = prefix + `| ${record.title} | ${record.type} | [點此開啟連結](${record.url}) |\n`;
  fs.appendFileSync(linkFile, entry, "utf8");
  console.log(`  ✓ 已將外部連結儲存至 Markdown：${record.title} (${record.type})`);
}

async function waitForDownloadedFile(filename, initialMtime = 0, timeoutMs = 90000) {
  const startTime = Date.now();
  const targetPath = path.join(DOWNLOADS_DIR, filename);

  while (Date.now() - startTime < timeoutMs) {
    if (fs.existsSync(targetPath)) {
      const stat = fs.statSync(targetPath);
      if (stat.mtimeMs >= initialMtime && stat.size > 0) {
        await sleep(500);
        const stat2 = fs.statSync(targetPath);
        if (stat2.size === stat.size) {
          return targetPath;
        }
      }
    }
    const crPath = targetPath + ".crdownload";
    if (fs.existsSync(crPath)) {
      await sleep(1000);
      continue;
    }
    await sleep(400);
  }
  return null;
}

async function checkChromeConnection() {
  try {
    const res = await fetch(`${CDP_HTTP}/json/list`);
    const list = await res.json();
    const target = list.find(t => t.url && (t.url.includes("istudy.ntut.edu.tw") || t.url.includes("nportal.ntut.edu.tw")));
    return { ok: true, target, list };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function getAvailableCourses(client) {
  return await client.evaluate(`(() => {
    try {
      const sys = window.frames["mooc_sysbar"];
      const sel = sys ? sys.document.getElementById("selcourse") : null;
      if (!sel) return [];
      return Array.from(sel.options)
        .map(o => ({ id: o.value, name: o.text.trim() }))
        .filter(c => c.id !== "10000000" && c.name && c.name !== "我的課程");
    } catch(e) {
      return [];
    }
  })()`);
}

async function processCourse(client, course) {
  console.log(`\n======================================================`);
  console.log(`📚 正在處理課程：${course.name}`);
  console.log(`======================================================`);

  const courseDir = path.join(WORKSPACE_DIR, "downloads", sanitizeFilename(course.name));
  fs.mkdirSync(courseDir, { recursive: true });

  // 1. 重置 catalog 並切換課程
  await client.evaluate(`(() => {
    try { window.frames["s_catalog"].location.href = "about:blank"; } catch(e) {}
    window.chgCourse("${course.id}", 1, 1);
  })()`);
  console.log(`已切換至課程 ID: ${course.id}...`);

  // 2. 輪詢直到 mooc_sysbar 載入完成並點擊「教材及錄影」
  let clickedMat = false;
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    clickedMat = await client.evaluate(`(() => {
      try {
        const sys = window.frames["mooc_sysbar"];
        if (!sys || !sys.document) return false;
        const matLink = Array.from(sys.document.querySelectorAll("a")).find(a => a.innerText.includes("教材及錄影"));
        if (matLink) {
          matLink.click();
          return true;
        }
      } catch(e) {}
      return false;
    })()`);
    if (clickedMat) break;
  }

  if (clickedMat) {
    console.log(`已進入「教材及錄影」，等候教材目錄載入...`);
  }

  // 3. 等候 pathtree 與 xmlDoc 載入完成
  let treeReady = false;
  for (let i = 0; i < 25; i++) {
    await sleep(1000);
    treeReady = await client.evaluate(`(() => {
      try {
        const cat = window.frames["s_catalog"];
        if (!cat || !cat.location.href.includes("manifest.php")) return false;
        const tree = cat.frames["pathtree"] || cat.document.getElementById("pathtree")?.contentWindow;
        return !!(tree && tree.xmlDoc);
      } catch(e) {
        return false;
      }
    })()`);
    if (treeReady) break;
  }

  if (!treeReady) {
    console.log(`[提示] 此課程沒有教材目錄或尚未建置教材內容。`);
    return;
  }

  // 4. 解析 XML 教材清單
  const items = await client.evaluate(`(() => {
    try {
      const cat = window.frames["s_catalog"];
      const tree = cat ? (cat.frames["pathtree"] || cat.document.getElementById("pathtree")?.contentWindow) : null;
      if (!tree || !tree.xmlDoc) return [];
      return Array.from(tree.xmlDoc.getElementsByTagName("item")).map(it => {
        const ref = it.getAttribute("identifierref");
        const res = ref ? tree.xmlDoc.querySelector(\`resource[identifier="\${ref}"]\`) : null;
        return {
          id: it.getAttribute("identifier"),
          title: tree.getTitle(it).replace(/(<[^>]*>|^\\s+|\\s+$)/g, ""),
          ref: ref,
          href: res ? res.getAttribute("href") : null,
          target: it.getAttribute("target")
        };
      });
    } catch(e) {
      return [];
    }
  })()`);

  console.log(`共偵測到 ${items.length} 個單元項目：`);
  items.forEach((it, idx) => console.log(`  ${idx + 1}. ${it.title}`));

  if (items.length === 0) {
    console.log(`[提示] 此課程目錄無任何單元。`);
    return;
  }

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const safeTitle = sanitizeFilename(item.title);
    console.log(`\n[${idx + 1}/${items.length}] 處理單元：${item.title}`);

    try {
      const isVideoItem = item.title.includes("[錄]") || item.title.includes("錄影") || item.title.includes("影片");

      if (!isVideoItem) {
        const existingPdf = path.join(courseDir, safeTitle + ".pdf");
        const existingPdfUnderscore = path.join(courseDir, safeTitle.replace(/\s+/g, "_") + ".pdf");
        if (fs.existsSync(existingPdf) || fs.existsSync(existingPdfUnderscore)) {
          console.log(`  ✓ 檔案已存在，略過下載。`);
          continue;
        }
      }

      // 重置 s_main 的 DEFAULT_URL
      await client.evaluate(`(() => {
        try {
          const sm = window.frames["s_main"];
          if (sm) sm.DEFAULT_URL = null;
        } catch(e) {}
      })()`);

      // 觸發節點載入
      await client.evaluate(`(() => {
        try {
          const cat = window.frames["s_catalog"];
          const tree = cat ? (cat.frames["pathtree"] || cat.document.getElementById("pathtree")?.contentWindow) : null;
          const el = tree.document.getElementById("${item.id}") || Array.from(tree.document.querySelectorAll("a")).find(a => a.innerText.includes(${JSON.stringify(item.title)}));
          tree.launchActivity(el, "${item.id}", "s_main");
        } catch(e) {}
      })()`);

      if (isVideoItem) {
        await sleep(3000);
        const frameTree = await client.send("Page.getFrameTree");
        const smFrame = frameTree.frameTree.childFrames?.find(f => f.frame.name === "s_main");
        const videoUrl = smFrame?.frame?.url;

        if (videoUrl && videoUrl !== "about:blank") {
          saveLinkRecord(courseDir, course.name, { title: item.title, url: videoUrl, type: "線上錄影" });
        } else {
          console.log(`  [提示] 未能取得錄影網址。`);
        }
        continue;
      }

      // 輪詢 s_main 取得 PDF 或外部連結
      let pdfUrl = null;
      let externalLink = null;
      let externalType = "外部教材連結";

      for (let w = 0; w < 12; w++) {
        await sleep(1000);
        const pollRes = await client.evaluate(`(() => {
          try {
            const sm = window.frames["s_main"];
            if (!sm) return null;
            if (typeof sm.DEFAULT_URL === "string" && sm.DEFAULT_URL) {
              return { type: "pdf", url: sm.DEFAULT_URL };
            }
            if (sm.location && sm.location.href && !sm.location.href.includes("SCORM_fetchResource.php") && sm.location.href !== "about:blank" && !sm.location.href.includes("viewPDF.php")) {
              return { type: "external", url: sm.location.href };
            }
          } catch (e) {
            return { type: "cross_origin" };
          }
          return null;
        })()`);

        if (pollRes) {
          if (pollRes.type === "pdf") {
            pdfUrl = pollRes.url;
            break;
          }
          if (pollRes.type === "external") {
            externalLink = pollRes.url;
            break;
          }
        }

        // 檢查是否有新分頁 (例如 Dropbox / Google Drive 等 target=_blank)
        try {
          const resList = await fetch(`${CDP_HTTP}/json/list`);
          const tabs = await resList.json();
          const blankTab = tabs.find(t => t.url && !t.url.includes("istudy.ntut.edu.tw") && !t.url.includes("nportal.ntut.edu.tw") && !t.url.startsWith("chrome"));
          if (blankTab) {
            externalLink = blankTab.url;
            if (externalLink.includes("dropbox.com")) externalType = "Dropbox 雲端教材";
            else if (externalLink.includes("drive.google.com")) externalType = "Google Drive 雲端教材";
            else if (externalLink.includes("onedrive") || externalLink.includes("sharepoint")) externalType = "OneDrive 雲端教材";
            // 關閉外部彈出的分頁
            try { await fetch(`${CDP_HTTP}/json/close/${blankTab.id}`); } catch (e) {}
            break;
          }
        } catch (e) {}
      }

      if (pdfUrl) {
        console.log(`  發現 PDF 講義，正在下載...`);
        const dlFilename = `${safeTitle}.pdf`;
        const beforeTime = Date.now() - 1000;

        const dlResult = await client.evaluate(`(async () => {
          try {
            const sm = window.frames["s_main"];
            const res = await sm.fetch(sm.DEFAULT_URL);
            if (!res.ok) return { error: "HTTP " + res.status };
            const blob = await res.blob();
            const url = sm.URL.createObjectURL(blob);
            const a = sm.document.createElement("a");
            a.href = url;
            a.download = ${JSON.stringify(dlFilename)};
            a.click();
            return { success: true, size: blob.size };
          } catch(err) {
            return { error: err.message };
          }
        })()`, true);

        if (dlResult && dlResult.error) {
          console.log(`  ⚠️ 下載失敗：${dlResult.error}`);
          continue;
        }

        const downloaded = await waitForDownloadedFile(dlFilename, beforeTime, 90000);
        if (downloaded) {
          const finalDest = path.join(courseDir, dlFilename);
          fs.renameSync(downloaded, finalDest);
          const sizeMb = (fs.statSync(finalDest).size / (1024 * 1024)).toFixed(2);
          console.log(`  ✓ 下載成功！[${sizeMb} MB] -> ${finalDest}`);
        } else {
          console.log(`  ⚠️ 下載超時或未在下載夾找到檔案。`);
        }
      } else if (externalLink) {
        if (externalLink.includes("dropbox.com")) externalType = "Dropbox 雲端教材";
        else if (externalLink.includes("drive.google.com")) externalType = "Google Drive 雲端教材";
        saveLinkRecord(courseDir, course.name, { title: item.title, url: externalLink, type: externalType });
      } else {
        const frameTree = await client.send("Page.getFrameTree");
        const smFrame = frameTree.frameTree.childFrames?.find(f => f.frame.name === "s_main");
        const url = smFrame?.frame?.url;
        if (url && url !== "about:blank" && !url.includes("SCORM_fetchResource.php")) {
          let type = "外部嵌入資源";
          if (url.includes("dropbox.com")) type = "Dropbox 雲端教材";
          else if (url.includes("drive.google.com")) type = "Google Drive 雲端教材";
          else if (url.includes("istream") || url.includes("video")) type = "線上錄影";
          saveLinkRecord(courseDir, course.name, { title: item.title, url, type });
        } else {
          console.log(`  [提示] 此單元無可下載實體檔案。`);
        }
      }
    } catch (itemErr) {
      console.error(`  ⚠️ 處理此項目時發生錯誤：${itemErr.message}`);
    }
  }
}

async function main() {
  console.log(`
┌──────────────────────────────────────────────────────────┐
│        NTUT iStudy 國立臺北科技大學數位學園下載器        │
│          自動化課程教材、講義與線上錄影彙整工具          │
└──────────────────────────────────────────────────────────┘
`);

  const status = await checkChromeConnection();
  if (!status.ok || !status.target) {
    console.log(`❌ 未偵測到已開啟偵錯模式的 Chrome 瀏覽器或 iStudy 頁面！\n`);
    console.log(`請先在終端機執行以下指令啟動瀏覽器並完成登入：\n`);
    if (process.platform === "darwin") {
      console.log(`  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222 --user-data-dir="$HOME/Library/Application Support/Google/Chrome-iStudy" "https://istudy.ntut.edu.tw/learn/index.php" &`);
    } else if (process.platform === "win32") {
      console.log(`  start chrome.exe --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\\Chrome-iStudy" "https://istudy.ntut.edu.tw/learn/index.php"`);
    } else {
      console.log(`  google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.config/chrome-istudy" "https://istudy.ntut.edu.tw/learn/index.php" &`);
    }
    console.log(`\n登入後請重新執行本工具 (npm start)！`);
    process.exit(1);
  }

  const client = new CDPClient();
  await client.connect();
  console.log(`✓ 成功連接 Chrome 偵錯工作階段：${status.target.title}`);

  console.log(`正在偵測您的帳號課程清單...`);
  const courses = await getAvailableCourses(client);

  if (courses.length === 0) {
    console.log(`⚠️ 未偵測到已選修課程，請確認您已在瀏覽器成功登入並進入 iStudy 主頁。`);
    client.close();
    process.exit(1);
  }

  console.log(`\n偵測到您目前修讀的課程清單：`);
  courses.forEach((c, i) => console.log(`  [${i + 1}] ${c.name}`));
  console.log(`  [A] 全部下載 (All)`);

  const choice = await ask(`\n請輸入欲下載的課程編號 (例如: 1 或 1,2,3 或 A 全部): `);

  let selectedCourses = [];
  if (choice.toLowerCase() === "a" || choice.toLowerCase() === "all") {
    selectedCourses = courses;
  } else {
    const indices = choice.split(/[,，\s]+/).map(s => parseInt(s) - 1).filter(i => !isNaN(i) && i >= 0 && i < courses.length);
    selectedCourses = indices.map(i => courses[i]);
  }

  if (selectedCourses.length === 0) {
    console.log(`未選擇任何有效課程，結束程式。`);
    client.close();
    process.exit(0);
  }

  console.log(`\n即將下載以下 ${selectedCourses.length} 門課程：`);
  selectedCourses.forEach(c => console.log(`  - ${c.name}`));

  for (const course of selectedCourses) {
    try {
      await processCourse(client, course);
    } catch (err) {
      console.error(`處理課程 ${course.name} 時發生異常：`, err);
    }
  }

  client.close();
  console.log(`\n======================================================`);
  console.log(`🎉 全部下載與整理工作圓滿完成！檔案已保存於 ./downloads/ 目錄。`);
  console.log(`======================================================\n`);
}

main().catch(err => {
  console.error("執行失敗：", err);
  process.exit(1);
});
