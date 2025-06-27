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
        logToWindow(`Connection reset error occurred. Retrying in ${retryDelay / 1000} seconds... (${retries} retries left)`);
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
    const tempFilename = path.join(downloadPath, `temp-${Math.random().toString(36).substring(2, 15)}-${Date.now()}${extension}`);
    const fileStream = fs.createWriteStream(tempFilename);
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
    const tempFilename = await downloadImage(url, extension, downloadPath);
    const finalPath = path.join(downloadPath, finalFilename);
    await renameAsync(tempFilename, finalPath);
    return `Renamed ${tempFilename} to ${finalFilename}`;
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
  for (const entry of parsedData.results) {
    let formattedDate;
    if (urltype === '1') {
      const { date_written, class_name, child_name, attached_images, attached_video } = entry;
      
      // 날짜 필터링 검사
      if (!isDateInRange(date_written, startDate, endDate)) {
        continue;
      }
      
      formattedDate = date_written ? date_written.replace(/-/g, '년') + '일' : 'unknown_date';
      if ((type === '1' || type === 'all') && Array.isArray(attached_images) && attached_images.length > 0) {
        for (const image of attached_images) {
          const extension = path.extname(image.original_file_name);
          const finalFilename = `${formattedDate}-${class_name}-${child_name}-${image.id}${extension}`;
          logToWindow(win, await processImage(image.original, extension, finalFilename, downloadPath));
          await sleep(100);
        }
      }
      if ((type === '2' || type === 'all') && attached_video) {
        const extension = path.extname(attached_video.original_file_name);
        const finalFilename = `${formattedDate}-${class_name}-${child_name}-${attached_video.id}${extension}`;
        logToWindow(win, await processImage(attached_video.high, extension, finalFilename, downloadPath));
        await sleep(100);
      }
    } else if (urltype === '2') {
      const { modified, child_name, attached_images, attached_video } = entry;
      
      // 날짜 필터링 검사 (modified에서 날짜 부분만 추출)
      const modifiedDate = modified ? modified.split('T')[0] : null;
      if (!isDateInRange(modifiedDate, startDate, endDate)) {
        continue;
      }
      
      formattedDate = modified ? modified.split('T')[0].replace(/-/g, '년') + '일' : 'unknown_date';
      if ((type === '1' || type === 'all') && Array.isArray(attached_images) && attached_images.length > 0) {
        for (const image of attached_images) {
          const extension = path.extname(image.original_file_name);
          const finalFilename = `${formattedDate}-${child_name}-${image.id}${extension}`;
          logToWindow(win, await processImage(image.original, extension, finalFilename, downloadPath));
          await sleep(100);
        }
      }
      if ((type === '2' || type === 'all') && attached_video) {
        const extension = path.extname(attached_video.original_file_name);
        const finalFilename = `${formattedDate}-${child_name}-${attached_video.id}${extension}`;
        logToWindow(win, await processImage(attached_video.high, extension, finalFilename, downloadPath));
        await sleep(100);
      }
    }
  }
};

// 자녀 데이터 가져오기 함수
const getJson = async (id, session, type, size, index, urltype, win, downloadPath, startDate = null, endDate = null) => {
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
      let downloadMessage = `다운로드 시작 - 자녀 ID: ${id}`;
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