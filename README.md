# Shanghai Tech 2026

두 사람의 상하이 5박 6일 여행 홈페이지입니다. 이 GitHub 저장소가 일정과 화면의 편집 원본이며, GitHub Pages로 바로 게시합니다.

- 홈페이지: https://ingunbi.github.io/shanghai-tech-2026/ (중국 현지에서도 접속 가능)
- `main`의 `dist/`를 수정하면 GitHub Actions의 **Publish Shanghai site**가 검사 후 자동 반영합니다.
- Claude Code와 Codex 모두 이 저장소에서 작업합니다.

## 수정하고 반영하기

1. 최신 `main`을 받아 수정합니다. 검토가 필요하면 브랜치와 PR을 이용합니다.
2. 아래 검사를 실행하고 실제 화면을 확인합니다.
3. PR을 `main`에 병합하거나, 사용자가 허용한 변경을 `main`에 push합니다.
4. **Actions → Publish Shanghai site**가 성공하고 홈페이지에 변경이 보이는지 확인합니다. push만으로 반영됐다고 판단하지 않습니다.

```sh
node scripts/validate-public-site.mjs
```

검사가 실패하면 배포되지 않고 기존 홈페이지가 유지됩니다. 필요하면 같은 workflow의 **Run workflow**로 현재 `main`을 다시 배포합니다.

## 파일과 로컬 미리보기

- `dist/data-public.js`: 일정, 식당, 준비 항목, 지도와 유튜브 후보 데이터
- `dist/index.html`: 페이지 구조
- `dist/styles.css`: 반응형·인쇄 스타일
- `dist/app-public.js`: 날짜 전환, 복사, 체크·개인 메모·영상 후보
- `dist/journey-map.js`: 지도와 날짜별 경로 표시
- `dist/assets/`, `dist/vendor/`: 공개 이미지와 라이브러리
- `scripts/validate-public-site.mjs`: 공개 파일·문법·자산·지도/영상 날짜 검사
- `.github/workflows/pages.yml`: 검사 후 `dist/`를 GitHub Pages로 게시

별도 빌드나 패키지 설치는 필요하지 않습니다. Node.js 24 이상을 사용합니다.

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

브라우저에서 http://127.0.0.1:4173 을 엽니다.

## 일정 편집 원칙

일정을 바꾸면 `days`, `journeyMap.days`, 지도 장소, `videoGuide.places`의 반영 날짜와 방문 순서를 함께 맞춥니다. 영상의 한 권역 중 일부만 방문하면 카드와 지도에도 그 범위를 적습니다. 동선은 가까운 권역끼리 묶고 로봇·드론·식사·귀국 준비 시간을 고려합니다. 새 영업시간·예약 조건·주소는 공식 자료를 확인하고 출처를 남깁니다.

체크와 개인 메모·찜은 방문자의 브라우저에만 저장됩니다.

## 공개 범위

이 저장소와 홈페이지는 공개입니다. 항공·호텔 예약번호, 여권 정보, 개인 전화번호 등 개인 연락처, 예약 원문, 이메일 내용, 인증정보를 파일이나 커밋에 넣지 마세요. 필요한 공개 사업장 연락처와 출처는 사용할 수 있습니다. 자동 검사는 보조 수단이므로 추가 내용과 이미지가 공개 가능한지 직접 검토합니다.
