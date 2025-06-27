const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { login, getJson, getID, processEntries } = require('./downloader');

let mainWindow; // 전역 변수로 정의

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, // Node 모듈 직접 사용 비활성화
      contextIsolation: true, // 샌드박스 환경 유지
      sandbox: false // 샌드박스 비활성화 시도 (선택 사항)
    }
  });

  // 수정된 부분: win.loadFile로 변경
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.openDevTools();
  
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
      await getJson(id, session, type, size, index, urltype, mainWindow, downloadPath, startDate, endDate);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('select-download-path', async (event) => {
    console.log('IPC select-download-path called'); // IPC 호출 확인
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
      });

      console.log('Dialog result:', JSON.stringify(result, null, 2));
      if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
      }
      return null;
    } catch (error) {
      console.error('Error in select-download-path:', error);
      throw error;
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});