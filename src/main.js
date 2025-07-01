const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { login, getJson, getID, processEntries } = require('./downloader');

let mainWindow; // 전역 변수로 정의
let downloadProcess = null; // 다운로드 프로세스 추적
let isDownloading = false; // 다운로드 상태 추적

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 1200,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, // Node 모듈 직접 사용 비활성화
      contextIsolation: true, // 샌드박스 환경 유지
      sandbox: false // 샌드박스 비활성화 시도 (선택 사항)
    }
  });

  // 수정된 부분: win.loadFile로 변경
  win.loadFile(path.join(__dirname, 'index.html'));
  // DevTool 활성화
  //win.webContents.openDevTools();
  
  return win;
}

app.whenReady().then(() => {
  mainWindow = createWindow(); // createWindow()가 반환하는 win을 mainWindow에 할당

  ipcMain.handle('login', async (event, { id, password }) => {
    try {
      const result = await login(id, password, mainWindow);
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('getID', async (event, { session, type, urltype }) => {
    try {
      const result = await getID(session, type, urltype, mainWindow);
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('download', async (event, { id, session, type, size, index, urltype, downloadPath, startDate, endDate}) => {
    try {
      if (isDownloading) {
        return { success: false, error: '이미 다운로드가 진행 중입니다.' };
      }
      
      isDownloading = true;
      mainWindow.webContents.send('download-status-changed', { isDownloading: true });
      
      try {
        await getJson(id, session, type, size, index, urltype, mainWindow, downloadPath, startDate, endDate);
        
        if (isDownloading) { // 중단되지 않은 경우에만
          return { success: true };
        } else {
          return { success: false, error: '다운로드가 중단되었습니다.' };
        }
      } catch (error) {
        if (isDownloading) {
          return { success: false, error: error.message };
        } else {
          return { success: false, error: '다운로드가 중단되었습니다.' };
        }
      } finally {
        isDownloading = false;
        downloadProcess = null;
        mainWindow.webContents.send('download-status-changed', { isDownloading: false });
      }
    } catch (error) {
      isDownloading = false;
      downloadProcess = null;
      mainWindow.webContents.send('download-status-changed', { isDownloading: false });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('select-download-path', async (event) => {
    console.log('IPC select-download-path called'); // IPC 호출 확인
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: '다운로드 폴더를 선택하세요'
      });

      console.log('Dialog result:', JSON.stringify(result, null, 2));
      if (!result.canceled && result.filePaths.length > 0) {
        return { success: true, path: result.filePaths[0] };
      }
      return { success: false, error: '폴더 선택이 취소되었습니다.' };
    } catch (error) {
      console.error('Error in select-download-path:', error);
      return { success: false, error: error.message };
    }
  });

  // 다운로드 중단 핸들러
  ipcMain.handle('cancel-download', async (event) => {
    try {
      if (!isDownloading) {
        return { success: false, error: '진행 중인 다운로드가 없습니다.' };
      }
      
      if (downloadProcess) {
        downloadProcess.kill('SIGTERM');
        downloadProcess = null;
      }
      
      isDownloading = false;
      mainWindow.webContents.send('download-status-changed', { isDownloading: false });
      mainWindow.webContents.send('log', '다운로드가 사용자에 의해 중단되었습니다.');
      
      return { success: true, message: '다운로드가 중단되었습니다.' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 다운로드 상태 확인 핸들러
  ipcMain.handle('get-download-status', async (event) => {
    return { isDownloading };
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
