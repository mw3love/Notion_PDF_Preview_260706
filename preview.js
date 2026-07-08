// 미리보기 + 자체 페이지 분할기(paged.js 대체 — Chrome 149 호환).
// Notion 콘텐츠를 실제 Notion CSS로 렌더하고, 블록 단위로 A4/A3 페이지에 흘려 담는다.
// 페이지 div 들을 그대로 인쇄 → 미리보기 = 출력(WYSIWYG).
(async () => {
  const $ = (id) => document.getElementById(id);
  const pagesEl = $("pages");
  const statusEl = $("status");
  const paperSel = $("paper");
  const marginVInp = $("marginV"); // 상하 여백(mm)
  const marginHInp = $("marginH"); // 좌우 여백(mm)
  const pageRuleEl = $("pp-page-rule");
  const railEl = $("thumbrail");
  const tocEl = $("tocrail");

  const SIZES = { // mm
    A4: { w: 210, h: 297 }, A3: { w: 297, h: 420 },
    A2: { w: 420, h: 594 }, A1: { w: 594, h: 841 },
  };
  const MM_PER_PX = 96 / 25.4; // 96dpi

  // 상단 상태표시는 경고/진행만(용지=좌측 select, 페이지=상단 알약으로 분리).
  // 상단바 정중앙 알약(#pagepill): 현재/전체 쪽 — 상시 표시, 스크롤스파이가 텍스트만 갱신.
  let totalPages = 0;
  const pillEl = $("pagepill");
  function updatePill(cur) { pillEl.textContent = (cur || 1) + " / " + totalPages + " 쪽"; }

  // 좌측 레일에 각 페이지의 축소 클론(썸네일)을 그린다. paginate 끝에서 매번 리빌드.
  // 이미지가 이미 data URL 로 인라인돼 있어 클론이 오프라인으로 완전히 렌더된다.
  let thumbIO = null, spyLock = false, spyTimer = null;
  function buildThumbs(sz) {
    if (thumbIO) { thumbIO.disconnect(); thumbIO = null; }
    railEl.innerHTML = "";
    const pages = [...pagesEl.children];
    if (!pages.length) return; // 접힘 여부(norail)는 사용자 토글 소유 — 여기서 건드리지 않음

    // 썸네일 폭 = 레일 너비(--thumbw)에 맞춤(레일 너비 드래그 조절 시 함께 커짐)
    const railW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--thumbw")) || 176;
    const THUMB_W = Math.max(70, Math.round(railW - 46));
    const k = THUMB_W / (sz.w * MM_PER_PX); // 페이지 실폭(px) → 썸네일 폭
    const frameH = Math.round(sz.h * MM_PER_PX * k);
    const pageStepPx = sz.h * MM_PER_PX + 12; // 페이지 1장 높이(px)+여백 — smooth/instant 분기 기준
    const pageToThumb = new Map();

    pages.forEach((pg, i) => {
      const item = document.createElement("div");
      item.className = "thumb";
      item.style.width = THUMB_W + "px";
      const frame = document.createElement("div");
      frame.className = "thumb-frame";
      frame.style.width = THUMB_W + "px";
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
      const idx = pages.indexOf(pg);
      if (idx >= 0) updatePill(idx + 1); // 알약 현재/전체 갱신
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

  // 우측 목차(TOC) 레일 — 조판된 페이지에서 헤딩 블록을 훑어 항목을 만든다.
  // Notion 헤딩 = .notion-header-block(H1) / .notion-sub_header-block(H2) / .notion-sub_sub_header-block(H3).
  // 클릭 시 해당 헤딩으로 스크롤. 스크롤 위치를 추적해 현재 섹션 항목을 강조(스크롤스파이).
  const HEAD_SEL =
    ".notion-header-block, .notion-sub_header-block, .notion-sub_sub_header-block";
  let tocMap = []; // [{heading, item}] — DOM(=세로) 순서
  let tocSpyLock = false, tocSpyTimer = null, tocRaf = 0;

  function setTocActive(item) {
    tocEl.querySelectorAll(".toc-item.active").forEach((t) => t.classList.remove("active"));
    if (item) item.classList.add("active"); // 강조만 — 레일 자동 스크롤 안 함(좌측 레일과 동일: 덜컹 방지)
  }
  // 뷰포트 상단(툴바 아래)을 막 지난 마지막 헤딩 = 지금 읽는 섹션.
  function updateTocSpy() {
    if (tocSpyLock || !tocMap.length) return;
    const line = 48 + 72; // 툴바(48) 아래로 약간 여유
    let active = tocMap[0].item;
    for (const { heading, item } of tocMap) {
      if (heading.getBoundingClientRect().top <= line) active = item;
      else break; // 헤딩은 세로 오름차순이라 첫 미달에서 중단
    }
    setTocActive(active);
  }

  function buildToc() {
    tocEl.innerHTML = "";
    tocMap = [];
    const heads = [...pagesEl.querySelectorAll(HEAD_SEL)];
    const items = [];
    heads.forEach((h) => {
      const text = (h.textContent || "").trim();
      if (!text) return; // 빈 헤딩(플레이스홀더) 스킵
      const lvl = h.classList.contains("notion-sub_sub_header-block")
        ? 3
        : h.classList.contains("notion-sub_header-block")
        ? 2
        : 1;
      const item = document.createElement("div");
      item.className = "toc-item lvl" + lvl;
      item.textContent = text;
      item.title = text;
      item.addEventListener("click", () => {
        setTocActive(item); // 클릭 즉시 목표 강조 → 중간 헤딩 거쳐가는 깜빡임 방지
        const y = Math.max(0, h.getBoundingClientRect().top + window.scrollY - 56); // 툴바 아래로
        const dist = Math.abs(y - window.scrollY);
        if (dist <= 2) return;
        if (dist <= 3 * window.innerHeight) {
          // 가까운 이동은 부드럽게. 스크롤스파이 잠가 강조 흔들림 방지(scrollend/폴백에서 해제).
          tocSpyLock = true;
          clearTimeout(tocSpyTimer);
          tocSpyTimer = setTimeout(() => { tocSpyLock = false; }, 1500);
          window.scrollTo({ top: y, behavior: "smooth" });
        } else {
          window.scrollTo({ top: y, behavior: "auto" }); // 먼 이동은 순간이동
        }
      });
      tocEl.appendChild(item);
      items.push({ heading: h, item });
    });
    tocMap = items;
    if (!items.length) {
      const e = document.createElement("div");
      e.className = "toc-empty";
      e.textContent = "제목(헤딩)이 없습니다";
      tocEl.appendChild(e);
      return;
    }
    updateTocSpy();
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
      // 창 스크롤바 상시 표시(오버레이 방지)·기본 폭 — Notion CSS가 걸어도 이게 뒤에 와서 이김
      "html{scrollbar-color:#b3b3ba #ececef!important;scrollbar-width:auto!important;}" +
      "body{background:#adadb4!important;}" + // 문서 양옆 빈 여백(캔버스) — 흰 페이지와 이어지는 중간 회색(preview.html body 규칙과 동일 색)
      "#toolbar{position:fixed!important;top:0!important;left:0!important;right:0!important;height:48px!important;" +
      "display:flex!important;align-items:center!important;background:#fff!important;z-index:2147483647!important;" +
      "border-bottom:1px solid #d0d0d5!important;padding:0 16px!important;}" +
      "#pages{padding:64px var(--tocw) 40px var(--thumbw)!important;}" +
      "body.norail #pages{padding-left:0!important;}" +
      "body.notoc #pages{padding-right:0!important;}" +
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
    statusEl.textContent = "계산 중…";

    const paper = paperSel.value;
    const mv = Math.max(0, parseInt(marginVInp.value, 10) || 0); // 상하
    const mh = Math.max(0, parseInt(marginHInp.value, 10) || 0); // 좌우
    const sz = SIZES[paper] || SIZES.A4;

    // 페이지 박스는 mm 단위로 잡아 용지와 정확히 1:1 매칭(96dpi 반올림 넘침 방지).
    function makePage() {
      const pg = document.createElement("div");
      pg.className = "pp-page";
      pg.style.cssText = `width:${sz.w}mm;height:${sz.h}mm;padding:${mv}mm ${mh}mm;box-sizing:border-box;overflow:hidden;position:relative;`; // position:relative = 네모박스 절대좌표 기준
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
    // @page 는 명시적 mm 로(A2·A1 은 CSS 명명 크기에 없어 size:A2 가 안 먹음)
    pageRuleEl.textContent =
      `@page { size: ${sz.w}mm ${sz.h}mm; margin: 0; }` +
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

    // Notion 편집 DOM 복제로 딸려온 contenteditable 제거 → 읽기 전용(우발적 편집 방지).
    // 텍스트 선택(형광펜)·박스 그리기는 그대로 동작.
    pagesEl.querySelectorAll("[contenteditable]").forEach((e) => e.removeAttribute("contenteditable"));

    const n = pagesEl.children.length;
    totalPages = n;
    lastSz = sz; // 레일 리사이즈 후 썸네일 재생성에 사용
    statusEl.textContent = overflowOne ? `⚠ 한 페이지보다 큰 블록 ${overflowOne}개(잘림)` : "";
    updatePill(1); // 스크롤스파이(IO)가 곧 실제 현재 페이지로 보정
    buildThumbs(sz);
    buildToc();
    running = false;
  }
  let lastSz = SIZES.A4;

  paperSel.addEventListener("change", paginate);
  marginVInp.addEventListener("change", paginate);
  marginHInp.addEventListener("change", paginate);
  // 레일 접기 손잡이(chevron): 클릭 = 접기/펼치기 토글(너비 조절은 테두리 리사이즈 바가 담당).
  $("thumbhandle").addEventListener("click", () => document.body.classList.toggle("norail"));
  $("tochandle").addEventListener("click", () => document.body.classList.toggle("notoc"));

  // 레일 안쪽 테두리 전체를 드래그 = 너비 조절(썸네일=우측 스크롤바쪽, 목차=좌측 테두리).
  // 조절 중엔 body.resizing 으로 텍스트 선택 차단. 썸네일은 드래그 중 실시간으로 새 폭에 맞춰
  // 다시 그린다 — 단 buildThumbs 가 전체 페이지를 클론하는 무거운 작업이라 rAF 로 프레임당 1회 스로틀.
  function setupResize(bar, isLeft) {
    const varName = isLeft ? "--thumbw" : "--tocw";
    const MIN = 120, MAX = isLeft ? 360 : 460;
    let sx = 0, sw = 0, active = false, raf = 0;
    bar.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      active = true; sx = e.clientX;
      sw = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(varName)) || (isLeft ? 176 : 220);
      document.body.classList.add("resizing");
      e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
      if (!active) return;
      const dx = e.clientX - sx;
      const w = Math.max(MIN, Math.min(MAX, isLeft ? sw + dx : sw - dx));
      document.documentElement.style.setProperty(varName, w + "px");
      if (isLeft && !raf) raf = requestAnimationFrame(() => { raf = 0; buildThumbs(lastSz); }); // 실시간 미리보기
    });
    document.addEventListener("mouseup", () => {
      if (!active) return;
      active = false;
      document.body.classList.remove("resizing");
      if (isLeft) { if (raf) { cancelAnimationFrame(raf); raf = 0; } buildThumbs(lastSz); } // 최종 폭으로 확정
    });
  }
  setupResize($("thumbresize"), true);
  setupResize($("tocresize"), false);
  // TOC 스크롤스파이(현재 페이지 알약 텍스트도 여기서 갱신) — rAF 스로틀
  window.addEventListener("scroll", () => {
    if (tocRaf) return;
    tocRaf = requestAnimationFrame(() => { tocRaf = 0; updateTocSpy(); });
  }, { passive: true });
  window.addEventListener("scrollend", () => {
    spyLock = false; clearTimeout(spyTimer);
    tocSpyLock = false; clearTimeout(tocSpyTimer); updateTocSpy();
  });
  // ── 주석 도구: 형광펜(코랄) · 빨강 네모박스 · 텍스트 ──
  // 박스·텍스트는 .pp-annot 로 통합: 도구 켠 채로 클릭 선택·이동·삭제·색변경(박스는 크기조절도).
  // 주석은 각 .pp-page 안에 들어가 인쇄에 함께 나온다(테두리·배경은 print-color-adjust:exact 로 출력).
  // ⚠ 재계산(용지·여백 변경) 시 페이지가 원본에서 다시 조판되므로 주석은 사라진다(주석은 마지막에).
  // 각 도구는 자기 색을 기억(기본: 형광펜 코랄 · 네모 빨강 · 텍스트 검정). hover 패널에서 색·두께·크기 변경.
  const PALETTE = [
    { n: "검정", c: "#000000" }, { n: "흰색", c: "#ffffff" }, { n: "빨강", c: "#e23b3b" },
    { n: "코랄", c: "#ff7f50" }, { n: "파랑", c: "#2f6fe0" },
  ];
  const toolColor = { hl: "#ff7f50", box: "#e23b3b", text: "#000000" };
  let tool = null;                        // 'hl' | 'box' | 'text' | null
  let lineWInp = null, fontSzInp = null;  // 패널 안에서 생성
  const hexToRgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };

  // 툴바: 도구 버튼 + hover 시 아래로 뜨는 패널(5색 + 네모 두께 / 텍스트 크기)
  const annotEl = $("annot");
  const hlIcon = `<svg viewBox="0 0 24 24" width="20" height="20"><path d="M14.7 3.3l6 6-9.9 9.9-4.7 1.3 1.3-4.7z" fill="#777"/><rect x="3" y="20.4" width="18" height="2.7" rx="1.3" fill="#ff7f50"/></svg>`;
  const boxIcon = `<svg viewBox="0 0 24 24" width="20" height="20"><rect x="4" y="6.5" width="16" height="11" rx="1.2" fill="none" stroke="#e23b3b" stroke-width="2.4"/></svg>`;
  const textIcon = `<svg viewBox="0 0 24 24" width="20" height="20"><path d="M5 4h14v3.2h-5.4V20h-3.2V7.2H5z" fill="#333"/></svg>`;
  const lineIcon = `<svg viewBox="0 0 24 24" width="17" height="17"><rect x="3" y="5" width="18" height="1.6" fill="#666"/><rect x="3" y="10.7" width="18" height="2.8" fill="#666"/><rect x="3" y="17" width="18" height="4.4" fill="#666"/></svg>`;
  const fontIcon = `<span style="font-family:Georgia,serif;color:#666;display:inline-flex;align-items:baseline;gap:1px;line-height:1"><span style="font-size:17px">A</span><span style="font-size:11px">A</span></span>`;

  const toolBtns = {}, swPanels = {};
  function buildTool(t, iconHtml, title, extra) {
    const wrap = document.createElement("span");
    wrap.className = "toolwrap";
    const btn = document.createElement("button");
    btn.innerHTML = iconHtml; btn.title = title; btn.dataset.tool = t;
    btn.addEventListener("mousedown", (e) => e.preventDefault()); // 클릭이 기존 텍스트 선택을 지우지 않게
    btn.addEventListener("click", () => setTool(t));
    wrap.appendChild(btn);
    const panel = document.createElement("div");
    panel.className = "toolpanel";
    swPanels[t] = PALETTE.map((p) => {
      const s = document.createElement("button");
      s.className = "sw"; s.style.background = p.c; s.title = p.n;
      s.addEventListener("mousedown", (e) => e.preventDefault());
      s.addEventListener("click", () => pickColor(t, p.c));
      panel.appendChild(s); return s;
    });
    if (extra === "line" || extra === "font") {
      const ctl = document.createElement("span");
      ctl.className = "ctl";
      ctl.innerHTML = extra === "line" ? lineIcon : fontIcon;
      const inp = document.createElement("input");
      inp.type = "number";
      if (extra === "line") { inp.value = "3"; inp.min = "1"; inp.max = "20"; ctl.title = "선 두께(px) — 네모 위에서 휠로도 조절"; lineWInp = inp; }
      else { inp.value = "16"; inp.min = "8"; inp.max = "96"; ctl.title = "글자 크기(px) — 텍스트 위에서 휠로도 조절"; fontSzInp = inp; }
      ctl.appendChild(inp);
      panel.appendChild(ctl);
    }
    wrap.appendChild(panel);
    annotEl.appendChild(wrap);
    toolBtns[t] = btn;
  }
  buildTool("hl", hlIcon, "형광펜 (Alt+1) — hover 로 색 선택", null);
  buildTool("box", boxIcon, "네모박스 (Alt+2) — 클릭 선택·이동·크기조절·Del 삭제, hover 로 색·두께", "line");
  buildTool("text", textIcon, "텍스트 (Alt+3) — 클릭 입력·더블클릭 재편집·Del 삭제, hover 로 색·크기", "font");

  function paintSw(t) { swPanels[t].forEach((s, i) => s.classList.toggle("active", PALETTE[i].c === toolColor[t])); }
  function pickColor(t, c) {
    toolColor[t] = c; paintSw(t);
    if (tool !== t) { tool = t; applyToolUI(); } // 색 고르면 그 도구 켜짐
    if (t === "hl") applyHlToSelection();
    else if (selectedObj) { // 선택된 주석이 그 종류면 즉시 색 변경
      if (t === "box" && selectedObj.classList.contains("pp-box")) selectedObj.style.borderColor = c;
      if (t === "text" && selectedObj.classList.contains("pp-text")) selectedObj.style.color = c;
    }
  }

  function applyToolUI() {
    document.body.classList.toggle("tool-hl", tool === "hl");
    document.body.classList.toggle("tool-box", tool === "box");
    document.body.classList.toggle("tool-text", tool === "text");
    ["hl", "box", "text"].forEach((t) => { toolBtns[t].classList.toggle("active", tool === t); paintSw(t); });
    if (tool === "hl") deselectObj(); // 형광펜 모드에선 주석이 통과(비활성)라 선택 해제
  }
  function setTool(t) {
    tool = tool === t ? null : t; // 같은 도구 재클릭 = 끄기
    applyToolUI();
    if (tool === "hl") applyHlToSelection(); // 텍스트 먼저 선택하고 눌렀으면 즉시 강조
  }
  function applyHlToSelection() {
    if (tool !== "hl") return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.rangeCount) highlightSelection();
  }

  // 형광펜: 선택 영역을 페이지 안에서 텍스트노드 단위로 <span.pp-hl> 로 감싼다.
  function highlightSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const anchor = range.startContainer;
    const bound = anchor.nodeType === 1 ? anchor : anchor.parentElement;
    const page = bound && bound.closest(".pp-page-inner");
    if (!page) return;
    const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        range.intersectsNode(n) && n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    });
    const nodes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
    nodes.forEach((node) => {
      if (node.parentElement && node.parentElement.classList.contains("pp-hl")) return;
      let s = 0, e = node.nodeValue.length;
      if (node === range.startContainer) s = range.startOffset;
      if (node === range.endContainer) e = range.endOffset;
      if (s >= e) return;
      const r = document.createRange();
      r.setStart(node, s); r.setEnd(node, e);
      const span = document.createElement("span");
      span.className = "pp-hl"; span.style.backgroundColor = hexToRgba(toolColor.hl, 0.42);
      try { r.surroundContents(span); } catch (err) { /* 경계 예외 스킵 */ }
    });
    sel.removeAllRanges();
  }
  function removeHl(hl) {
    const p = hl.parentNode;
    while (hl.firstChild) p.insertBefore(hl.firstChild, hl);
    p.removeChild(hl); p.normalize();
  }

  // ── 박스·텍스트(주석 오브젝트) 그리기·선택·이동·크기조절·편집 ──
  let boxEl = null, boxPage = null, boxStart = null; // 새로 그리는 박스
  let selectedObj = null;                            // 선택된 주석(박스 또는 텍스트)
  let editingText = null;                            // 편집 중인 텍스트
  let manip = null;                                  // {mode:'move'|'resize', dir, g0, pr, sx, sy}

  const geom = (b) => ({
    l: parseFloat(b.style.left) || 0, t: parseFloat(b.style.top) || 0,
    w: parseFloat(b.style.width) || b.offsetWidth || 0,
    h: parseFloat(b.style.height) || b.offsetHeight || 0,
  });
  function drawBox(e) {
    const r = boxPage.getBoundingClientRect();
    const x = Math.max(0, Math.min(boxStart.x - r.left, e.clientX - r.left));
    const y = Math.max(0, Math.min(boxStart.y - r.top, e.clientY - r.top));
    const w = Math.min(Math.abs(e.clientX - boxStart.x), r.width - x);
    const h = Math.min(Math.abs(e.clientY - boxStart.y), r.height - y);
    Object.assign(boxEl.style, { left: x + "px", top: y + "px", width: w + "px", height: h + "px" });
  }
  function selectObj(el) {
    if (selectedObj === el) return;
    deselectObj();
    selectedObj = el;
    el.classList.add("sel");
    if (el.classList.contains("pp-box")) {
      ["nw", "n", "ne", "e", "se", "s", "sw", "w"].forEach((d) => {
        const hdl = document.createElement("div");
        hdl.className = "bh " + d; hdl.dataset.dir = d;
        el.appendChild(hdl);
      });
    }
  }
  function deselectObj() {
    if (!selectedObj) return;
    selectedObj.querySelectorAll(".bh").forEach((h) => h.remove());
    selectedObj.classList.remove("sel");
    selectedObj = null;
  }
  function createText(page, e) {
    const r = page.getBoundingClientRect();
    const el = document.createElement("div");
    el.className = "pp-annot pp-text";
    const fs = parseInt(fontSzInp.value, 10) || 16;
    // 클릭점 = I-beam 커서 세로 막대의 중앙(hotspot). 텍스트 줄 중앙을 여기에 맞춘다.
    // top = 클릭Y - (padding-top 1px + line-height/2). CSS: padding 1px 2px, line-height 1.3.
    el.style.left = Math.max(0, e.clientX - r.left - 2) + "px";     // padding-left 2px 보정
    el.style.top = Math.max(0, e.clientY - r.top - (1 + fs * 1.3 / 2)) + "px";
    el.style.color = toolColor.text;
    el.style.fontSize = fs + "px";
    el.addEventListener("blur", () => endEdit(el));
    page.appendChild(el);
    selectObj(el);
    editText(el);
  }
  function placeCaretEnd(el) {
    const r = document.createRange();
    r.selectNodeContents(el); r.collapse(false);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  function editText(el) {
    editingText = el;
    el.contentEditable = "true";
    el.classList.add("editing");
    el.focus();
    placeCaretEnd(el);
  }
  // 편집 종료(Esc·Ctrl+Enter·바깥클릭·blur 어디서 와도 1회만 — idempotent). 캐럿도 확실히 제거.
  function endEdit(el) {
    if (!el.classList.contains("editing")) return;
    el.classList.remove("editing");
    el.contentEditable = "false";
    if (editingText === el) editingText = null;
    const s = window.getSelection(); if (s) s.removeAllRanges(); // 남은 캐럿 제거
    el.blur();
    if (!el.textContent.trim()) { if (selectedObj === el) deselectObj(); el.remove(); } // 빈 텍스트 제거
    else if (selectedObj === el) deselectObj(); // 커밋 후 선택 해제 → 파란 테두리 없이 글자만
  }

  pagesEl.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    // 편집 중 텍스트 바깥 클릭 = 편집 종료(이 클릭은 소비)
    if (editingText && !editingText.contains(e.target)) { editingText.blur(); e.preventDefault(); return; }
    if (tool === "hl") return; // 형광펜은 mouseup 에서 처리

    // 리사이즈 핸들 / 주석 선택·이동
    const hdl = e.target.closest(".bh");
    if (hdl) {
      const box = hdl.parentElement;
      selectObj(box);
      manip = { mode: "resize", dir: hdl.dataset.dir, g0: geom(box), pr: box.parentElement.getBoundingClientRect(), sx: e.clientX, sy: e.clientY };
      e.preventDefault(); return;
    }
    const annot = e.target.closest(".pp-annot");
    if (annot) {
      if (annot.classList.contains("editing")) return; // 편집 중엔 캐럿/텍스트선택 허용
      selectObj(annot);
      manip = { mode: "move", g0: geom(annot), pr: annot.parentElement.getBoundingClientRect(), sx: e.clientX, sy: e.clientY };
      e.preventDefault(); return;
    }
    // 빈 곳: 그리기(box) / 텍스트 배치(text) / 해제(null)
    const page = e.target.closest(".pp-page");
    if (tool === "box" && page) {
      boxPage = page;
      boxStart = { x: e.clientX, y: e.clientY };
      boxEl = document.createElement("div");
      boxEl.className = "pp-annot pp-box";
      boxEl.style.border = `${parseInt(lineWInp.value, 10) || 3}px solid ${toolColor.box}`;
      page.appendChild(boxEl);
      drawBox(e);
      e.preventDefault(); return;
    }
    if (tool === "text" && page) { createText(page, e); e.preventDefault(); return; }
    deselectObj();
  });

  pagesEl.addEventListener("dblclick", (e) => {
    const t = e.target.closest(".pp-text");
    if (t) { selectObj(t); editText(t); }
  });

  // 네모/텍스트 위에서 휠 → 두께/글자크기 조절 + 기본값으로 기억(다음 신규가 같은 값).
  pagesEl.addEventListener("wheel", (e) => {
    if (tool === "hl") return; // 형광펜 모드는 주석 통과
    const box = e.target.closest(".pp-box");
    const txt = box ? null : e.target.closest(".pp-text");
    if (!box && !txt) return;
    e.preventDefault();
    const d = e.deltaY < 0 ? 1 : -1;
    if (box) {
      const cur = Math.round(parseFloat(getComputedStyle(box).borderTopWidth)) || 3;
      const v = Math.max(1, Math.min(20, cur + d));
      box.style.borderWidth = v + "px";
      if (lineWInp) lineWInp.value = v; // 기본값 갱신
    } else {
      const cur = Math.round(parseFloat(getComputedStyle(txt).fontSize)) || 16;
      const v = Math.max(8, Math.min(96, cur + d));
      txt.style.fontSize = v + "px";
      if (fontSzInp) fontSzInp.value = v;
    }
  }, { passive: false });

  document.addEventListener("mousemove", (e) => {
    if (boxEl) { drawBox(e); return; }
    if (!manip || !selectedObj) return;
    const { g0, pr, dir } = manip;
    const dx = e.clientX - manip.sx, dy = e.clientY - manip.sy;
    let { l, t, w, h } = g0;
    if (manip.mode === "move") { l = g0.l + dx; t = g0.t + dy; }
    else {
      if (dir.includes("e")) w = g0.w + dx;
      if (dir.includes("s")) h = g0.h + dy;
      if (dir.includes("w")) { l = g0.l + dx; w = g0.w - dx; }
      if (dir.includes("n")) { t = g0.t + dy; h = g0.h - dy; }
    }
    if (w < 8) { if (manip.mode === "resize" && dir.includes("w")) l = g0.l + g0.w - 8; w = 8; }
    if (h < 8) { if (manip.mode === "resize" && dir.includes("n")) t = g0.t + g0.h - 8; h = 8; }
    const st = {};
    if (manip.mode === "move") { // 페이지 안으로 완전 클램프(크기 고정)
      l = Math.max(0, Math.min(l, pr.width - g0.w));
      t = Math.max(0, Math.min(t, pr.height - g0.h));
    } else {
      l = Math.max(0, l); t = Math.max(0, t);
      w = Math.min(w, pr.width - l); h = Math.min(h, pr.height - t);
      st.width = w + "px"; st.height = h + "px";
    }
    st.left = l + "px"; st.top = t + "px";
    Object.assign(selectedObj.style, st);
  });

  document.addEventListener("mouseup", (e) => {
    if (boxEl) {
      const g = geom(boxEl);
      if (g.w < 8 || g.h < 8) boxEl.remove(); // 너무 작으면 취소
      else selectObj(boxEl);                  // 그린 뒤 바로 선택(도구 안 꺼도 조작 가능)
      boxEl = null; boxPage = null; boxStart = null;
      return;
    }
    if (manip) { manip = null; return; }
    if (tool === "hl") {
      const inPage = e.target.closest && e.target.closest(".pp-page");
      if (!inPage) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) { setTimeout(highlightSelection, 0); return; }
      const hl = e.target.closest(".pp-hl");
      if (hl) removeHl(hl);
    }
  });

  // 두께·글자크기 입력 → 선택된 주석에 즉시 반영(+ 새 주석 기본값)
  lineWInp.addEventListener("change", () => {
    if (selectedObj && selectedObj.classList.contains("pp-box"))
      selectedObj.style.borderWidth = (parseInt(lineWInp.value, 10) || 3) + "px";
  });
  fontSzInp.addEventListener("change", () => {
    if (selectedObj && selectedObj.classList.contains("pp-text"))
      selectedObj.style.fontSize = (parseInt(fontSzInp.value, 10) || 16) + "px";
  });

  // 단축키 + 선택 주석 키보드 조작
  document.addEventListener("keydown", (e) => {
    const ae = document.activeElement;
    const inField = ae && (ae.tagName === "INPUT" || ae.tagName === "SELECT" || ae.tagName === "TEXTAREA" || ae.isContentEditable);
    if (e.altKey && (e.code === "Digit1" || e.code === "Numpad1")) { e.preventDefault(); setTool("hl"); return; }
    if (e.altKey && (e.code === "Digit2" || e.code === "Numpad2")) { e.preventDefault(); setTool("box"); return; }
    if (e.altKey && (e.code === "Digit3" || e.code === "Numpad3")) { e.preventDefault(); setTool("text"); return; }
    // 편집 종료: Esc 또는 Ctrl/Cmd+Enter — 한 번에 빠져나오고 캐럿 제거
    if (editingText && (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey)))) {
      e.preventDefault(); endEdit(editingText); return;
    }
    if (e.key === "Escape") { tool = null; applyToolUI(); deselectObj(); return; }
    if (selectedObj && !selectedObj.isConnected) selectedObj = null; // 재계산으로 페이지 교체
    if (inField || !selectedObj) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      const b = selectedObj; deselectObj(); b.remove();
      return;
    }
    const step = e.shiftKey ? 10 : 1;
    const g = geom(selectedObj), pr = selectedObj.parentElement.getBoundingClientRect();
    let moved = true;
    if (e.key === "ArrowLeft") g.l -= step;
    else if (e.key === "ArrowRight") g.l += step;
    else if (e.key === "ArrowUp") g.t -= step;
    else if (e.key === "ArrowDown") g.t += step;
    else moved = false;
    if (moved) {
      e.preventDefault();
      g.l = Math.max(0, Math.min(g.l, pr.width - g.w));
      g.t = Math.max(0, Math.min(g.t, pr.height - g.h));
      Object.assign(selectedObj.style, { left: g.l + "px", top: g.t + "px" });
    }
  });

  applyToolUI(); // 초기 버튼/패널 상태
  $("save").addEventListener("click", () => window.print());

  injectStyles();
  await paginate();
})();
