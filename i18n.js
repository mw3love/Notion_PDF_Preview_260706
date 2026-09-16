// 다국어 문자열 테이블 — 미리보기 UI 전용(런타임 토글 가능).
// manifest(확장 이름·설명·버튼 툴팁)는 _locales/ + chrome.i18n 이 담당한다:
//   chrome.i18n 은 브라우저 UI 언어에 고정돼 런타임 전환이 불가능해서, 토글이 필요한
//   화면 문자열은 여기 자체 테이블로 관리한다. 기본값은 언제나 en(브라우저 언어 자동감지 안 함).
// 세 컨텍스트가 공유: preview.html(<script>), background.js(importScripts), content-snapshot.js(executeScript files 순서).
(function (root) {
  const STR = {
    en: {
      appName: "Page Break Preview",
      previewFallback: "Preview",
      pill: "{0} / {1}",
      noHeadings: "No headings found",
      noSnapshot: "No snapshot. Open a Notion page and click the extension button.",
      loading: "Loading…",
      calculating: "Calculating…",
      overflow: "⚠ {0} block(s) taller than one page (clipped)",
      paper: "Paper",
      margins: "Margins",
      marginV: "Vert",
      marginH: "Horiz",
      mm: "mm",
      scale: "Scale",
      centerImg: "Center images",
      centerImgTitle: "Center media blocks (image/video/file/PDF/embed) horizontally on the page; text keeps its original alignment",
      print: "Print",
      langToggle: "한국어",
      langToggleTitle: "Switch interface language to Korean",
      colorBlack: "Black",
      colorWhite: "White",
      colorRed: "Red",
      colorCoral: "Coral",
      colorBlue: "Blue",
      lineWidthTitle: "Line width (px) — also adjustable with the wheel over a box",
      fontSizeTitle: "Font size (px) — also adjustable with the wheel over a text",
      toolHl: "Highlighter (Alt+1) — hover to pick a color",
      toolBox: "Box (Alt+2) — click to select, move, resize, Del to delete; hover for color & width",
      toolText: "Text (Alt+3) — click to type, double-click to edit, Del to delete; hover for color & size",
      thumbHandleTitle: "Click: collapse/expand thumbnails",
      tocHandleTitle: "Click: collapse/expand outline",
      thumbResizeTitle: "Drag: resize the thumbnail rail",
      tocResizeTitle: "Drag: resize the outline rail",
      snapBusy: "Taking a page snapshot…",
      snapNoContent: "Could not find the Notion body (.notion-page-content).",
      snapSaveFail: "Snapshot save failed: {0}",
      notNotionHtml:
        "<h2>Run this on a Notion page</h2><p>Open a notion.so / notion.com page tab, then click the extension button.</p>",
    },
    ko: {
      appName: "페이지 나눔 미리보기",
      previewFallback: "미리보기",
      pill: "{0} / {1} 쪽",
      noHeadings: "제목(헤딩)이 없습니다",
      noSnapshot: "스냅샷이 없습니다. Notion 페이지에서 확장 버튼을 눌러 실행하세요.",
      loading: "불러오는 중…",
      calculating: "계산 중…",
      overflow: "⚠ 한 페이지보다 큰 블록 {0}개(잘림)",
      paper: "용지",
      margins: "여백",
      marginV: "상하",
      marginH: "좌우",
      mm: "mm",
      scale: "배율",
      centerImg: "이미지 가운데",
      centerImgTitle: "이미지·비디오·파일·PDF·임베드 등 미디어 블록을 페이지 가로 중앙에 정렬(텍스트는 원본 정렬 유지)",
      print: "인쇄",
      langToggle: "English",
      langToggleTitle: "화면 언어를 영어로 전환",
      colorBlack: "검정",
      colorWhite: "흰색",
      colorRed: "빨강",
      colorCoral: "코랄",
      colorBlue: "파랑",
      lineWidthTitle: "선 두께(px) — 네모 위에서 휠로도 조절",
      fontSizeTitle: "글자 크기(px) — 텍스트 위에서 휠로도 조절",
      toolHl: "형광펜 (Alt+1) — hover 로 색 선택",
      toolBox: "네모박스 (Alt+2) — 클릭 선택·이동·크기조절·Del 삭제, hover 로 색·두께",
      toolText: "텍스트 (Alt+3) — 클릭 입력·더블클릭 재편집·Del 삭제, hover 로 색·크기",
      thumbHandleTitle: "클릭: 썸네일 접기/펼치기",
      tocHandleTitle: "클릭: 목차 접기/펼치기",
      thumbResizeTitle: "드래그: 썸네일 레일 너비 조절",
      tocResizeTitle: "드래그: 목차 레일 너비 조절",
      snapBusy: "페이지 스냅샷 중…",
      snapNoContent: "Notion 본문(.notion-page-content)을 찾지 못했습니다.",
      snapSaveFail: "스냅샷 저장 실패: {0}",
      notNotionHtml:
        "<h2>Notion 페이지에서 실행하세요</h2><p>app.notion.com 페이지 탭을 활성화한 뒤 확장 버튼을 누르세요.</p>",
    },
  };

  const I = {
    LANGS: ["en", "ko"],
    lang: "en", // 기본값 = 영어(저장된 선택이 있을 때만 바뀜)
    STR,
    t(key, ...args) {
      const tb = STR[I.lang] || STR.en;
      const s = tb[key] != null ? tb[key] : STR.en[key] != null ? STR.en[key] : key;
      return String(s).replace(/\{(\d+)\}/g, (m, i) => (args[i] != null ? args[i] : m));
    },
    // 저장된 언어 선택을 읽어 I.lang 에 반영(없으면 en 유지). storage 접근 실패는 무시.
    async load() {
      try {
        const d = await chrome.storage.local.get("ppLang");
        if (d && I.LANGS.includes(d.ppLang)) I.lang = d.ppLang;
      } catch (e) {}
      return I.lang;
    },
    async save(lang) {
      I.lang = I.LANGS.includes(lang) ? lang : "en";
      try { await chrome.storage.local.set({ ppLang: I.lang }); } catch (e) {}
      return I.lang;
    },
    other() { return I.lang === "ko" ? "en" : "ko"; },
  };

  root.PP_I18N = I;
})(typeof self !== "undefined" ? self : this);
