# 나의 서재

『잘 지내냐고 물으면 — 대답이 조금 길어질 것 같다』를 읽는 작은 웹앱입니다.
서재의 책 표지나 ‘책 펼치기’를 누르면 독서 화면으로 들어갑니다.

## 실행

이 폴더에서 `run-library.cmd`를 실행한 뒤 [나의 서재](http://localhost:3838)를 엽니다.
Node.js 18 이상이 있으면 터미널에서 `npm start`로도 실행할 수 있습니다. 패키지 설치나 빌드는 필요하지 않습니다.

서버는 이 컴퓨터의 `127.0.0.1`에서만 열립니다. 종료는 실행 창에서 `Ctrl+C`를 누릅니다.
포트가 사용 중이면 PowerShell에서 `$env:PORT=3839; npm start`처럼 변경할 수 있습니다.

## 사용

- 책 표지 또는 ‘책 펼치기’로 첫 장을 엽니다. 읽은 기록이 있으면 ‘이어서 읽기’로 바뀝니다.
- 목차와 이야기 아래의 이전·다음 버튼으로 여섯 장을 이동합니다.
- 오른쪽 위의 ‘가’ 버튼으로 글자 크기, 달 버튼으로 화면 밝기를 바꿉니다.
- 모바일에서는 오른쪽 위 목차 버튼을 눌러 이동합니다.
- 읽던 위치와 설정은 현재 브라우저에만 저장됩니다. 저장소 접근이 차단되어도 독서는 가능합니다.

## 원고와 파일

- `dist/content/manuscript.txt`: 첨부 원고를 바이트 그대로 보존한 원본.
- `dist/content/manuscript.json`: 책 제목·부제와 여섯 장의 표시용 데이터. 실제 화면을 수정하려면 이 JSON을 편집합니다.
- 각 장의 `title`, `period`, `blocks`가 화면을 구성합니다. 블록 종류는 `paragraph`, `heading`, `note`, `verse`입니다.
- 원문에 포함된 구성 메모와 여러 에필로그 초안도 남겨 두었습니다. 문장과 오탈자는 임의로 고치지 않았습니다.
- `dist/assets/book-cover.png`: 선택한 1번 겨자 표지. 부제만 최신 원고에 맞췄습니다.
- `dist/assets/library-room.png`: 서재 배경.
- `dist/assets/NanumMyeongjo-Regular.ttf`: 본문용 나눔명조. [Google Fonts 원본](https://github.com/google/fonts/tree/main/ofl/nanummyeongjo)을 사용하며 라이선스는 같은 폴더의 `NanumMyeongjo-OFL.txt`에 있습니다.
- `generation-prompts.json`: built-in imagegen으로 만든 이미지의 프롬프트와 출처 경로.
- `dist/index.html`, `styles.css`, `app.js`: 화면과 독서 기능.
- `server.mjs`: 외부 의존성 없는 로컬 정적 서버.

## Cloudflare Workers 배포

`wrangler.jsonc`가 `dist`를 정적 파일 폴더로 지정합니다. 저장소에 이 파일과 `dist` 전체를 함께 올립니다.
Cloudflare에서 GitHub 저장소를 연결한 뒤 다음과 같이 설정합니다.

| 항목 | 값 |
| --- | --- |
| Project name | `book` |
| Build command | 비워 두기 |
| Deploy command | `npx wrangler deploy` |
| Preview command | `npx wrangler preview` |
| Root directory | 저장소 최상위 `/` |

환경 변수와 별도의 서버 코드는 필요하지 않습니다. `server.mjs`는 로컬 확인에만 사용합니다.
[공식 설정 안내](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)

음원은 포함하지 않았습니다.
