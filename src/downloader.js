const fs = require('fs');
const https = require('https');
const { promisify } = require('util');
const path = require('path');
const crypto = require('crypto');
const querystring = require('querystring');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const renameAsync = promisify(fs.rename);

// Electron 로그 전송
const logToWindow = (win, message) => {
  win.webContents.send('log', message);
};

// 요청 함수
const makeRequest = (options, data = null, retries = 5, retryDelay = 5000) => {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let rawData = '';
      res.on('data', (chunk) => rawData += chunk);
      res.on('end', () => resolve({ res, rawData }));
    });

    req.on('error', async (err) => {
      if (retries > 0 && err.code === 'ECONNRESET') {
        console.log(`Connection reset error occurred. Retrying in ${retryDelay / 1000} seconds... (${retries} retries left)`);
        await sleep(retryDelay);
        resolve(await makeRequest(options, data, retries - 1, retryDelay));
      } else {
        reject(err);
      }
    });

    req.setTimeout(30000, () => {
      req.abort();
      reject(new Error('Request timed out.'));
    });

    if (data) req.write(data);
    req.end();
  });
};

// 파일 다운로드 함수
const downloadImage = (url, extension, downloadPath) => {
  return new Promise((resolve, reject) => {
    // 다운로드 경로 디렉토리 확인 및 생성
    if (!fs.existsSync(downloadPath)) {
      try {
        fs.mkdirSync(downloadPath, { recursive: true });
      } catch (mkdirError) {
        reject(new Error(`Failed to create download directory: ${mkdirError.message}`));
        return;
      }
    }

    const tempFilename = path.join(downloadPath, `temp-${Math.random().toString(36).substring(2, 15)}-${Date.now()}${extension}`);
    const fileStream = fs.createWriteStream(tempFilename);
    
    fileStream.on('error', (streamError) => {
      fs.unlink(tempFilename, () => {});
      reject(new Error(`Failed to create write stream: ${streamError.message}`));
    });

    const request = https.get(url, (response) => {
      if (response.statusCode === 200) {
        response.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close(() => resolve(tempFilename));
        });
      } else {
        fileStream.close(() => fs.unlink(tempFilename, () => {}));
        reject(new Error(`Failed to download ${tempFilename}, status code: ${response.statusCode}`));
      }
    });

    request.on('error', (err) => {
      fs.unlink(tempFilename, () => {});
      reject(err);
    });

    request.setTimeout(30000, () => {
      request.abort();
      reject(new Error('Request timed out'));
    });
  });
};

// 이미지 및 동영상 처리 함수
const processImage = async (url, extension, finalFilename, downloadPath, retries = 5) => {
  try {
    // 다운로드 경로 디렉토리 확인 및 생성
    if (!fs.existsSync(downloadPath)) {
      fs.mkdirSync(downloadPath, { recursive: true });
    }

    const tempFilename = await downloadImage(url, extension, downloadPath);
    const finalPath = path.join(downloadPath, finalFilename);
    
    // 최종 파일 경로의 디렉토리도 확인
    const finalDir = path.dirname(finalPath);
    if (!fs.existsSync(finalDir)) {
      fs.mkdirSync(finalDir, { recursive: true });
    }
    
    await renameAsync(tempFilename, finalPath);
    // 로그 출력하지 않고 조용히 처리
  } catch (error) {
    if (retries > 0) {
      await sleep(5000);
      return await processImage(url, extension, finalFilename, downloadPath, retries - 1);
    }
    throw new Error(`Error processing ${finalFilename}: ${error.message}`);
  }
};

// 날짜 필터링 함수
const isDateInRange = (date, startDate, endDate) => {
  if (!startDate && !endDate) return true;
  
  const entryDate = new Date(date);
  if (isNaN(entryDate.getTime())) return true;
  
  if (startDate && endDate) {
    return entryDate >= new Date(startDate) && entryDate <= new Date(endDate);
  } else if (startDate) {
    return entryDate >= new Date(startDate);
  } else if (endDate) {
    return entryDate <= new Date(endDate);
  }
  
  return true;
};

// 데이터 처리 함수
const processEntries = async (parsedData, type, urltype, win, downloadPath, startDate = null, endDate = null) => {
  // 날짜별로 데이터를 그룹화
  const dateGroups = new Map();
  
  // 먼저 모든 데이터를 날짜별로 그룹화
  for (const entry of parsedData.results) {
    let rawDate;
    
    if (urltype === '1') {
      rawDate = entry.date_written;
    } else if (urltype === '2') {
      rawDate = entry.modified ? entry.modified.split('T')[0] : null;
    }
    
    // 날짜 필터링 검사
    if (!isDateInRange(rawDate, startDate, endDate)) {
      continue;
    }
    
    if (!rawDate) continue;
    
    if (!dateGroups.has(rawDate)) {
      dateGroups.set(rawDate, []);
    }
    dateGroups.get(rawDate).push(entry);
  }
  
  // 날짜순으로 정렬하여 처리
  const sortedDates = Array.from(dateGroups.keys()).sort();
  
  for (const date of sortedDates) {
    const entries = dateGroups.get(date);
    logToWindow(win, `📅 ${date} 날짜 데이터 처리를 시작합니다...`);
    
    let dateItemCount = 0;
    
    for (const entry of entries) {
      let formattedDate;
      
      if (urltype === '1') {
        const { date_written, class_name, child_name, attached_images, attached_video } = entry;
        formattedDate = date_written ? date_written.replace(/-/g, '년') + '일' : 'unknown_date';
        
        if ((type === '1' || type === 'all') && Array.isArray(attached_images) && attached_images.length > 0) {
          dateItemCount += attached_images.length;
          for (const image of attached_images) {
            const extension = path.extname(image.original_file_name);
            const finalFilename = `${formattedDate}-${class_name}-${child_name}-${image.id}${extension}`;
            await processImage(image.original, extension, finalFilename, downloadPath);
            await sleep(100);
          }
        }
        if ((type === '2' || type === 'all') && attached_video) {
          dateItemCount += 1;
          const extension = path.extname(attached_video.original_file_name);
          const finalFilename = `${formattedDate}-${class_name}-${child_name}-${attached_video.id}${extension}`;
          await processImage(attached_video.high, extension, finalFilename, downloadPath);
          await sleep(100);
        }
      } else if (urltype === '2') {
        const { modified, child_name, attached_images, attached_video } = entry;
        formattedDate = modified ? modified.split('T')[0].replace(/-/g, '년') + '일' : 'unknown_date';
        
        if ((type === '1' || type === 'all') && Array.isArray(attached_images) && attached_images.length > 0) {
          dateItemCount += attached_images.length;
          for (const image of attached_images) {
            const extension = path.extname(image.original_file_name);
            const finalFilename = `${formattedDate}-${child_name}-${image.id}${extension}`;
            await processImage(image.original, extension, finalFilename, downloadPath);
            await sleep(100);
          }
        }
        if ((type === '2' || type === 'all') && attached_video) {
          dateItemCount += 1;
          const extension = path.extname(attached_video.original_file_name);
          const finalFilename = `${formattedDate}-${child_name}-${attached_video.id}${extension}`;
          await processImage(attached_video.high, extension, finalFilename, downloadPath);
          await sleep(100);
        }
      }
    }
    
    logToWindow(win, `📅 ${date} 날짜의 다운로드가 완료되었습니다. (${dateItemCount}개 항목)`);
    
  }
  
  // 전체 처리된 날짜 요약
  if (sortedDates.length > 0) {
    logToWindow(win, `✅ 총 ${sortedDates.length}개 날짜의 데이터 처리가 완료되었습니다.`);
    logToWindow(win, `📊 처리된 날짜: ${sortedDates.join(', ')}`);
  }
};

// 자녀 데이터 가져오기 함수
const getJson = async (id, session, type, size, index, urltype, win, downloadPath, startDate = null, endDate = null) => {
  // 첫 번째 호출(index === 1)인 경우 다운로드 경로 확인 및 생성
  if (index === 1) {
    try {
      if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath, { recursive: true });
        logToWindow(win, `다운로드 폴더를 생성했습니다: ${downloadPath}`);
      }
    } catch (error) {
      logToWindow(win, `다운로드 폴더 생성 실패: ${error.message}`);
      throw new Error(`Failed to create download directory: ${error.message}`);
    }
  }

  const downloadSize = size === 'all' ? 9999 * index : size;
  const url = `/api/v1_2/children/${id}/${urltype === '1' ? 'reports' : 'albums'}/?page_size=${downloadSize}&tz=Asia%2FSeoul&child=${id}`;
  const options = {
    hostname: 'www.kidsnote.com',
    path: url,
    method: 'GET',
    headers: {
      'cookie': `sessionid=${session};`,
      'User-Agent': 'Mozilla/5.0'
    },
    secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT
  };

  try {
    const { res, rawData } = await makeRequest(options);
    const parsedData = JSON.parse(rawData);

    if (res.statusCode === 401) {
      logToWindow(win, '세션 만료! 로그인 후 진행해주세요.');
      return;
    } else if (res.statusCode > 400) {
      logToWindow(win, '현재 키즈노트 서버가 좋지 않습니다.');
      return;
    }

    // 첫 번째 호출(index === 1)인 경우 다운로드 시작 로그 출력
    if (index === 1) {
      let downloadMessage = `다운로드 시작 - 자녀 ID: ${id}, 경로: ${downloadPath}`;
      if (startDate || endDate) {
        downloadMessage += ` | 날짜 필터: ${startDate || '제한없음'} ~ ${endDate || '제한없음'}`;
      }
      logToWindow(win, downloadMessage);
    }

    if (size === 'all' && parsedData.next !== null) {
      logToWindow(win, '최대 데이터 추출 중...');
      await getJson(id, session, type, size, index + 1, urltype, win, downloadPath, startDate, endDate);
    } else {
      await processEntries(parsedData, type, urltype, win, downloadPath, startDate, endDate);
      logToWindow(win, '다운로드 완료');
    }
  } catch (err) {
    logToWindow(win, `Request error: ${err.message}`);
  }
};

// 로그인 함수
const login = async (id, password, win) => {
console.log(`Logging in with ID: ${id}`); // 로그인 시도 로그
  const postData = querystring.stringify({ username: id, password });
  const options = {
    hostname: 'www.kidsnote.com',
    path: '/kr/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData),
    },
    secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT
  };

  try {
    const { res } = await makeRequest(options, postData);
    const cookies = res.headers['set-cookie'];
    if (cookies) {
      logToWindow(win, '로그인 성공!');
      const sessionID = cookies[0].match(/sessionid=([^;]*)/)[1];
      return { sessionID };
    } else {
      logToWindow(win, '로그인 실패했습니다.');
      throw new Error('Login failed');
    }
  } catch (err) {
    logToWindow(win, `Request error: ${err.message}`);
    throw err;
  }
};

// 자녀 선택 함수
const getID = async (session, type, urltype, win) => {
  const options = {
    hostname: 'www.kidsnote.com',
    path: '/api/v1/me/info',
    method: 'GET',
    headers: {
      'cookie': `sessionid=${session}`,
      'User-Agent': 'Mozilla/5.0'
    },
    secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT
  };

  try {
    const { res, rawData } = await makeRequest(options);
    const parsedData = JSON.parse(rawData);

    if (res.statusCode === 401) {
      logToWindow(win, '세션 만료! 로그인 후 진행해주세요.');
      return;
    } else if (res.statusCode > 400) {
      logToWindow(win, '현재 키즈노트 서버가 좋지 않습니다.');
      return;
    }

    if (parsedData.children) {
      const childArray = parsedData.children.map((child, index) => ({
        id: child.id,
        name: child.name,
        index: index + 1
      }));
      return { children: childArray, session, type, urltype };
    } else {
      logToWindow(win, '키즈노트에 등록된 자녀가 없습니다.');
      return { children: [] };
    }
  } catch (err) {
    logToWindow(win, `Request error: ${err.message}`);
    throw err;
  }
};

module.exports = {
  login,
  getJson,
  getID,
  processEntries
};