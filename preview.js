// 미리보기 + 자체 페이지 분할기(paged.js 대체 — Chrome 149 호환).
// Notion 콘텐츠를 실제 Notion CSS로 렌더하고, 블록 단위로 A4/A3 페이지에 흘려 담는다.
// 페이지 div 들을 그대로 인쇄 → 미리보기 = 출력(WYSIWYG).
(async () => {
  const $ = (id) => document.getElementById(id);
  const pagesEl = $("pages");
  const statusEl = $("status");
  const paperSel = $("paper");
  const marginInp = $("margin");
  const pageRuleEl = $("pp-page-rule");

  const SIZES = { A4: { w: 210, h: 297 }, A3: { w: 297, h: 420 } }; // mm

  const data = await chrome.storage.local.get("snapshot");
  const snap = data && data.snapshot;
  if (!snap || !snap.html) {
    statusEl.textContent = "스냅샷이 없습니다. Notion 페이지에서 확장 버튼을 눌러 실행하세요.";
    return;
  }

  const title = (snap.meta && snap.meta.title) || "미리보기";
  $("doctitle").textContent = title;
  document.title = title + " — 페이지 나눔 미리보기";

  // 상대 url()(폰트/이미지)을 시트 base href 기준 절대경로로 치환(data:/절대/#/앵커는 유지)
  function absolutizeUrls(css, baseHref) {
    return (css || "").replace(
      /url\(\s*(['"]?)([^'")]+)\1\s*\)/g,
      (m, q, raw) => {
        const v = raw.trim();
        if (/^(data:|https?:|\/\/|#)/i.test(v)) return m;
        try { return `url(${q}${new URL(v, baseHref).href}${q})`; }
        catch (e) { return m; }
      }
    );
  }

  // 1) Notion CSS 주입(1회). 모두 <style> 로(교차출처 CORP 회피). url() 은 절대화.
  //    Notion print.css 의 @page(margin:20mm) 가 우리 @page(margin:0) 를 덮어써 인쇄가 어긋나므로 제거.
  function injectStyles() {
    document.querySelectorAll("[data-pp-style]").forEach((e) => e.remove());
    for (const item of snap.cssList || []) {
      const s = document.createElement("style");
      s.setAttribute("data-pp-style", "1");
      s.textContent = absolutizeUrls(item.css, item.href).replace(/@page\s*\{[^}]*\}/gi, "");
      document.head.appendChild(s);
    }
    // 우리 오버라이드(마지막): Notion 본문의 고정폭/패딩 제거해 페이지 폭에 맞춤
    const o = document.createElement("style");
    o.setAttribute("data-pp-style", "1");
    o.textContent =
      ".pp-page .notion-page-content{width:100%!important;max-width:none!important;padding:0!important;margin:0!important;}" +
      ".pp-page-inner > *{max-width:100%;}" +
      // Notion 전역 CSS가 우리 UI를 덮어쓰지 못하게 방어(화면 한정 — 인쇄 땐 툴바 숨김 유지)
      "@media screen{" +
      "body{background:#e9e9ec!important;}" +
      "#toolbar{position:fixed!important;top:0!important;left:0!important;right:0!important;height:48px!important;" +
      "display:flex!important;align-items:center!important;background:#fff!important;z-index:2147483647!important;" +
      "border-bottom:1px solid #d0d0d5!important;padding:0 16px!important;}" +
      "#pages{padding:64px 0 40px!important;}" +
      ".pp-page{margin:0 auto 12px!important;background:#fff!important;box-shadow:0 1px 6px rgba(0,0,0,.25)!important;}" +
      "}";
    document.head.appendChild(o);
    // 우리 @page 규칙(pageRuleEl)이 Notion CSS보다 뒤에 오도록 head 맨 끝으로 이동
    document.head.appendChild(pageRuleEl);
  }

  // 모든 이미지를 디코딩 완료(측정 전에 실제 높이 확정). 최대 8초.
  function decodeImages(root) {
    const imgs = [...root.querySelectorAll("img")];
    if (!imgs.length) return Promise.resolve();
    return Promise.race([
      Promise.all(
        imgs.map((i) =>
          (i.decode ? i.decode() : Promise.resolve()).catch(() => {})
        )
      ),
      new Promise((res) => setTimeout(res, 8000)),
    ]);
  }

  let running = false;
  async function paginate() {
    if (running) return;
    running = true;
    $("repaginate").disabled = true;
    statusEl.textContent = "계산 중…";

    const paper = paperSel.value;
    const m = Math.max(0, parseInt(marginInp.value, 10) || 0);
    const sz = SIZES[paper] || SIZES.A4;

    // 페이지 박스는 mm 단위로 잡아 용지와 정확히 1:1 매칭(96dpi 반올림 넘침 방지).
    function makePage() {
      const pg = document.createElement("div");
      pg.className = "pp-page";
      pg.style.cssText = `width:${sz.w}mm;height:${sz.h}mm;padding:${m}mm;box-sizing:border-box;overflow:hidden;`;
      const inner = document.createElement("div");
      inner.className = "pp-page-inner notion-page-content";
      inner.style.cssText = "height:100%;overflow:hidden;";
      pg.appendChild(inner);
      return { pg, inner };
    }
    // 콘텐츠 영역의 실제 px 크기 측정(조판 임계값·이미지 max-height·wrap 폭에 사용)
    const probe = makePage();
    probe.pg.style.position = "absolute";
    probe.pg.style.left = "-99999px";
    document.body.appendChild(probe.pg);
    const contentH = probe.inner.clientHeight;
    const contentW = probe.inner.clientWidth;
    probe.pg.remove();

    // 인쇄용 @page: 박스가 여백을 padding 으로 포함하므로 margin:0
    // + 한 페이지보다 큰 이미지는 페이지 안에 맞게 축소(잘림 방지)
    pageRuleEl.textContent =
      `@page { size: ${paper}; margin: 0; }` +
      `.pp-page-inner img{max-width:100%!important;max-height:${contentH}px!important;height:auto!important;object-fit:contain;}`;

    // 소스를 화면 밖에 실제 폭으로 붙여 이미지 디코딩·레이아웃을 확정(측정 정확도 핵심)
    const wrap = document.createElement("div");
    wrap.className = "pp-page-inner notion-page-content";
    wrap.style.cssText = `position:absolute;left:-99999px;top:0;width:${contentW}px;`;
    wrap.innerHTML = snap.html;
    document.body.appendChild(wrap);
    await (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve());
    await decodeImages(wrap);

    // 흐름 단위 = 제목 블록 + .notion-page-content 의 직접 자식들
    const contentRoot = wrap.querySelector(".notion-page-content");
    const titleBlock = [...wrap.querySelectorAll(".notion-page-block")].find(
      (b) => !contentRoot || !contentRoot.contains(b)
    );
    const units = [];
    if (titleBlock) units.push(titleBlock);
    if (contentRoot) units.push(...contentRoot.children);
    else units.push(...wrap.children);

    pagesEl.innerHTML = "";
    let overflowOne = 0;
    function newPage() {
      const { pg, inner } = makePage();
      pagesEl.appendChild(pg);
      return inner;
    }
    let cur = newPage();

    for (const unit of units) {
      const el = unit.cloneNode(true);
      cur.appendChild(el);
      if (cur.scrollHeight > contentH + 1) {
        if (cur.children.length > 1) {
          // 다른 내용이 있으면 이 블록은 다음 페이지로 통째로 이동
          cur.removeChild(el);
          cur = newPage();
          cur.appendChild(el);
          if (cur.scrollHeight > contentH + 1) overflowOne++; // 단일 블록이 페이지보다 큼(v1 한계)
        } else {
          overflowOne++; // 페이지보다 큰 단일 블록(표/이미지 분할은 v2)
        }
      }
    }

    wrap.remove();

    const n = pagesEl.children.length;
    statusEl.textContent =
      `${paper} · ${n}쪽` + (overflowOne ? ` · ⚠ 한 페이지보다 큰 블록 ${overflowOne}개(잘림)` : "");
    $("repaginate").disabled = false;
    running = false;
  }

  paperSel.addEventListener("change", paginate);
  marginInp.addEventListener("change", paginate);
  $("repaginate").addEventListener("click", paginate);
  $("save").addEventListener("click", () => window.print());

  injectStyles();
  await paginate();
})();
