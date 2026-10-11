# 살뜰 화장실맵

과천·안양 지역 화장실 위치, 설명, 비밀번호를 함께 기록하고 보는 **모바일 웹앱**과
그 웹페이지를 바로 열어주는 **안드로이드 앱**입니다.

## 기능

- **접속 코드**: 처음 접속하면 4자리 숫자 코드(기본 `6511`)를 입력해야 지도를 보고 등록할 수 있습니다.
  - 한 번 입력하면 30일간 유지됩니다.
  - 틀린 코드를 5번 입력하면 10분간 잠깁니다.
- **지도**: 앱을 열면 네이버 지도에 등록된 화장실 위치(초록색 `WC` 핀)가 표시됩니다.
- **확대하면 이름·비밀번호 표시**: 지도를 줌 레벨 16 이상으로 확대하면 핀이 `이름 + 🔑 비밀번호` 라벨로 바뀝니다.
- **등록**: 지도에서 위치를 누르거나 상단에서 주소를 검색하면 주소가 자동으로 채워지고,
  화장실 이름, 비밀번호, 설명을 입력해 저장할 수 있습니다.
- **조회·수정·삭제**: 핀을 누르면 상세정보(비밀번호 크게 표시)와 수정/삭제 버튼이 나옵니다.
- **지역 제한**: 과천시·안양시 안에서만 등록됩니다(서버에서도 검사).
- **내 위치** 버튼, 과천/안양으로 바로 이동하는 메뉴가 있습니다.
- 홈 화면에 추가(PWA)할 수 있습니다.

## 구성

```
server/      Node.js(Express) 서버: 접속 코드 인증, 화장실 데이터 API, JSON 파일 저장
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
# → http://localhost:3000
```

| 환경변수 | 설명 |
| --- | --- |
| `NAVER_MAP_CLIENT_ID` | 네이버 지도 Client ID (필수) |
| `ACCESS_CODE` | 4자리 접속 코드 (기본 `6511`). 바꾸면 기존 로그인은 모두 풀립니다 |
| `SESSION_SECRET` | 로그인 쿠키 서명용 비밀 문자열 (권장) |
| `PORT` | 포트 (기본 3000) |
| `DATA_FILE` | 데이터 파일 경로 (기본 `data/toilets.json`) |

### 배포 (Docker)

```bash
docker build -t toiletmap .
docker run -d -p 3000:3000 -v toiletmap-data:/app/data \
  -e NAVER_MAP_CLIENT_ID=... -e SESSION_SECRET=... toiletmap
```

Render, Railway, Fly.io 같은 서비스에 올려도 됩니다. 다만 아래 사항을 지켜 주세요.

- 반드시 **HTTPS** 주소로 배포해야 합니다. 그래야 내 위치 기능이 동작하고 안드로이드 앱에서 열립니다.
- 데이터 파일(`/app/data`)은 **영구 디스크/볼륨**에 저장되게 해야 재배포해도 데이터가 남습니다.
- 배포한 주소를 네이버 클라우드의 **Web 서비스 URL**에 등록해야 합니다.

## 3. 안드로이드 앱 (웹페이지 바로가기 앱)

앱은 배포한 웹페이지 주소를 전체화면으로 열어줍니다. 위치 권한, 로그인 유지, 뒤로가기(열린 창 닫기)를 지원합니다.

### 주소 설정
`android/gradle.properties` 의 `toiletmap.webUrl` 을 배포한 주소로 바꿉니다.

```properties
toiletmap.webUrl=https://내-서버-주소/
```

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
```
