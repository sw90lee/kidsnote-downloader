const express = require('express');
const path = require('path');
const os = require('os');
const cors = require('cors');
const { login, getJson, getID } = require('./downloader');

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어 설정
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// 서버 전용 로그 함수
const serverLog = {
  logs: [],
  add: (message) => {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, message };
    serverLog.logs.push(logEntry);
    console.log(`[${timestamp}] ${message}`);
    // 최대 1000개 로그만 유지
    if (serverLog.logs.length > 1000) {
      serverLog.logs.shift();
    }
  },
  get: () => serverLog.logs,
  clear: () => {
    serverLog.logs = [];
  }
};

// 가짜 윈도우 객체 (서버용)
const mockWindow = {
  webContents: {
    send: (channel, message) => {
      if (channel === 'log') {
        serverLog.add(message);
      }
    }
  }
};

// 라우트 설정
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 로그인 API
app.post('/api/login', async (req, res) => {
  try {
    const { id, password } = req.body;
    serverLog.add(`로그인 시도: ${id}`);
    
    const result = await login(id, password, mockWindow);
    
    if (result && result.sessionID) {
      serverLog.add('로그인 성공!');
      res.json({ success: true, result });
    } else {
      serverLog.add('로그인 실패');
      res.json({ success: false, error: '로그인에 실패했습니다.' });
    }
  } catch (error) {
    serverLog.add(`로그인 에러: ${error.message}`);
    res.json({ success: false, error: error.message });
  }
});

// 자녀 목록 가져오기 API
app.post('/api/getID', async (req, res) => {
  try {
    const { session, type, urltype } = req.body;
    serverLog.add('자녀 목록 조회 중...');
    
    const result = await getID(session, type, urltype, mockWindow);
    
    if (result) {
      serverLog.add(`자녀 목록 조회 성공: ${result.children?.length || 0}명`);
      res.json({ success: true, result });
    } else {
      serverLog.add('자녀 목록 조회 실패');
      res.json({ success: false, error: '자녀 목록을 가져올 수 없습니다.' });
    }
  } catch (error) {
    serverLog.add(`자녀 목록 조회 에러: ${error.message}`);
    res.json({ success: false, error: error.message });
  }
});

// 다운로드 API
app.post('/api/download', async (req, res) => {
  try {
    const { id, session, type, size, index, urltype, downloadPath, startDate, endDate } = req.body;
    serverLog.add(`다운로드 시작 - 자녀 ID: ${id}, 타입: ${type}`);
    
    if (!downloadPath) {
      return res.json({ success: false, error: '다운로드 경로가 설정되지 않았습니다.' });
    }
    
    await getJson(id, session, type, size, index || 1, urltype, mockWindow, downloadPath, startDate, endDate);
    
    serverLog.add('다운로드 완료!');
    res.json({ success: true });
  } catch (error) {
    serverLog.add(`다운로드 에러: ${error.message}`);
    res.json({ success: false, error: error.message });
  }
});

// 로그 조회 API
app.get('/api/logs', (req, res) => {
  res.json({ logs: serverLog.get() });
});

// 로그 초기화 API
app.delete('/api/logs', (req, res) => {
  serverLog.clear();
  res.json({ success: true, message: '로그가 초기화되었습니다.' });
});

// 다운로드 경로 선택 API (서버용)
app.get('/api/select-download-path', (req, res) => {
  try {
    // 서버 환경에서는 기본 다운로드 경로 반환
    const defaultPath = path.join(os.homedir(), 'Downloads');
    serverLog.add(`기본 다운로드 경로 사용: ${defaultPath}`);
    res.json({ path: defaultPath });
  } catch (error) {
    serverLog.add(`경로 선택 에러: ${error.message}`);
    res.json({ path: null, error: error.message });
  }
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`
🚀 Kidsnote Downloader 서버가 시작되었습니다!

📍 서버 주소: http://localhost:${PORT}
📂 프로젝트 경로: ${__dirname}
🕐 시작 시간: ${new Date().toLocaleString('ko-KR')}

💡 사용법:
   - 브라우저에서 http://localhost:${PORT} 접속
   - 또는 curl로 API 직접 호출 가능

🛑 서버 종료: Ctrl+C
  `);
  
  serverLog.add(`서버가 포트 ${PORT}에서 시작되었습니다.`);
});

// 우아한 종료 처리
process.on('SIGINT', () => {
  console.log('\n🛑 서버를 종료합니다...');
  serverLog.add('서버가 종료되었습니다.');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 서버를 종료합니다...');
  serverLog.add('서버가 종료되었습니다.');
  process.exit(0);
});

module.exports = app;