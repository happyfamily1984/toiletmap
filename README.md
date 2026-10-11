# 살뜰 화장실맵

과천·안양·의왕 지역 화장실 위치, 설명, 비밀번호를 함께 기록하고 보는 **모바일 웹앱**과
그 웹페이지를 바로 열어주는 **안드로이드 앱**입니다.

## 기능

- **접속 코드**: 처음 접속하면 4자리 숫자 코드(기본 `6511`)를 입력해야 지도를 보고 등록할 수 있습니다.
  - 한 번 입력하면 30일간 유지됩니다.
  - 틀린 코드를 5번 입력하면 10분간 잠깁니다.
- **지도**: 앱을 열면 네이버 지도에 등록된 화장실 위치(초록색 `WC` 핀)가 표시됩니다.
- **확대하면 이름·비밀번호 표시**: 지도를 줌 레벨 16 이상으로 확대하면 핀이 `이름 + 🔑 비밀번호` 라벨로 바뀝니다.
- **등록**: 오른쪽 **＋ 화장실 등록** 버튼을 누른 뒤, 지도를 줌 레벨 16 이상으로 확대하고 위치를 누르면
  주소가 자동으로 채워진 입력창이 뜹니다. 화장실 이름, 비밀번호, 설명을 입력해 저장합니다.
  (버튼을 누르지 않았거나 덜 확대된 상태에서는 지도를 눌러도 입력창이 뜨지 않습니다. 상단 주소 검색은 해당 위치로 이동만 합니다.)
- **조회·수정·삭제**: 핀을 누르면 상세정보(비밀번호 크게 표시)와 수정/삭제 버튼이 나옵니다.
- **지역 제한**: 과천시·안양시·의왕시 안에서만 등록됩니다(서버에서도 검사).
- **내 위치** 버튼, 과천/안양/의왕으로 바로 이동하는 메뉴가 있습니다.
- 홈 화면에 추가(PWA)할 수 있습니다.

## 구성

```
server/      Node.js(Express) 서버: 접속 코드 인증, 화장실 데이터 API, PostgreSQL(또는 JSON 파일) 저장
public/      모바일 웹페이지 (네이버 지도 JS API v3)
android/     웹페이지를 여는 안드로이드 앱 (WebView)
```

## 1. 네이버 지도 API 키 발급

1. [네이버 클라우드 플랫폼 콘솔](https://console.ncloud.com) → **Services > Application Services > Maps** 로 이동합니다.
2. **Application 등록**을 누르고 `Dynamic Map`과 `Geocoding`, `Reverse Geocoding`을 선택합니다.
3. **Web 서비스 URL**에 웹앱 주소를 등록합니다. (예: `https://toiletmap.example.com`, 테스트용 `http://localhost:3000`)
4. 발급된 **Client ID**를 `NAVER_MAP_CLIENT_ID` 로 사용합니다.

## 2. 웹 서버 실행

Node.js 18 이상이 필요합니다.

```bash
npm install
NAVER_MAP_CLIENT_ID=발급받은ClientID SESSION_SECRET=아무_긴_문자열 npm start
# → http://localhost:3000  (DATABASE_URL 이 없으면 data/toilets.json 에 저장)
```

| 환경변수 | 설명 |
| --- | --- |
| `NAVER_MAP_CLIENT_ID` | 네이버 지도 Client ID (필수) |
| `DATABASE_URL` | PostgreSQL 접속 주소 (Neon 등). 없으면 `data/toilets.json` 파일에 저장 |
| `ACCESS_CODE` | 4자리 접속 코드 (기본 `6511`). 바꾸면 기존 로그인은 모두 풀립니다 |
| `SESSION_SECRET` | 로그인 쿠키 서명용 비밀 문자열 (권장) |
| `ADFIT_AD_UNIT` | 카카오 애드핏 광고 단위 ID (`DAN-...`). 넣으면 지도 아래에 배너가 나옵니다 |
| `PORT` | 포트 (기본 3000) |

### 무료 배포 (Render 무료 + Neon 무료 DB)

1. **Neon 데이터베이스 만들기** — https://console.neon.tech
   - 가입 후 새 프로젝트 생성 (Region: **AWS Asia Pacific (Singapore)** 추천)
   - **Connect** 버튼 → 접속 주소(`postgresql://...?sslmode=require`)를 복사 → 이게 `DATABASE_URL`
   - 표(테이블)는 서버가 처음 켜질 때 자동으로 만듭니다.
2. **Render 웹 서비스 만들기** — https://dashboard.render.com/web/new
   - GitHub 저장소 `toiletmap` 연결, Branch 선택
   - Language: **Docker**, Region: **Singapore**, Instance Type: **Free**
   - Environment Variables: `NAVER_MAP_CLIENT_ID`, `DATABASE_URL`, `SESSION_SECRET`, `NODE_ENV=production`
   - **Deploy** → `https://xxxx.onrender.com` 주소 생성
3. 네이버 클라우드 Maps Application 의 **Web 서비스 URL** 에 위 주소 등록

> 무료 Render 는 15분간 접속이 없으면 잠들어서, 그 뒤 첫 접속은 30초~1분 걸립니다.
> 데이터는 Neon DB 에 있으므로 잠들거나 재배포돼도 지워지지 않습니다.

### 직접 서버에서 실행 (Docker)

```bash
docker build -t toiletmap .
docker run -d -p 3000:3000 \
  -e NAVER_MAP_CLIENT_ID=... -e SESSION_SECRET=... -e DATABASE_URL=... toiletmap
```

- 반드시 **HTTPS** 주소로 배포해야 내 위치 기능과 안드로이드 앱이 동작합니다.

## 광고 배너 (카카오 애드핏)

1. https://adfit.kakao.com 가입 → **매체 등록** (웹, 사이트 주소 입력) → 심사
2. 승인되면 **광고 단위 추가** → 배너 **320x50** 선택 → `DAN-` 으로 시작하는 광고 단위 ID 복사
3. Render 환경변수에 `ADFIT_AD_UNIT=DAN-xxxxxxxx` 추가 → 지도 아래에 배너가 표시됩니다.
4. 수익은 애드핏 대시보드에서 확인하고, 정산 정보(계좌, 신분증)를 등록하면 지급됩니다.

## 3. 안드로이드 앱 (웹페이지 바로가기 앱)

앱은 배포한 웹페이지 주소를 전체화면으로 열어줍니다. 위치 권한, 로그인 유지, 뒤로가기(열린 창 닫기)를 지원합니다.

### 주소 설정
`android/gradle.properties` 의 `toiletmap.webUrl` 을 배포한 주소로 바꿉니다.

```properties
toiletmap.webUrl=https://내-서버-주소/
```

### 멤버 배포용 다운로드 링크

main 브랜치가 바뀌면(그리고 `WEB_URL` 변수가 있으면) APK 가 Releases 에 자동으로 올라갑니다.
항상 최신 APK 를 받는 고정 링크:

https://github.com/happyfamily1984/toiletmap/releases/latest/download/salddeul-toiletmap.apk

### APK 받기 (GitHub Actions, 추천)
1. GitHub 저장소 **Settings → Secrets and variables → Actions → Variables** 에 `WEB_URL` 을 추가합니다. (예: `https://내-서버-주소/`)
2. 코드를 push 하거나 **Actions → Build → Run workflow** 를 실행합니다.
3. 빌드가 끝나면 실행 결과 페이지의 **Artifacts** 에서 `salddeul-toiletmap-apk` 를 내려받아 휴대폰에 설치합니다.
   (휴대폰에서 "출처를 알 수 없는 앱 설치"를 허용해야 합니다.)

### 직접 빌드
Android Studio로 `android/` 폴더를 열고 실행하거나, 아래 명령을 실행합니다.

```bash
cd android
./gradlew assembleRelease -Ptoiletmap.webUrl=https://내-서버-주소/
# → app/build/outputs/apk/release/app-release.apk
```

> 지금은 디버그 키로 서명되어 있습니다. Play 스토어에 올리려면 별도 서명 키를 설정해야 합니다.

### 아이폰
아이폰은 Safari에서 웹페이지를 연 뒤 **공유 → 홈 화면에 추가** 를 누르면 앱처럼 쓸 수 있습니다.

## 테스트

```bash
npm test
# PostgreSQL 저장소까지 테스트: TEST_DATABASE_URL=postgres://... npm test
```
