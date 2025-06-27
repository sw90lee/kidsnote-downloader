function main() {
   console.log("✅ main() 실행: DOM이 준비됐거나 이미 준비됨");
   if (window.electronAPI) {
    console.log('electronAPI is available:', Object.keys(window.electronAPI));
  } else {
    console.error('electronAPI is not available!');
  }
  if (!window.os || !window.os.homedir) console.log('Error: window.os or window.os.homedir is not defined');
  if (!window.path || !window.path.join) console.log('Error: window.path or window.path.join is not defined');

  const loginBtn = document.getElementById('login-btn');
  const nextBtn = document.getElementById('next-btn');
  const downloadBtn = document.getElementById('download-btn');
  const logOutput = document.getElementById('log-output');
  const pathStatus = document.getElementById('path-status');
  const changePathBtn = document.getElementById('change-path-btn');
  let sessionID;
  let downloadPath = '';
  
  try {
    downloadPath = window.path.join(window.os.homedir(), 'Downloads');
    console.log('Initial downloadPath set to:', downloadPath);
  } catch (error) {
    console.log('Error setting initial downloadPath:', error);
    downloadPath = './'; // 대체 경로
    logOutput.innerHTML += `<p>다운로드 경로 설정 오류: ${error.message}. 기본 경로(C:\\Downloads) 사용</p>`;
    if (pathStatus) {
      pathStatus.textContent = '경로 설정 필요';
      pathStatus.classList.add('unset');
    }
  }

  const downloadPathInput = document.getElementById('download-path');
  if (downloadPathInput) downloadPathInput.value = downloadPath;

  console.log('✅ 모든 요소 찾기 완료');
  loginBtn.addEventListener('click', async () => {
        console.log('Login button clicked');
    const credentials = {
      id: document.getElementById('username').value,
      password: document.getElementById('password').value
    };

    const result = await window.electronAPI.login(credentials);
    if (result.success) {
      sessionID = result.result.sessionID;
      document.getElementById('login-form').classList.add('hidden');
      document.getElementById('options-form').classList.remove('hidden');
    }
  });

  

  nextBtn.addEventListener('click', async () => {
    const params = {
      session: sessionID,
      type: document.getElementById('type').value,
      urltype: document.getElementById('urltype').value
    };

    const result = await window.electronAPI.getID(params);
    if (result.success) {
      const childrenList = document.getElementById('children-list');
      childrenList.innerHTML = '';

      // <select> 요소 생성
      const select = document.createElement('select');
      select.id = 'children-select';
      select.multiple = false; // 여러 항목 선택 가능 (필요 시 제거 가능)
      select.size = result.result.children.length > 5 ? 5 : result.result.children.length; // 표시 크기 조정

      console.log("select ", select)

      result.result.children.forEach(child => {
        const option = document.createElement('option');
        option.value = child.id;
        option.textContent = `${child.name}`;
        select.appendChild(option);
        // const div = document.createElement('div');
        // div.innerHTML = `<input type="checkbox" value="${child.id}" id="child-${child.id}">
        //                  <label for="child-${child.id}">[${child.index}] ${child.name}</label>`;
        // childrenList.appendChild(div);
      });

      childrenList.appendChild(select);
      
      document.getElementById('options-form').classList.add('hidden');
      document.getElementById('children-selection').classList.remove('hidden');
    }
  });

  // downloadBtn.addEventListener('click', async () => {
  //   const selectedChildren = Array.from(document.querySelectorAll('#children-list input:checked'))
  //     .map(input => input.value);
  //   const size = document.getElementById('size').value;
  //   const type = document.getElementById('type').value;
  //   const urltype = document.getElementById('urltype').value;

  //   for (const childId of selectedChildren) {
  //     await window.electronAPI.download({
  //       id: childId,
  //       session: sessionID,
  //       type,
  //       size,
  //       index: 1,
  //       urltype
  //     });
  //   }
  // });

  if (!changePathBtn) {
    console.error('Error: change-path-btn not found');
    logOutput.innerHTML += '<p>Error: 경로 변경 버튼을 찾을 수 없습니다.</p>';
  } else {
    console.log('changePathBtn found');
    changePathBtn.removeEventListener('click', handleChangePath); // 중복 방지
    changePathBtn.addEventListener('click', handleChangePath);
  };
  

  // changePathBtn 핸들러 별도 함수로 정의
  async function handleChangePath() {
    console.log('Change path button clicked');
    try {
      console.log('Calling window.electronAPI.selectDownloadPath');
      const newPath = await window.electronAPI.selectDownloadPath();
      console.log('Selected path:', newPath);
      if (newPath) {
        downloadPath = newPath;
        downloadPathInput.value = removeInvalidCharacters(downloadPath);
        console.log('downloadPath updated to:', removeInvalidCharacters(downloadPath));
        logOutput.innerHTML += `<p>다운로드 경로가 ${removeInvalidCharacters(downloadPath)}로 설정되었습니다.</p>`;
        if (pathStatus) {
          pathStatus.textContent = '경로 설정됨';
          pathStatus.classList.remove('unset');
          pathStatus.classList.add('set');
        }
        logOutput.scrollTop = logOutput.scrollHeight;
      } else {
        console.log('Path selection canceled');
        logOutput.innerHTML += '<p>경로 선택이 취소되었습니다.</p>';
        logOutput.scrollTop = logOutput.scrollHeight;
      }
    } catch (error) {
      console.error('Error changing download path:', error);
      logOutput.innerHTML += `<p>경로 변경 오류: ${error.message}</p>`;
      logOutput.scrollTop = logOutput.scrollHeight;
    }
  }

  function removeInvalidCharacters(str) {
    str = str.replace(/[^\x00-\x7F]/g, '');
    return str;
  }


  downloadBtn.addEventListener('click', async () => {
    console.log('Download button clicked');
    if (!downloadPath) {
      logOutput.innerHTML += '<p>오류: 다운로드 경로가 설정되지 않았습니다. 경로를 먼저 설정해주세요.</p>';
      logOutput.scrollTop = logOutput.scrollHeight;
      return;
    }
    
    const selectedChildren = Array.from(document.getElementById('children-select').selectedOptions)
      .map(option => option.value);
    if (selectedChildren.length === 0) {
      logOutput.innerHTML += '<p>오류: 다운로드할 자녀를 선택해주세요.</p>';
      logOutput.scrollTop = logOutput.scrollHeight;
      return;
    }

    const size = document.getElementById('size').value;
    const type = document.getElementById('type').value;
    const urltype = document.getElementById('urltype').value;
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;

    // 날짜 유효성 검사
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      logOutput.innerHTML += '<p>오류: 시작 날짜가 종료 날짜보다 늦습니다.</p>';
      logOutput.scrollTop = logOutput.scrollHeight;
      return;
    }

    let downloadMessage = `다운로드 시작 - 경로: ${downloadPath}`;
    if (startDate || endDate) {
      downloadMessage += ` | 날짜 필터: ${startDate || '제한없음'} ~ ${endDate || '제한없음'}`;
    }
    logOutput.innerHTML += `<p>${downloadMessage}</p>`;
    logOutput.scrollTop = logOutput.scrollHeight;

    for (const childId of selectedChildren) {
      try {
        await window.electronAPI.download({
          id: childId,
          session: sessionID,
          type,
          size,
          index: 1,
          urltype,
          downloadPath,
          startDate: startDate || null,
          endDate: endDate || null
        });
      } catch (error) {
        console.error('Download error for child', childId, ':', error);
        logOutput.innerHTML += `<p>다운로드 오류 (자녀 ID: ${childId}): ${error.message}</p>`;
        logOutput.scrollTop = logOutput.scrollHeight;
      }
    }
  });

  window.electronAPI.onLog((message) => {
    const logEntry = document.createElement('p');
    logEntry.textContent = message;
    logOutput.appendChild(logEntry);
    logOutput.scrollTop = logOutput.scrollHeight;
  });
}


if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main(); // 이미 DOMContentLoaded가 발생한 상태일 때 즉시 실행
}