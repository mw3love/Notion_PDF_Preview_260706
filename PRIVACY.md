# 개인정보처리방침 (Privacy Policy)

**Notion용 페이지 나눔 미리보기** (Page Break Preview for Notion) 확장 프로그램

[English version below](#privacy-policy-english)

최종 수정일: 2026-09-25

## 요약

이 확장 프로그램은 사용자의 개인정보를 **수집·저장·전송하지 않습니다.** 모든 처리는 사용자의 브라우저 안에서만 이루어지며, 개발자를 포함한 어떤 제3자 서버로도 데이터가 전송되지 않습니다.

## 수집하는 정보

없음. 이 확장 프로그램은 분석(analytics)·광고·오류 리포팅 등 어떤 형태의 원격 수집 코드도 포함하지 않습니다.

## 접근하는 데이터와 사용 목적

| 접근 대상 | 목적 | 전송 위치 |
|---|---|---|
| `app.notion.com`, `*.notion.so` 페이지의 본문(DOM)·CSS | 인쇄 미리보기를 화면에 그리기 위한 스냅샷 | 브라우저 내부에서만 처리, 어디로도 전송되지 않음 |
| Notion 이미지(`*.notionusercontent.com` 등) | 미리보기·인쇄 화면에 이미지를 표시하기 위해 `data:` URL로 인라인 변환 | 요청은 Notion 서버로만 나가고(사용자가 이미 로그인한 세션으로), 결과는 브라우저 안에만 저장 |
| `chrome.storage` | 페이지 스냅샷·인라인 이미지 데이터를 미리보기 탭에 전달, 화면 언어(영어/한국어) 선택 기억 | 사용자의 로컬 기기에만 저장(동기화 안 함), 외부 전송 없음 |

이 확장 프로그램이 통신하는 도메인은 `notion.so`, `notion.com`, `notionusercontent.com` 뿐이며, 그 외 어떤 서버로도 요청을 보내지 않습니다.

## 데이터 판매·공유

하지 않습니다. 수집하는 데이터 자체가 없습니다.

이 확장은 Notion Labs, Inc.와 제휴·승인 관계가 없는 비공식 도구입니다. Notion은 Notion Labs, Inc.의 상표입니다.

## 문의

이 확장 프로그램과 관련한 문의는 GitHub 저장소 이슈로 남겨주세요:
https://github.com/mw3love/Notion_PDF_Preview_260706/issues

---

## Privacy Policy (English)

**Page Break Preview for Notion** browser extension

Last updated: 2026-09-25

### Summary

This extension does **not collect, store, or transmit** any personal information. All processing happens inside your browser, and no data is sent to the developer or any third-party server.

### Information collected

None. The extension contains no analytics, advertising, or error-reporting code of any kind.

### Data accessed and why

| Accessed | Purpose | Where it goes |
|---|---|---|
| Page content (DOM) and CSS of `app.notion.com` / `*.notion.so` pages | Snapshot used to render the print preview | Processed inside the browser only; never transmitted |
| Notion images (`*.notionusercontent.com`, etc.) | Inlined as `data:` URLs so they show in the preview and printout | Requests go only to Notion's servers (using your existing signed-in session); results stay in the browser |
| `chrome.storage` | Passes the page snapshot and inlined image data to the preview tab, and remembers your interface-language choice (English/Korean) | Stored only on your local device (not synced); never transmitted |

The only domains this extension communicates with are `notion.so`, `notion.com`, and `notionusercontent.com`.

### Selling or sharing data

None. There is no collected data to sell or share.

This is an unofficial tool and is not affiliated with, endorsed by, or sponsored by Notion Labs, Inc. Notion is a trademark of Notion Labs, Inc.

### Contact

Please open an issue on the GitHub repository:
https://github.com/mw3love/Notion_PDF_Preview_260706/issues
