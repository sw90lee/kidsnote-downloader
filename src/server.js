const express = require('express');
const path = require('path');
const cors = require('cors');
const { exec } = require('child_process');
const os = require('os');
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

// 디렉토리 경로 해결 API
app.post('/api/resolve-directory', async (req, res) => {
  try {
    const { directoryName } = req.body;
    const os = require('os');
    const path = require('path');
    
    // 일반적인 다운로드 경로들을 시도
    const possiblePaths = [
      path.join(os.homedir(), 'Downloads', directoryName),
      path.join(os.homedir(), 'Desktop', directoryName),
      path.join(process.cwd(), 'downloads', directoryName),
      path.join('.', 'downloads', directoryName)
    ];
    
    // 첫 번째로 사용 가능한 경로 반환 (또는 기본 경로 생성)
    const fs = require('fs');
    let resolvedPath = possiblePaths[0]; // 기본적으로 Downloads 폴더 사용
    
    // Downloads 폴더가 존재하는지 확인
    try {
      const downloadsDir = path.join(os.homedir(), 'Downloads');
      if (fs.existsSync(downloadsDir)) {
        resolvedPath = path.join(downloadsDir, directoryName);
      } else {
        resolvedPath = path.join(process.cwd(), 'downloads', directoryName);
      }
    } catch (error) {
      resolvedPath = path.join(process.cwd(), 'downloads', directoryName);
    }
    
    serverLog.add(`디렉토리 경로 해결: ${directoryName} -> ${resolvedPath}`);
    res.json({ success: true, resolvedPath });
  } catch (error) {
    serverLog.add(`디렉토리 경로 해결 실패: ${error.message}`);
    res.json({ success: false, error: error.message });
  }
});

// 다운로드 API
app.post('/api/download', async (req, res) => {
  try {
    const { id, session, type, size, index, urltype, downloadPath, startDate, endDate } = req.body;
    
    if (isDownloading) {
      return res.json({ success: false, error: '이미 다운로드가 진행 중입니다.' });
    }
    
    if (!downloadPath) {
      return res.json({ success: false, error: '다운로드 경로가 설정되지 않았습니다.' });
    }
    
    isDownloading = true;
    serverLog.add(`다운로드 시작 - 자녀 ID: ${id}, 타입: ${type}`);
    
    try {
      // 다운로드 프로세스를 별도로 실행하여 중단 가능하게 함
      const downloadPromise = getJson(id, session, type, size, index || 1, urltype, mockWindow, downloadPath, startDate, endDate);
      
      // 다운로드 완료 대기
      await downloadPromise;
      
      if (isDownloading) {  // 중단되지 않은 경우에만
        serverLog.add('다운로드 완료!');
        res.json({ success: true });
      } else {
        serverLog.add('다운로드가 중단되었습니다.');
        res.json({ success: false, error: '다운로드가 중단되었습니다.' });
      }
    } catch (error) {
      if (isDownloading) {
        serverLog.add(`다운로드 에러: ${error.message}`);
        res.json({ success: false, error: error.message });
      } else {
        res.json({ success: false, error: '다운로드가 중단되었습니다.' });
      }
    } finally {
      isDownloading = false;
      downloadProcess = null;
    }
    
  } catch (error) {
    isDownloading = false;
    downloadProcess = null;
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

// 다운로드 작업 추적
let downloadProcess = null;
let isDownloading = false;

// 웹 브라우저용 파일 업로드 API (폴더 선택 대안)
app.post('/api/select-folder', (req, res) => {
  // 웹 브라우저에서는 보안상 직접 폴더 선택이 불가능하므로
  // 사용자가 직접 경로를 입력하거나 기본 경로를 제안
  try {
    const defaultPaths = getDefaultDownloadSuggestions();
    serverLog.add('기본 다운로드 경로 제안 중...');
    
    res.json({ 
      success: true, 
      message: '웹 브라우저에서는 보안상 직접 폴더 선택이 불가능합니다.',
      suggestedPaths: defaultPaths,
      instructions: '아래 제안된 경로 중 하나를 선택하거나 직접 경로를 입력해주세요.'
    });
  } catch (error) {
    serverLog.add(`경로 제안 에러: ${error.message}`);
    res.json({ success: false, error: error.message });
  }
});

// 기본 다운로드 경로 제안 함수
const getDefaultDownloadSuggestions = () => {
  const platform = os.platform();
  const homeDir = os.homedir();
  const suggestions = [];
  
  if (isWSL()) {
    // WSL 환경에서는 Windows 경로 제안
    try {
      const { execSync } = require('child_process');
      const windowsUserPath = execSync('cmd.exe /c "echo %USERPROFILE%"', { encoding: 'utf8' }).trim();
      suggestions.push(`${windowsUserPath}\\Downloads`);
      suggestions.push(`${windowsUserPath}\\Desktop`);
      suggestions.push(`${windowsUserPath}\\Documents`);
    } catch (error) {
      suggestions.push('C:\\Users\\%USERNAME%\\Downloads');
      suggestions.push('C:\\Users\\%USERNAME%\\Desktop');
    }
    // WSL 경로도 추가
    suggestions.push(path.join(homeDir, 'Downloads'));
    suggestions.push('/mnt/c/Downloads');
  } else {
    switch (platform) {
      case 'win32':
        suggestions.push(path.join(homeDir, 'Downloads'));
        suggestions.push(path.join(homeDir, 'Desktop'));
        suggestions.push(path.join(homeDir, 'Documents'));
        suggestions.push('C:\\Downloads');
        break;
      case 'darwin':
        suggestions.push(path.join(homeDir, 'Downloads'));
        suggestions.push(path.join(homeDir, 'Desktop'));
        suggestions.push(path.join(homeDir, 'Documents'));
        break;
      case 'linux':
        suggestions.push(path.join(homeDir, 'Downloads'));
        suggestions.push(path.join(homeDir, 'Desktop'));
        suggestions.push(path.join(homeDir, 'Documents'));
        suggestions.push('/tmp');
        break;
    }
  }
  
  return suggestions;
};

// 다운로드 중단 API
app.post('/api/cancel-download', (req, res) => {
  try {
    if (!isDownloading) {
      return res.json({ success: false, error: '진행 중인 다운로드가 없습니다.' });
    }
    
    if (downloadProcess) {
      downloadProcess.kill('SIGTERM');
      downloadProcess = null;
    }
    
    isDownloading = false;
    serverLog.add('다운로드가 사용자에 의해 중단되었습니다.');
    res.json({ success: true, message: '다운로드가 중단되었습니다.' });
    
  } catch (error) {
    serverLog.add(`다운로드 중단 에러: ${error.message}`);
    res.json({ success: false, error: error.message });
  }
});

// 다운로드 상태 확인 API
app.get('/api/download-status', (req, res) => {
  res.json({ isDownloading });
});

// WSL 환경 감지 함수
const isWSL = () => {
  try {
    return require('fs').existsSync('/proc/version') && 
           require('fs').readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft');
  } catch {
    return false;
  }
};

// WSL에서 Windows 접근 가능한 경로로 변환
const getWindowsAccessiblePath = (wslPath) => {
  if (!isWSL()) return wslPath;
  
  // WSL 홈 디렉토리는 Windows의 사용자 폴더 매핑 시도
  if (wslPath.includes('/home/')) {
    try {
      // Windows 사용자 폴더의 Downloads 사용
      const { execSync } = require('child_process');
      const windowsUserPath = execSync('cmd.exe /c "echo %USERPROFILE%"', { encoding: 'utf8' }).trim();
      return path.join(windowsUserPath, 'Downloads').replace(/\\/g, '/');
    } catch (error) {
      // 실패시 기본 Windows Downloads 경로
      return 'C:/Users/Public/Downloads';
    }
  }
  
  // /mnt/ 경로는 그대로 Windows 드라이브로 변환
  if (wslPath.startsWith('/mnt/')) {
    const match = wslPath.match(/^\/mnt\/([a-z])(\/.*)?$/);
    if (match) {
      const drive = match[1].toUpperCase();
      const pathPart = match[2] ? match[2].replace(/\//g, '/') : '';
      return `${drive}:${pathPart}`;
    }
  }
  
  // 기본적으로 Windows Public 폴더 사용
  return 'C:/Users/Public/Downloads';
};

// OS별 기본 다운로드 경로 가져오기
const getDefaultDownloadPath = () => {
  const platform = os.platform();
  const homeDir = os.homedir();
  
  switch (platform) {
    case 'win32':
      return path.join(homeDir, 'Downloads');
    case 'darwin':
      return path.join(homeDir, 'Downloads');
    case 'linux':
      // Linux에서는 XDG_DOWNLOAD_DIR 환경변수 확인 후 기본 Downloads 폴더 사용
      const xdgDownload = process.env.XDG_DOWNLOAD_DIR;
      if (xdgDownload) return xdgDownload;
      return path.join(homeDir, 'Downloads');
    default:
      return homeDir;
  }
};

// OS별 탐색기 열기 명령어 생성
const getExplorerCommand = (targetPath, platform) => {
  if (isWSL()) {
    // WSL에서는 Windows 경로로 변환 후 Windows 탐색기 사용
    const windowsPath = getWindowsAccessiblePath(targetPath);
    return {
      command: `cmd.exe /c explorer "${windowsPath.replace(/\//g, '\\')}"`,
      fallback: `powershell.exe -c "Invoke-Item '${windowsPath}'"`,
      path: windowsPath
    };
  }
  
  switch (platform) {
    case 'win32':
      return { command: `explorer "${targetPath}"`, path: targetPath };
    case 'darwin':
      return { command: `open "${targetPath}"`, path: targetPath };
    case 'linux':
      // Linux에서 여러 파일 관리자 시도
      return { 
        command: `xdg-open "${targetPath}"`,
        fallback: `nautilus "${targetPath}" 2>/dev/null || dolphin "${targetPath}" 2>/dev/null || thunar "${targetPath}" 2>/dev/null`,
        path: targetPath 
      };
    default:
      return null;
  }
};

// 윈도우 탐색기 열기 API
app.post('/api/open-explorer', (req, res) => {
  try {
    const { defaultPath } = req.body;
    const platform = os.platform();
    
    // 기본 경로 설정
    let targetPath = defaultPath;
    if (!targetPath) {
      targetPath = getDefaultDownloadPath();
      serverLog.add(`기본 다운로드 경로 사용: ${targetPath}`);
    }
    
    // 경로 존재 여부 확인 및 생성
    const fs = require('fs');
    try {
      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
        serverLog.add(`다운로드 경로 생성: ${targetPath}`);
      }
    } catch (dirError) {
      serverLog.add(`경로 생성 실패, 상위 경로 사용: ${dirError.message}`);
      targetPath = path.dirname(targetPath);
    }
    
    // 탐색기 열기 명령어 생성
    const explorerInfo = getExplorerCommand(targetPath, platform);
    if (!explorerInfo) {
      return res.json({ success: false, error: '지원하지 않는 운영체제입니다.' });
    }
    
    serverLog.add(`탐색기 열기 시도: ${explorerInfo.command}`);
    
    exec(explorerInfo.command, (error) => {
      if (error) {
        serverLog.add(`탐색기 열기 실패: ${error.message}`);
        
        // 대안 명령어가 있는 경우 시도
        if (explorerInfo.fallback) {
          exec(explorerInfo.fallback, (fallbackError) => {
            if (fallbackError) {
              serverLog.add(`대안 탐색기 열기도 실패: ${fallbackError.message}`);
              res.json({ success: false, error: '탐색기를 열 수 없습니다.' });
            } else {
              serverLog.add(`대안 탐색기 열림: ${explorerInfo.path}`);
              res.json({ success: true, path: explorerInfo.path });
            }
          });
        } else {
          res.json({ success: false, error: '탐색기를 열 수 없습니다.' });
        }
      } else {
        serverLog.add(`탐색기 열림: ${explorerInfo.path}`);
        res.json({ success: true, path: explorerInfo.path });
      }
    });
    
  } catch (error) {
    serverLog.add(`탐색기 열기 에러: ${error.message}`);
    res.json({ success: false, error: error.message });
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