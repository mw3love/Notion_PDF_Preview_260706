// 서비스워커: 툴바 버튼 클릭 → 활성 Notion 탭에 스냅샷 스크립트 주입.
// 스냅샷 스크립트가 저장을 마치면 'open-preview' 메시지를 보내고, 여기서 미리보기 탭을 연다.

const NOTION_RE = /^https:\/\/([a-z0-9-]+\.)?notion\.(so|com)\//i;

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !NOTION_RE.test(tab.url || "")) {
    // Notion 페이지가 아니면 안내 탭을 연다.
    chrome.tabs.create({
      url:
        "data:text/html;charset=utf-8," +
        encodeURIComponent(
          "<h2>Notion 페이지에서 실행하세요</h2><p>app.notion.com 페이지 탭을 활성화한 뒤 확장 버튼을 누르세요.</p>"
        ),
    });
    return;
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content-snapshot.js"],
    });
  } catch (e) {
    console.error("[notion-page-preview] inject failed", e);
  }
});

// 서비스워커에서 blob → data URL (SW 에는 FileReader 가 없어 수동 base64)
function blobToDataUrl(blob) {
  return blob.arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf);
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return `data:${blob.type || "image/png"};base64,${btoa(bin)}`;
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "open-preview") {
    chrome.tabs.create({ url: chrome.runtime.getURL("preview.html") });
    return;
  }
  // 이미지 프록시 fetch: 콘텐츠 스크립트는 CORS 제약(프록시=쿠키 필요, 리다이렉트된 S3=credentialed CORS 거부)
  // 때문에 못 함. 서비스워커는 host_permissions 로 CORS 를 우회 + 쿠키 전송 가능.
  if (msg && msg.type === "fetch-images") {
    (async () => {
      const out = {};
      const diag = [];

      async function fetchOne(u) {
        const tries = 4;
        let lastErr;
        for (let t = 0; t < tries; t++) {
          try {
            const r = await fetch(u, { credentials: "include", cache: "force-cache" });
            if (!r.ok) throw new Error("HTTP " + r.status);
            const blob = await r.blob();
            if (blob.size > 8 * 1024 * 1024) return { error: "too big " + blob.size };
            return { durl: await blobToDataUrl(blob), size: blob.size };
          } catch (e) {
            lastErr = e;
            await new Promise((res) => setTimeout(res, 1000 * (t + 1)));
          }
        }
        return { error: String(lastErr && lastErr.message ? lastErr.message : lastErr) };
      }

      const urls = msg.urls || [];
      const CONCURRENCY = 3;
      let idx = 0;
      async function worker() {
        while (idx < urls.length) {
          const u = urls[idx++];
          const r = await fetchOne(u);
          if (r.durl) {
            out[u] = r.durl;
            diag.push({ tail: u.slice(-16), ok: 1, kb: Math.round(r.size / 1024) });
          } else {
            diag.push({ tail: u.slice(-16), err: r.error });
          }
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));

      // 큰 데이터는 메시지가 아니라 storage 로 전달(메시지 크기 한계 회피)
      await chrome.storage.local.set({ ppImageMap: out });
      sendResponse({ count: Object.keys(out).length, diag });
    })();
    return true; // 비동기 응답
  }
});
