// Notion 페이지(동일 출처) 안에서 실행. 본문 + Notion 자체 CSS를 스냅샷해 storage에 저장.
// 동일 출처라 CSS를 fetch로 텍스트화할 수 있어(CORS 회피) 미리보기 쪽은 원격 fetch 불필요.
(async () => {
  const log = (...a) => console.log("[notion-page-preview]", ...a);

  function toast(text) {
    const d = document.createElement("div");
    d.textContent = text;
    d.style.cssText =
      "position:fixed;z-index:2147483647;left:50%;top:16px;transform:translateX(-50%);" +
      "background:#2d2d2d;color:#fff;padding:8px 16px;border-radius:6px;font:13px sans-serif;" +
      "box-shadow:0 2px 8px rgba(0,0,0,.3);pointer-events:none;";
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 2500);
    return d;
  }

  const busy = toast("페이지 스냅샷 중…");

  // 1) 가상화된 블록 실체화: 스크롤러를 위→아래로 훑어 안 그려진 블록까지 렌더시킨다.
  async function realizeBlocks() {
    const el = document.querySelector(".notion-scroller.vertical");
    if (!el) return;
    const orig = el.scrollTop;
    const step = Math.max(200, el.clientHeight * 0.85);
    for (let y = 0; y <= el.scrollHeight; y += step) {
      el.scrollTop = y;
      await new Promise((r) => setTimeout(r, 110));
    }
    el.scrollTop = el.scrollHeight;
    await new Promise((r) => setTimeout(r, 150));
    el.scrollTop = orig;
    await new Promise((r) => setTimeout(r, 150));
  }
  await realizeBlocks();

  // 2) 클론 루트 = (페이지 제목 블록) 과 (.notion-page-content) 의 공통 조상.
  const content = document.querySelector(".notion-page-content");
  if (!content) {
    busy.remove();
    toast("Notion 본문(.notion-page-content)을 찾지 못했습니다.");
    return;
  }
  // 제목 블록: 본문 밖에 있는 첫 .notion-page-block
  const titleBlock = [...document.querySelectorAll(".notion-page-block")].find(
    (b) => !content.contains(b)
  );
  function commonAncestor(a, b) {
    if (!a || !b) return a || b;
    const anc = new Set();
    let n = a;
    while (n) {
      anc.add(n);
      n = n.parentElement;
    }
    n = b;
    while (n) {
      if (anc.has(n)) return n;
      n = n.parentElement;
    }
    return a;
  }
  const root = commonAncestor(titleBlock, content) || content;

  // 3) 클론 후 실행/편집 관련 요소 제거(스크립트는 필수 제거, 나머지는 print.css가 대부분 숨김)
  const clone = root.cloneNode(true);
  clone
    .querySelectorAll(
      "script, .notion-print-ignore, .notion-overlay-container, .notion-presence-container, .notion-topbar, .notion-sidebar-container"
    )
    .forEach((e) => e.remove());

  // 3.5) 이미지 인라인화: 프록시(쿠키 필요)→S3(credentialed CORS 거부) 조합이라 콘텐츠 스크립트는
  //      직접 fetch 불가. 백그라운드 서비스워커(host_permissions 로 CORS 우회)에 위임해 data URL 로 박제.
  async function inlineImages(liveRoot, cloneRoot) {
    // 클론 img 자신의 src 속성을 절대경로로 해석해 사용(원본 배열과 인덱스로 짝짓지 않음 —
    // 클론 루트에 본문 밖 크롬 이미지가 섞여 인덱스가 어긋나던 버그 수정).
    const cloned = [...cloneRoot.querySelectorAll("img")];
    const pairs = [];
    cloned.forEach((cimg) => {
      let src = cimg.getAttribute("src") || "";
      if (!src || src.startsWith("data:")) return;
      try {
        src = new URL(src, location.href).href;
      } catch (e) {
        return;
      }
      pairs.push({ cimg, src });
    });
    if (!pairs.length) return 0;
    const urls = [...new Set(pairs.map((p) => p.src))];
    let map = {};
    try {
      const res = (await chrome.runtime.sendMessage({ type: "fetch-images", urls })) || {};
      log("이미지 결과:", JSON.stringify(res.diag)); // 각 이미지 성공/실패 사유(페이지 콘솔에 노출)
      map = (await chrome.storage.local.get("ppImageMap")).ppImageMap || {};
      await chrome.storage.local.remove("ppImageMap");
    } catch (e) {
      log("이미지 fetch 메시지 실패:", e);
    }
    let done = 0;
    for (const { cimg, src } of pairs) {
      if (map[src]) {
        cimg.setAttribute("src", map[src]);
        cimg.removeAttribute("srcset");
        done++;
      }
    }
    return done;
  }
  const imgDone = await inlineImages(root, clone);
  log("이미지 인라인:", imgDone + "/" + clone.querySelectorAll("img").length);

  // 4) CSS 수집: <link> 는 동일 출처 fetch로 텍스트화(교차출처 CORP 차단 회피), <style> 는 내용 그대로.
  //    href(base)를 보존해 상대 url()(폰트/이미지)이 미리보기에서 절대 경로로 해석되도록 함.
  const cssList = [];
  for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
    try {
      const css = await fetch(link.href).then((r) => r.text());
      cssList.push({ href: link.href, css });
    } catch (e) {
      log("stylesheet fetch 실패(무시):", link.href, e);
    }
  }
  let inlineIdx = 0;
  for (const style of document.querySelectorAll("style")) {
    const css = style.textContent;
    if (!css || !css.trim()) continue;
    cssList.push({ href: location.origin + "/__inline-" + inlineIdx++ + ".css", css });
  }

  // 5) 저장 후 미리보기 탭 열기
  const snapshot = {
    html: clone.outerHTML,
    cssList,
    meta: {
      title: document.title.replace(/\s*\|\s*Notion\s*$/i, "").trim(),
      url: location.href,
      sourceWidth: Math.round(content.getBoundingClientRect().width),
      ts: Date.now(),
    },
  };
  try {
    await chrome.storage.local.set({ snapshot });
    log("snapshot 저장:", {
      htmlKB: Math.round(snapshot.html.length / 1024),
      sheets: cssList.length,
    });
    chrome.runtime.sendMessage({ type: "open-preview" });
  } catch (e) {
    log("storage 저장 실패", e);
    toast("스냅샷 저장 실패: " + e.message);
  } finally {
    busy.remove();
  }
})();
