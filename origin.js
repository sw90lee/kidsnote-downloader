const fs = require('fs');
const https = require('https');
const { promisify } = require('util');
const path = require('path');
const crypto = require('crypto');
const querystring = require('querystring');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const renameAsync = promisify(fs.rename);

// 비동기 입력을 위한 함수
const askQuestion = (question) => {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
};

// 요청 함수 (재시도 및 타임아웃 포함)
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

    if (data) {
      req.write(data);
    }

    req.end();
  });
};

// 파일 다운로드 함수
const downloadImage = (url, extension) => {
  return new Promise((resolve, reject) => {
    const tempFilename = `temp-${Math.random().toString(36).substring(2, 15)}-${Date.now()}${extension}`;
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
const processImage = async (url, extension, finalFilename, retries = 5) => {
  try {
    const tempFilename = await downloadImage(url, extension);
    await renameAsync(tempFilename, finalFilename);
    console.log(`Renamed ${tempFilename} to ${finalFilename}`);
  } catch (error) {
    console.log(`Error processing ${finalFilename}: ${error.message}`);
    if (retries > 0) {
      console.log(`Retrying ${finalFilename}. Retries left: ${retries}`);
      await sleep(5000);
      await processImage(url, extension, finalFilename, retries - 1);
    }
  }
};

// 데이터를 처리하는 함수 (이미지와 동영상 다운로드)
const processEntries = async (parsedData, type, urltype) => {
  for (const entry of parsedData.results) {
    let formattedDate;
    let comment;

    // 보고서 타입 (reports)
    if (urltype === '1') {
      const { date_written, class_name, child_name, content, weather, attached_images, attached_video } = entry;
      formattedDate = date_written ? date_written.replace(/-/g, '년') + '일' : 'unknown_date';
      comment = `${formattedDate} (${weather || 'Unknown'})\n${content || ''}`;

      // 이미지 처리
      if ((type === '1' || type === 'all') && attached_images && attached_images.length > 0) {
        for (const image of attached_images) {
          const extension = path.extname(image.original_file_name);
          const finalFilename = `${formattedDate}-${class_name}-${child_name}-${image.id}${extension}`;
          await processImage(image.original, extension, finalFilename);
          await sleep(100); // 0.1초 대기
        }
      }

      // 동영상 처리
      if ((type === '2' || type === 'all') && attached_video) {
        const extension = path.extname(attached_video.original_file_name);
        const finalFilename = `${formattedDate}-${class_name}-${child_name}-${attached_video.id}${extension}`;
        await processImage(attached_video.high, extension, finalFilename);
        await sleep(100); // 0.1초 대기
      }
    }
    // 앨범 타입 (albums)
    else if (urltype === '2') {
      const { modified, child_name, attached_images, attached_video } = entry;
      formattedDate = modified ? modified.split('T')[0].replace(/-/g, '년') + '일' : 'unknown_date';
      comment = `Album Upload (${formattedDate})`;

      // 이미지 처리
      if ((type === '1' || type === 'all') && attached_images && attached_images.length > 0) {
        for (const image of attached_images) {
          const extension = path.extname(image.original_file_name);
          const finalFilename = `${formattedDate}-${child_name}-${image.id}${extension}`;
          await processImage(image.original, extension, finalFilename);
          await sleep(100); // 0.1초 대기
        }
      }

      // 동영상 처리
      if ((type === '2' || type === 'all') && attached_video) {
        const extension = path.extname(attached_video.original_file_name);
        const finalFilename = `${formattedDate}-${child_name}-${attached_video.id}${extension}`;
        await processImage(attached_video.high, extension, finalFilename);
        await sleep(100); // 0.1초 대기
      }
    }
  }
};

// 자녀 데이터 가져오기
const getJson = async (id, session, type, size, index, urltype) => {
  let downloadSize = size === 'all' ? 9999 * index : size;
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
      console.log("세션 만료! 로그인 후 진행해주세요.");
      exit();
    } else if (res.statusCode > 400) {
      console.log("현재 키즈노트 서버가 좋지 않습니다.");
      exit();
    }

    if (size === 'all' && parsedData.next !== null) {
      console.log("최대 데이터 추출 중...");
      await getJson(id, session, type, size, index + 1, urltype);
    } else {
      await processEntries(parsedData, type, urltype);
      console.log('다운로드 완료');
    }
  } catch (err) {
    console.error(`Request error: ${err.message}`);
  }
};

// 로그인 함수
const login = async (id, password) => {
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
      console.log('로그인 성공!');

      // 다운로드 타입 입력
      let type;
      while (true) {
        type = await askQuestion('다운로드 종류 : [사진:1, 동영상:2, All(default):3] : ');
        if (type === '1' || type === '2' || type === '3' || type === '') break;
        console.log("잘못된 입력입니다. 다시 선택해주세요.");
      }
      let typeName = type === '1' ? '사진' : type === '2' ? '동영상' : '사진, 동영상';
      if (type === '') type = 'all';
      console.log(`Download Type : ${typeName}`);
      const sessionID = cookies[0].match(/sessionid=([^;]*)/)[1];

      // URL 종류 입력
      let urltype;
      while (true) {
        urltype = await askQuestion('URL 종류를 선택하세요 [reports:1, albums:2] : ');
        if (urltype === '1' || urltype === '2' || urltype === '') break;
        console.log("잘못된 입력입니다. 다시 선택해주세요.");
      }

      await getID(sessionID, type, urltype);
    } else {
      console.log('로그인 실패했습니다.');
      exit();
    }
  } catch (err) {
    console.error(`Request error: ${err.message}`);
    exit();
  }
};

// 자녀 선택
const getID = async (session, type, urltype) => {
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
      console.log("세션 만료! 로그인 후 진행해주세요.");
      exit();
    } else if (res.statusCode > 400) {
      console.log("현재 키즈노트 서버가 좋지 않습니다.");
      exit();
    }

    if (parsedData.children) {
      let childArray = parsedData.children.map((child, index) => ({
        id: child.id,
        name: child.name,
        index: index + 1
      }));

      const childType = await askQuestion('다운받으실 자녀를 선택해주세요 (모두: all)\n' + 
        childArray.map(c => `[${c.index}]: ${c.name}`).join('\n') + '\n입력: ');

      const selected = childType === 'all' ? childArray : [childArray[parseInt(childType) - 1]];

      const size = await askQuestion('다운받으실 페이지 수를 입력해주세요(숫자입력), 전체: all\n입력:');

      selected.forEach((child) => {
        console.log(`${child.name} 데이터 추출 중...`);
        getJson(child.id, session, type, size, 1, urltype);
      });

      rl.close();
    } else {
      console.log("키즈노트에 등록된 자녀가 없습니다.");
      exit();
    }
  } catch (err) {
    console.error(`Request error: ${err.message}`);
  }
};

// 종료 함수
const exit = () => {
  rl.close();
  process.exit(0);
};

// 질문을 하고 입력을 받음
(async () => {
  const id = await askQuestion('아이디입력: ');
  const password = await askQuestion('패스워드 입력: ');
  await login(id, password);
})();
