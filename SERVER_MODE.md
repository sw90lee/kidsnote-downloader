# 🚀 Kidsnote Downloader 서버 모드

Kidsnote Downloader를 웹 서버로 실행하여 브라우저에서 사용할 수 있습니다.

## 📋 목차

- [설치 방법](#설치-방법)
- [서버 실행](#서버-실행)
- [사용법](#사용법)
- [API 문서](#api-문서)
- [문제 해결](#문제-해결)

## 🔧 설치 방법

### 1. 의존성 패키지 설치

```bash
npm install express cors nodemon
```

### 2. 설치 확인

```bash
npm list express cors
```

## 🚀 서버 실행

### 방법 1: 프로덕션 모드

```bash
npm run server
```

### 방법 2: 개발 모드 (자동 재시작)

```bash
npm run server:dev
```

### 방법 3: 직접 실행

```bash
node src/server.js
```

### 방법 4: 커스텀 포트

```bash
PORT=8080 npm run server
```

## 🌐 사용법

### 1. 웹 브라우저 접속

서버 시작 후 브라우저에서 다음 주소로 접속:

```
http://localhost:3000
```

### 2. 웹 인터페이스 사용

1. **로그인**: 키즈노트 아이디와 비밀번호 입력
2. **옵션 선택**: 다운로드 타입과 콘텐츠 종류 선택
3. **자녀 선택**: 자녀 목록에서 선택
4. **다운로드 설정**: 경로와 날짜 필터 설정
5. **다운로드 실행**: 다운로드 시작

### 3. 다운로드 경로 설정

서버 모드에서는 다운로드 경로를 직접 입력해야 합니다:

- **Linux/Mac**: `/home/사용자명/Downloads/kidsnote`
- **Windows**: `C:\\Users\\사용자명\\Downloads\\kidsnote`

## 📡 API 문서

### 로그인

```http
POST /api/login
Content-Type: application/json

{
  "id": "your_kidsnote_id",
  "password": "your_password"
}
```

**응답:**
```json
{
  "success": true,
  "result": {
    "sessionID": "session_string"
  }
}
```

### 자녀 목록 조회

```http
POST /api/getID
Content-Type: application/json

{
  "session": "session_string",
  "type": "all",
  "urltype": "1"
}
```

**응답:**
```json
{
  "success": true,
  "result": {
    "children": [
      {
        "id": "child_id",
        "name": "자녀이름",
        "index": 1
      }
    ]
  }
}
```

### 다운로드 실행

```http
POST /api/download
Content-Type: application/json

{
  "id": "child_id",
  "session": "session_string",
  "type": "all",
  "size": "all",
  "index": 1,
  "urltype": "1",
  "downloadPath": "/path/to/download",
  "startDate": "2024-01-01",
  "endDate": "2024-12-31"
}
```

### 로그 조회

```http
GET /api/logs
```

**응답:**
```json
{
  "logs": [
    {
      "timestamp": "2024-01-15T10:30:00.000Z",
      "message": "로그 메시지"
    }
  ]
}
```

### 로그 초기화

```http
DELETE /api/logs
```

## 💡 특징

### 🔄 실시간 로그

- 다운로드 진행 상황을 실시간으로 확인
- 날짜별 완료 알림
- 서버 로그와 클라이언트 로그 동기화

### 📱 반응형 UI

- 모바일과 데스크톱 모두 지원
- Electron과 동일한 사용자 인터페이스
- 자동 모드 감지 (Electron/서버)

### 🛡️ 보안

- CORS 설정으로 외부 접근 제한
- 세션 기반 인증
- 민감한 정보 로깅 방지

## 🔍 문제 해결

### 포트 이미 사용 중

```bash
# 다른 포트로 실행
PORT=8080 npm run server

# 또는 프로세스 종료
lsof -ti:3000 | xargs kill -9
```

### 의존성 패키지 문제

```bash
# 패키지 재설치
rm -rf node_modules package-lock.json
npm install
```

### 다운로드 경로 오류

- 경로가 존재하는지 확인
- 쓰기 권한이 있는지 확인
- 절대 경로 사용 권장

### 메모리 부족

```bash
# Node.js 메모리 제한 증가
node --max-old-space-size=4096 src/server.js
```

## 🌟 고급 설정

### 환경 변수

```bash
# .env 파일 생성
PORT=3000
NODE_ENV=production
MAX_DOWNLOAD_SIZE=1000
```

### PM2로 프로덕션 실행

```bash
# PM2 설치
npm install -g pm2

# 서버 시작
pm2 start src/server.js --name "kidsnote-server"

# 상태 확인
pm2 status

# 로그 확인
pm2 logs kidsnote-server
```

### Nginx 리버스 프록시

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
```

## 📊 성능 최적화

### 1. 메모리 사용량 최적화

- 최대 1000개 로그만 메모리에 유지
- 불필요한 변수 정리
- 가비지 컬렉션 최적화

### 2. 네트워크 최적화

- 정적 파일 캐싱
- gzip 압축 활성화
- Keep-Alive 연결 사용

### 3. 보안 강화

- Rate limiting 적용
- 입력 값 검증
- SQL 인젝션 방지

## 🆚 Electron vs 서버 모드 비교

| 기능 | Electron | 서버 모드 |
|------|----------|-----------|
| 설치 | 데스크톱 앱 | 브라우저 |
| 파일 다이얼로그 | ✅ | ❌ (직접 입력) |
| 백그라운드 실행 | ✅ | ✅ |
| 원격 접근 | ❌ | ✅ |
| 리소스 사용량 | 높음 | 낮음 |
| 업데이트 | 재설치 필요 | 서버 재시작만 |

## 📞 지원

문제가 발생하면 다음을 확인해주세요:

1. Node.js 버전 (v14 이상 권장)
2. 방화벽 설정
3. 포트 충돌
4. 파일 권한

더 자세한 도움이 필요하시면 Issues를 생성해주세요.