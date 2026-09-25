# Chrome 웹 스토어 등록정보 초안

개발자 콘솔(https://chrome.google.com/webstore/devconsole) 각 필드에 그대로 붙여넣을 수 있게 작성. 실제 등록 시 표현은 자유롭게 다듬어도 됨.

## 스토어 등록정보 탭 — 영어(기본 로케일)

기본 로케일은 `en`(`manifest.json`의 `default_locale`). 한국어 브라우저 사용자에게는 아래 「한국어」 블록이 표시됨.

**Name**
Page Break Preview for Notion

**Summary (132자 이내)**
Preview how a Notion page splits into A4-A1 sheets before exporting, annotate it, and print or save as PDF.

**Description**
Notion's built-in PDF export renders on the server, so you cannot tell where pages will break until you open the file. This extension removes that loop: the preview you see is exactly what prints (WYSIWYG).

Features:
- Recalculate page breaks instantly while changing paper size (A4-A1), margins, and scale (10-200%)
- Tables split row by row across pages, repeating the header on every continuation page
- Highlighter, box, and text annotations printed straight into the PDF
- Thumbnail rail on the left and heading outline on the right for fast navigation
- Automatic image downscaling and centering to keep print resolution

Works on Notion web (app.notion.com). Page content is processed entirely inside your browser; nothing is sent to any external server.

The interface follows your browser language (Korean or English) and can be switched from the toolbar at any time.

This is an unofficial tool and is not affiliated with, endorsed by, or sponsored by Notion Labs, Inc. Notion is a trademark of Notion Labs, Inc.

## 스토어 등록정보 탭 — 한국어

**이름**
Notion용 페이지 나눔 미리보기

**요약 (Summary, 132자 이내)**
Notion 페이지를 PDF로 내보내기 전에 A4~A1 쪽 나눔을 미리 보고, 형광펜·네모·텍스트 주석을 얹어 바로 인쇄합니다.

**자세한 설명 (Description)**
Notion의 기본 PDF 내보내기는 서버에서 렌더링되어, 내보내기 전엔 페이지가 어디서 나뉘는지 알 수 없습니다. "내보내기 → 열어서 확인 → 수정"을 반복하게 되는 이 문제를, 미리보기 화면이 곧 인쇄 결과가 되도록(WYSIWYG) 만들어 해결합니다.

주요 기능:
- A4~A1 용지, 여백, 배율(10~200%)을 즉시 바꿔가며 페이지 나눔 재계산
- 표는 행 단위로 페이지에 걸쳐 나뉘고, 이어지는 페이지마다 헤더 반복
- 형광펜·네모박스·텍스트 주석을 얹어 그대로 인쇄/PDF 저장
- 좌측 썸네일 레일, 우측 목차(헤딩) 레일로 빠른 탐색
- 이미지 자동 축소·가운데 정렬로 고해상도 인쇄 유지

대상은 Notion 웹(app.notion.com)이며, 이 확장은 Notion 페이지 콘텐츠를 브라우저 안에서만 처리합니다. 외부 서버로 어떤 데이터도 전송하지 않습니다.

화면 언어는 브라우저 언어(한국어/영어)를 따르며, 툴바 버튼으로 언제든 전환할 수 있습니다.

이 확장은 Notion Labs, Inc.와 제휴·승인 관계가 없는 비공식 도구입니다. Notion은 Notion Labs, Inc.의 상표입니다.

**카테고리**
생산성(Productivity)

**언어**
영어(기본 로케일) + 한국어. 화면 UI 언어는 브라우저 언어 기본, 툴바 버튼으로 실행 중 전환 가능

## 개인정보처리(Privacy practices) 탭

**단일 목적(Single purpose) 설명**
Notion 웹 페이지를 PDF 인쇄용으로 페이지 분할 미리보기하고, 주석을 얹어 인쇄할 수 있게 하는 것이 유일한 목적입니다.

**권한별 사용 근거(justification)**

| 권한 | 근거 |
|---|---|
| `scripting` | 툴바 버튼 클릭 시 Notion 탭에 스냅샷 스크립트를 주입해 페이지 본문·스타일을 읽기 위해 필요 |
| `activeTab` | 사용자가 명시적으로 클릭한 현재 탭에서만 동작하도록 최소 권한으로 제한하기 위해 필요 |
| `storage` | 페이지 스냅샷·인라인 이미지 데이터를 미리보기 탭으로 전달하고, 사용자가 고른 화면 언어(`ppLang`)를 다음 실행 때까지 유지하기 위해 필요 |
| `unlimitedStorage` | 스냅샷에 이미지가 `data:` URL로 인라인되어 용량이 커질 수 있어 기본 저장 한도를 넘기지 않기 위해 필요 |
| `host_permissions` (`*.notion.so`, `*.notion.com`, `*.notionusercontent.com`) | Notion 본문·이미지를 읽어 미리보기를 만들고, 인증이 걸린 이미지를 CORS 우회로 가져오기 위해 필요. Notion 도메인 외에는 접근하지 않음 |

**원격 코드 사용 여부**
없음. 모든 코드는 패키지에 포함되어 있으며 외부에서 코드를 내려받아 실행하지 않습니다.

**데이터 사용 선언 체크박스 (콘솔에서 그대로 체크)**
- 개인 식별 정보 수집: 아니오
- 건강 정보: 아니오
- 금융·결제 정보: 아니오
- 인증 정보: 아니오
- 개인 통신: 아니오
- 위치: 아니오
- 웹 이력: 아니오
- 사용자 활동(클릭·스크롤 등 추적): 아니오
- 웹사이트 콘텐츠: **예** — Notion 페이지 본문(스냅샷용, 브라우저 내부 처리만)

**개인정보처리방침 URL**
`PRIVACY.md`를 저장소에 push한 뒤:
https://github.com/mw3love/Notion_PDF_Preview_260706/blob/main/PRIVACY.md

## 스크린샷

`store-assets/screenshots/`에 2장 준비됨(A4 2쪽 / A3 1쪽). 1280×800 또는 640×400 규격, 최소 1장 필요.
