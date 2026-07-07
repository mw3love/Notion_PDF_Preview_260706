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
  const railEl = $("thumbrail");

  const SIZES = { A4: { w: 210, h: 297 }, A3: { w: 297, h: 420 } }; // mm
  const MM_PER_PX = 96 / 25.4; // 96dpi

  // 좌측 레일에 각 페이지의 축소 클론(썸네일)을 그린다. paginate 끝에서 매번 리빌드.
  // 이미지가 이미 data URL 로 인라인돼 있어 클론이 오프라인으로 완전히 렌더된다.
  let thumbIO = null, spyLock = false, spyTimer = null;
  function buildThumbs(sz) {
    if (thumbIO) { thumbIO.disconnect(); thumbIO = null; }
    railEl.innerHTML = "";
    const pages = [...pagesEl.children];
    if (!pages.length) return; // 접힘 여부(norail)는 사용자 토글 소유 — 여기서 건드리지 않음

    const THUMB_W = 130;
    const k = THUMB_W / (sz.w * MM_PER_PX); // 페이지 실폭(px) → 썸네일 폭
    const frameH = Math.round(sz.h * MM_PER_PX * k);
    const pageStepPx = sz.h * MM_PER_PX + 12; // 페이지 1장 높이(px)+여백 — smooth/instant 분기 기준
    const pageToThumb = new Map();

    pages.forEach((pg, i) => {
      const item = document.createElement("div");
      item.className = "thumb";
      const frame = document.createElement("div");
      frame.className = "thumb-frame";
      frame.style.height = frameH + "px";
      const clone = pg.cloneNode(true);
      clone.style.transform = `scale(${k})`;
      clone.style.transformOrigin = "top left";
      frame.appendChild(clone);
      const num = document.createElement("div");
      num.className = "thumb-num";
      num.textContent = i + 1;
      item.appendChild(frame);
      item.appendChild(num);
      item.addEventListener("click", () => {
        setActive(pg); // 클릭 즉시 목표 페이지 강조 → 중간 페이지 거쳐가는 깜빡임 방지
        const y = pg.getBoundingClientRect().top + window.scrollY - 56; // 툴바(48) 아래로
        const dist = Math.abs(y - window.scrollY);
        if (dist <= 2) return; // 이미 그 위치
        if (dist <= 2.5 * pageStepPx) {
          // 가까운 이동(~2쪽 이내)은 부드럽게 — 연속성. 스크롤스파이 잠가 강조 흔들림 방지.
          spyLock = true;
          clearTimeout(spyTimer);
          spyTimer = setTimeout(() => { spyLock = false; }, 1500); // scrollend 미발화 대비 폴백
          window.scrollTo({ top: y, behavior: "smooth" });
        } else {
          // 먼 이동은 순간이동 — 중간 페이지 훑기 없이 즉시 도착(PDF 뷰어 관례).
          window.scrollTo({ top: y, behavior: "auto" });
        }
      });
      railEl.appendChild(item);
      pageToThumb.set(pg, item);
    });

    // 스크롤 위치 추적 → 가장 많이 보이는 페이지의 썸네일을 강조
    function setActive(pg) {
      railEl.querySelectorAll(".thumb.active").forEach((t) => t.classList.remove("active"));
      const item = pageToThumb.get(pg);
      if (item) item.classList.add("active"); // 강조 테두리만 — 레일 자동 스크롤은 안 함(덜컹 방지)
    }
    const ratios = new Map();
    thumbIO = new IntersectionObserver((entries) => {
      entries.forEach((e) => ratios.set(e.target, e.intersectionRatio));
      if (spyLock) return; // 클릭 점프 중엔 중간 페이지로 강조가 흔들리지 않게
      let best = null, bestR = -1;
      ratios.forEach((r, pg) => { if (r > bestR) { bestR = r; best = pg; } });
      if (best) setActive(best);
    }, { root: null, rootMargin: "-48px 0px 0px 0px", threshold: [0, 0.25, 0.5, 0.75, 1] });
    pages.forEach((pg) => thumbIO.observe(pg));
  }

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
      // Notion 인라인 이모지(✅ 등)는 background-image 스프라이트라, Chrome이 인쇄 시 배경을
      // 안 그려 PDF에서 폭(공백)만 남고 사라진다. print-color-adjust:exact 로 배경 출력을 강제
      // (콜아웃 배경색·하이라이트도 함께 인쇄되어 화면=출력 정확도↑).
      ".pp-page *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}" +
      ".pp-page .notion-page-content{width:100%!important;max-width:none!important;padding:0!important;margin:0!important;}" +
      ".pp-page-inner > *{max-width:100%;}" +
      // 표를 본문 폭에 맞춰 축소(Notion 표는 컬럼 고정 px 라 여백 크면 오른쪽이 잘림).
      // width:100%+auto 레이아웃이면 컬럼 비율을 대략 유지하며 폭에 맞게 줄고, min-width:0·줄바꿈으로 안 넘침.
      ".pp-page-inner table{width:100%!important;max-width:100%!important;table-layout:auto!important;}" +
      ".pp-page-inner table td,.pp-page-inner table th{min-width:0!important;overflow-wrap:anywhere!important;}" +
      // DB(컬렉션 뷰)는 <table> 이 아니라 div 그리드 + 가로 스크롤 캔버스(폭 ~1863px)라 위 table 규칙이 안 먹는다.
      //   다만 편집 크롬 제거(content-snapshot.js) 후엔 실제 데이터 그리드가 좌측에 정렬되고 우측 빈 캔버스는
      //   .pp-page 의 overflow:hidden 이 클립하므로 좁은 DB 는 그대로 페이지에 맞는다.
      //   ※ .notion-table-view 의 인라인 padding-inline 을 0 으로 만들면(폭 축소 시도) no-JS preview 에서
      //     float:inline-start 레이아웃이 붕괴해 표 전체가 사라진다(iframe 실측 확인) → 건드리지 않는다.
      //     열이 아주 많은 DB 는 우측이 잘릴 수 있으나, 이는 Notion export 도 동일한 한계(추후 필요 시 별도 처리).
      // Notion 전역 CSS가 우리 UI를 덮어쓰지 못하게 방어(화면 한정 — 인쇄 땐 툴바 숨김 유지)
      "@media screen{" +
      "body{background:#e9e9ec!important;}" +
      "#toolbar{position:fixed!important;top:0!important;left:0!important;right:0!important;height:48px!important;" +
      "display:flex!important;align-items:center!important;background:#fff!important;z-index:2147483647!important;" +
      "border-bottom:1px solid #d0d0d5!important;padding:0 16px!important;}" +
      "#pages{padding:64px 0 40px 176px!important;}" +
      "body.norail #pages{padding-left:0!important;}" +
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
    let cur; // 현재 페이지의 inner(흐름 대상)
    function newPage() {
      const { pg, inner } = makePage();
      pagesEl.appendChild(pg);
      cur = inner;
      return inner;
    }
    // 지금까지 담은 게 현재 페이지 콘텐츠 높이에 들어가는가
    const fits = () => cur.scrollHeight <= contentH + 1;

    // 더 쪼갤 수 없는(원자) 요소: 여기서 넘치면 잘림 처리
    const ATOMIC_TAGS = new Set(["TR", "TD", "TH", "IMG", "HR", "BR"]);

    // el 을 분할할 자식 목록(클론). 표는 본문 행, 그 외는 요소 자식.
    // 쪼갤 게 없으면(원자) null.
    function childrenToSplit(el) {
      if (ATOMIC_TAGS.has(el.tagName)) return null;
      if (el.tagName === "TABLE") {
        const body = [...el.querySelectorAll(":scope > tbody > tr")];
        const direct = body.length ? body : [...el.querySelectorAll(":scope > tr")];
        return direct.length > 1 ? direct.map((r) => r.cloneNode(true)) : null;
      }
      const kids = [...el.children];
      return kids.length ? kids.map((k) => k.cloneNode(true)) : null;
    }

    // el 과 같은 껍데기 + 반복 요소(표 헤더/colgroup)를 만들고, 자식을 담을 target 반환.
    function makeShell(el) {
      const shell = el.cloneNode(false);
      let target = shell;
      if (el.tagName === "TABLE") {
        el.querySelectorAll(":scope > colgroup, :scope > thead").forEach((h) =>
          shell.appendChild(h.cloneNode(true))
        );
        const tb = document.createElement("tbody");
        shell.appendChild(tb);
        target = tb; // 본문 행은 tbody 로(유효한 표 구조 유지 → 렌더/측정 정확)
      }
      return { shell, target };
    }

    // el(클론)을 현재 페이지에 흘려 담는다. 넘치면 새 페이지로 분할하며 이어 담음.
    function place(el) {
      // 1) 통째로 시도 — 남은 공간에 들어가면 끝
      cur.appendChild(el);
      // 레이아웃 박스 높이 0 = 보이지 않는 Notion UI 잔재(블록 핸들 오버레이, 빈 선택 래퍼 등).
      if (el.offsetHeight === 0 && !el.querySelector("img")) { cur.removeChild(el); return; }
      const elH = Math.ceil(el.getBoundingClientRect().height); // el 자체 높이(형제 무관)
      if (fits()) return;
      cur.removeChild(el);

      const tooBig = elH > contentH + 1; // 페이지 하나에도 안 들어갈 만큼 큰가
      const kids = childrenToSplit(el);

      // 2) 페이지 하나엔 들어감(남은 공간만 부족) → 통째로 새 페이지로 이동(어색한 분할 방지)
      if (!tooBig) {
        if (cur.children.length > 0) newPage();
        cur.appendChild(el);
        return; // 빈 페이지엔 반드시 들어감
      }

      // 3) 페이지보다 큰데 더 못 쪼갬(원자) → 잘림
      if (!kids) {
        if (cur.children.length > 0) newPage();
        cur.appendChild(el);
        overflowOne++;
        console.warn("[pp-clip] 페이지보다 큰 블록(잘림):", el.tagName, el.className || "(no class)", elH + "px >", contentH + "px");
        return;
      }

      // 4) 페이지보다 큰 분할 가능 블록 → 현재 페이지 남은 공간부터 채우며 분할.
      //    shell/페이지는 실제로 자식을 넣기 직전에만 생성(lazy) → 빈 페이지가 안 생김.
      const isTable = el.tagName === "TABLE";
      let shell = null, target = null, needNewPage = false;
      function open() {
        if (shell) return;
        if (needNewPage) { newPage(); needNewPage = false; }
        ({ shell, target } = makeShell(el));
        cur.appendChild(shell);
      }
      function seal() { shell = null; target = null; needNewPage = true; }
      function clipRow(kid) {
        target.appendChild(kid); // 표 구조 유지한 채 잘림
        overflowOne++;
        console.warn("[pp-clip] 페이지보다 큰 표 행(잘림):", kid.className || "(row)");
        seal();
      }
      function splitBig(kid) {
        cur.removeChild(shell); shell = null; target = null;
        place(kid); // 페이지보다 큰 자식을 재귀 분할
        seal();
      }
      for (const kid of kids) {
        // 분할 대상(표/컬럼 등) 안의 "내용 없는" kid 는 건너뜀(높이 무관).
        // Notion 표의 배경/선택 오버레이 레이어(표 높이만큼 크지만 텍스트 없음)·드래그 핸들 등.
        // 텍스트·이미지·비디오·표행이 하나라도 있으면 실제 내용이므로 유지(중첩표·이미지 보존).
        if (!isTable) {
          const noContent = !(kid.textContent || "").trim() && !kid.querySelector("img, video, canvas, tr, iframe");
          if (noContent) continue;
        }
        open();
        target.appendChild(kid);
        if (fits()) continue;
        target.removeChild(kid);

        if (target.children.length === 0) {
          // 이 조각 첫 요소부터 안 들어감 = 자식 하나가 페이지보다 큼
          if (isTable) clipRow(kid); else splitBig(kid);
        } else {
          // 현재 조각 확정 → 새 페이지에서 kid 재시도
          seal(); open();
          target.appendChild(kid);
          if (!fits()) {
            target.removeChild(kid);
            if (isTable) clipRow(kid); else splitBig(kid);
          }
        }
      }
      if (shell && target.children.length === 0) cur.removeChild(shell); // 남은 빈 껍데기 정리
    }

    newPage();
    for (const unit of units) place(unit.cloneNode(true));

    // 분할 잔여로 남은 완전 빈 페이지(자식 0개) 제거(안전망).
    // 높이 0 블록은 place()에서 이미 건너뛰므로 여기선 자식 없는 껍데기만 정리.
    [...pagesEl.children].forEach((pg) => {
      if (pg.firstElementChild && pg.firstElementChild.children.length === 0) pg.remove();
    });

    wrap.remove();

    const n = pagesEl.children.length;
    statusEl.textContent =
      `${paper} · ${n}쪽` + (overflowOne ? ` · ⚠ 한 페이지보다 큰 블록 ${overflowOne}개(잘림)` : "");
    buildThumbs(sz);
    $("repaginate").disabled = false;
    running = false;
  }

  paperSel.addEventListener("change", paginate);
  marginInp.addEventListener("change", paginate);
  $("repaginate").addEventListener("click", paginate);
  $("thumbtoggle").addEventListener("click", () => document.body.classList.toggle("norail"));
  window.addEventListener("scrollend", () => { spyLock = false; clearTimeout(spyTimer); });
  $("save").addEventListener("click", () => window.print());

  injectStyles();
  await paginate();
})();
