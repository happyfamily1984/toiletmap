# 안양 과천 화장실맵

과천·안양·의왕 지역 화장실 위치, 설명, 비밀번호를 함께 기록하고 보는 **모바일 웹앱**과
그 웹페이지를 바로 열어주는 **안드로이드 앱**입니다.

## 기능

- **공개 보기 + 편집 코드**: 누구나 코드 없이 지도·화장실·비밀번호·권역·전단지를 볼 수 있습니다.
  - **＋ 화장실 등록**이나 상세 화면의 **편집 코드 입력 후 수정**을 누르면 4자리 편집 코드(`ACCESS_CODE`) 입력창이 뜹니다.
    맞는 코드를 넣으면 바로 등록·수정·삭제할 수 있습니다(서버에서도 검사).
  - 한 번 입력하면 30일간 유지되고, ☰ 메뉴의 **편집 모드 끝내기**로 끌 수 있습니다.
  - 틀린 코드를 한 IP 에서 5번 넣으면 10분, 전체에서 1시간에 30번 틀리면 1시간 동안 입력이 잠깁니다.
- **지도**: 앱을 열면 네이버 지도에 등록된 화장실 위치(초록색 `WC` 핀)가 표시되고,
  내 위치를 자동으로 찾아 지도 중심을 옮깁니다(위치 권한이 없거나 과천·안양·의왕 밖이면 기본 위치).
- **확대하면 이름·비밀번호 표시**: 지도를 줌 레벨 17 이상으로 확대하면 핀이 `이름 + 🔑 비밀번호` 라벨로 바뀝니다.
- **등록**: 오른쪽 **＋ 화장실 등록** 버튼을 누른 뒤, 지도를 줌 레벨 16 이상으로 확대하고 위치를 누르면
  주소가 자동으로 채워진 입력창이 뜹니다. 화장실 이름, 비밀번호, 설명을 입력해 저장합니다.
  (버튼을 누르지 않았거나 덜 확대된 상태에서는 지도를 눌러도 입력창이 뜨지 않습니다.)
- **별점**: 화장실마다 별 1~5개로 등급을 매깁니다(기본 3개, 예전에 등록된 화장실도 3개로 표시).
- **조회·수정·삭제**: 핀을 누르면 상세정보(비밀번호 크게 표시)와 수정/삭제 버튼이 나옵니다.
- **지역 제한**: 과천시·안양시·의왕시 안에서만 등록됩니다(서버에서도 검사).
- **배민플러스 버튼**: 오른쪽 아래 **배민플러스** 버튼을 누르면 권역·프로모션 버튼 4개와 가입신청 버튼이 열리고, 다시 누르면 닫힙니다(처음엔 닫힘).
- **권역 표시**: **과천B 권역**(남색) / **동안A 권역**(분홍) 버튼 중 하나를 누르면 해당 권역이 지도에 표시됩니다.
  한 번에 하나만 보이고, 같은 버튼을 다시 누르면 해제됩니다.
  - 과천B 권역: 과천시 원문동·갈현동, 안양시 동안구 인덕원동·평촌동·평안동·귀인동·관양동·부림동·비산1~3동
  - 동안A 권역: 안양시 동안구 인덕원동·평촌동·평안동·귀인동·관양동·부림동·비산1~3동·호계1~3동·범계동·신촌동·부흥동·달안동, 안양시 만안구 안양1~7동
  - 경계 데이터 `public/zones.json` (출처: 통계청 SGIS 행정동 경계, 공공누리 제1유형 ·
    [vuski/admdongkor](https://github.com/vuski/admdongkor) ver20260701, CC BY 4.0)
- **프로모션 전단지**: **동안A**(배민플러스 피니시 동안A) / **과천B**(배민플러스 살뜰 과천B) 버튼을 누르면 전단지가 뜹니다.
  전단지 파일은 `server/promo/` 에 있고 `/api/promo/*.jpg` 로 공개됩니다.
  전단지를 바꾸려면 `server/promo/` 의 같은 이름 jpg 파일(`gwacheon-b.jpg`, `dongan-a.jpg`)을 교체하세요.
- **가입신청**: 배민플러스 안의 가입신청 버튼을 누르면 가입신청서(이름, 전화번호, 희망 권역 과천B/동안A, 주 평균 수행 건수(선택), 하고 싶은 말)가 뜹니다.
  신청서 위쪽 📞 버튼을 누르면 010-7449-6511 로 바로 전화 연결됩니다.
- **관리자**: ☰ 메뉴 → 관리자 → 관리자 비밀번호 입력 → 들어온 가입신청 목록 확인·전화·삭제.
  관리자 비밀번호는 공개 저장소에 노출되지 않도록 **Render 환경변수 `ADMIN_PASSWORD` 로만** 설정합니다(없으면 관리자 기능 꺼짐).
- **📍 내 근처**: 왼쪽 위 버튼을 누르면 지도에 내 위치(파란 점)와 가장 가까운 화장실 1곳('가장 가까움' 표시)을 보여주고,
  그 화장실까지 걷는 길 경로를 초록 선으로 그립니다(이름표가 나오기 직전 단계까지만 확대). 다시 누르면 해제됩니다.
  경로는 OpenStreetMap 기반 FOSSGIS 무료 경로 서비스(routing.openstreetmap.de)를 쓰며, 응답이 없으면 직선 점선으로 표시합니다.
- **내 위치** 버튼, 과천/안양/의왕으로 바로 이동하는 메뉴가 있습니다.
- 홈 화면에 추가(PWA)할 수 있습니다.
- **개인정보처리방침**: `/privacy.html` (☰ 메뉴에 링크). 플레이스토어 등록 시 이 주소를 입력합니다.

## 구성

```
server/      Node.js(Express) 서버: 편집 코드 인증, 화장실 데이터 API, PostgreSQL(또는 JSON 파일) 저장
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
| `ACCESS_CODE` | 화장실 등록·수정용 4자리 편집 코드. 저장소가 공개라면 꼭 직접 정한 번호로 설정하세요. 바꾸면 편집자는 다시 입력해야 합니다 |
| `ADMIN_PASSWORD` | 관리자(가입신청 확인) 비밀번호. 비워두면 관리자 기능 꺼짐 |
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

## 광고 (안드로이드 앱: Google AdMob)

- 안드로이드 앱 맨 아래에 AdMob 적응형 배너가 붙습니다. 앱 ID·배너 ID는 `android/app/build.gradle.kts` 에 있습니다(공개 값).
- 디버그 빌드는 구글 테스트 광고, release 빌드(플레이스토어용)는 실제 광고를 씁니다. **내 광고는 직접 누르지 마세요**(계정 정지 사유).
- 유럽 등 동의가 필요한 지역은 UMP 동의 화면이 먼저 뜹니다(AdMob → 개인정보 보호 및 메시지에서 GDPR 메시지 생성 시).
- `public/app-ads.txt` 가 `https://<서버주소>/app-ads.txt` 로 공개됩니다. 플레이스토어 등록정보의 웹사이트가 이 서버 주소여야 합니다.

## 광고 배너 (카카오 애드핏, 웹 — 현재 미사용)

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

> 업로드 키 Secrets 가 없으면 디버그 키로 서명됩니다(플레이스토어 업로드 불가).

### 플레이스토어 등록

1. 업로드 키(.jks)를 만들고 저장소 **Settings → Secrets and variables → Actions → Secrets** 에 4개를 넣습니다.
   `ANDROID_KEYSTORE_BASE64`(jks 파일을 base64 로 바꾼 글자), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`
   - 키 파일과 비밀번호는 꼭 따로 보관하세요. 저장소에는 절대 올리지 않습니다(`.gitignore` 에 `*.jks`).
2. main 에 push 되면 Actions 실행 결과의 **Artifacts → `salddeul-toiletmap-aab`** 에 플레이스토어용 `.aab` 가 생깁니다.
3. [Play Console](https://play.google.com/console) → 앱(패키지 `com.anyang_toilet.myapp`) → 테스트(비공개) 또는 프로덕션 → 새 버전에 `.aab` 업로드.
   (Play 앱 서명 사용 — 업로드 키를 잃어버려도 Play Console 에서 재설정 가능)
4. 앱 콘텐츠: 개인정보처리방침 URL `https://<서버주소>/privacy.html`, 데이터 보안(위치·이름·전화번호), 광고 여부 등을 입력합니다.
5. 신규 개인 개발자 계정은 테스터 12명 이상이 14일간 비공개 테스트를 해야 프로덕션 출시를 신청할 수 있습니다.

> 앱은 targetSdk 36(Android 16)으로 빌드됩니다. 2026년 8월 31일부터 플레이스토어 새 앱·업데이트는 API 36 이상이어야 합니다.

### 아이폰
아이폰은 Safari에서 웹페이지를 연 뒤 **공유 → 홈 화면에 추가** 를 누르면 앱처럼 쓸 수 있습니다.

## 테스트

```bash
npm test
# PostgreSQL 저장소까지 테스트: TEST_DATABASE_URL=postgres://... npm test
```
