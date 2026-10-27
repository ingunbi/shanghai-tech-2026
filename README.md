# Shanghai Tech 2026

두 사람의 상하이 5박 6일 여행 홈페이지입니다. 이 비공개 GitHub 저장소가 일정과 공개 화면의 편집 원본입니다.

- 홈페이지(중국에서 접속 가능): https://ingunbi.github.io/shanghai-2026/
- 이전 주소(중국에서 차단될 수 있음): https://shanghai-tech-2026.chris-ingunbi.chatgpt.site
- `main`의 공개 파일을 수정하면 GitHub Actions가 검사 후 두 주소에 자동 반영합니다. GitHub Pages 주소는 **Publish GitHub Pages mirror**가 `dist/`만 공개 저장소 `ingunbi/shanghai-2026`에 복사해 게시합니다.
- Claude Code와 Codex 모두 이 저장소에서 작업합니다. 별도로 Codex에 배포를 요청할 필요가 없습니다.

## 수정하고 반영하기

1. 최신 `main`을 받아 새 브랜치에서 수정합니다. 변경 요청(PR)을 이용하면 반영 전 서로 검토할 수 있습니다.
2. 아래 검사를 실행하고 실제 화면을 확인합니다.
3. PR을 `main`에 병합하거나, 사용자가 허용한 변경을 `main`에 push합니다.
4. GitHub의 **Actions → Publish Shanghai site**가 성공했는지 확인합니다. 보통 작업이 실행된 뒤 수 분 안에 반영되며, Actions 대기열과 네트워크에 따라 달라집니다.

```sh
node scripts/validate-public-site.mjs
node scripts/publish-site.mjs --dry-run
```

`--dry-run`은 토큰 없이 파일과 배포 크기만 검사하며 서버에 전송하지 않습니다. 실제 배포는 GitHub Actions가 수행합니다. 필요할 때 같은 workflow의 **Run workflow**로 현재 `main`을 다시 배포할 수 있습니다.

검사 또는 업로드가 실패하면 기존 정상 홈페이지를 계속 제공합니다. 실패한 작업은 Actions 로그에서 원인을 확인하고 수정한 뒤 다시 실행합니다. 파일이 변경된 줄만으로 반영됐다고 판단하지 말고 workflow 성공과 공개 화면을 확인하세요.

## 파일과 로컬 미리보기

- `dist/data-public.js`: 일정, 식당, 준비 항목, 지도와 유튜브 후보 데이터
- `dist/index.html`: 페이지 구조
- `dist/styles.css`: 반응형·인쇄 스타일
- `dist/app-public.js`: 날짜 전환, 복사, 체크·개인 메모·영상 후보
- `dist/journey-map.js`: 지도와 날짜별 경로 표시
- `dist/assets/`, `dist/vendor/`: 공개 이미지와 라이브러리
- `scripts/validate-public-site.mjs`: 공개 파일·문법·자산·지도/영상 날짜 검사
- `scripts/publish-site.mjs`: 검증된 스냅샷의 인증 전송과 반영 확인

별도 빌드나 패키지 설치는 필요하지 않습니다. Node.js 24 이상을 사용합니다.

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

브라우저에서 http://127.0.0.1:4173 을 엽니다.

## 일정 편집 원칙

일정을 바꾸면 `days`, `journeyMap.days`, 지도 장소, `videoGuide.places`의 반영 날짜와 방문 순서를 함께 맞춥니다. 영상의 한 권역 중 일부만 방문하면 카드와 지도에도 그 범위를 적습니다. 동선은 가까운 권역끼리 묶고 로봇·드론·식사·귀국 준비 시간을 고려합니다. 새 영업시간·예약 조건·주소는 공식 자료를 확인하고 출처를 남깁니다.

체크와 개인 메모·찜은 방문자의 브라우저에 저장됩니다. 홈페이지 주소를 유지하므로 기존 브라우저 기록도 같은 출처에서 이어집니다.

## 공개 범위와 배포 자격증명

저장소는 비공개로 유지하며, 홈페이지에는 검사를 통과한 `dist/`만 공개합니다. 항공·호텔 예약번호, 여권 정보, 개인 연락처, 예약 원문, 이메일 내용, 인증정보를 파일이나 커밋에 넣지 마세요. 필요한 공개 사업장 연락처와 출처는 사용할 수 있습니다. 자동 검사는 보조 수단이므로 추가 내용과 이미지가 공개 가능한지 직접 검토합니다.

배포 전용 값은 GitHub repository secret **`SHANGHAI_DEPLOY_TOKEN`**과 Sites의 비밀 환경변수에만 저장합니다. 값을 채팅·코드·명령 인자·로그에 출력하지 않습니다. 수정에 개인 GitHub 토큰을 홈페이지에 전달할 필요가 없습니다.

배포는 인증된 수신 기능이 파일 경로·해시·형식·크기를 다시 검사하고, 전체 파일 저장이 성공한 뒤 활성 버전을 바꿉니다. 공개 파일 제한은 300개, 파일당 5 MiB, 전체 8 MiB, 인코딩한 요청 12 MiB입니다.

## 이전 동기화 방식

예전 Sites→GitHub 복사와 `scripts/sync-site.py` 후크는 중지했습니다. 이 스크립트는 자동 배포 workflow가 있으면 모든 모드를 거부합니다. 재설치하거나 강제 push로 우회하지 마세요. GitHub의 최신 편집을 이전 Sites 파일로 덮어쓸 수 있습니다.

Sites의 Worker·저장소·배포 수신 기능은 별도의 운영 코드입니다. 그 원본 Git 이력, 로컬 비공개 검사 목록, 배포 자격증명은 이 저장소로 가져오지 않습니다. 일반 여행 정보·디자인 변경은 이 저장소의 `dist/`에서 처리합니다.
