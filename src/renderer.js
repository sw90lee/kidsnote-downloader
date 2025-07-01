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
  
  // 로그인 함수를 별도로 분리
  async function performLogin() {
    console.log('Login attempted');
    const credentials = {
      id: document.getElementById('username').value,
      password: document.getElementById('password').value
    };

    // 입력값 검증
    if (!credentials.id.trim() || !credentials.password.trim()) {
      logOutput.innerHTML += '<p>❌ 아이디와 비밀번호를 모두 입력해주세요.</p>';
      logOutput.scrollTop = logOutput.scrollHeight;
      return;
    }

    logOutput.innerHTML += '<p>🔑 로그인을 시도하고 있습니다...</p>';
    logOutput.scrollTop = logOutput.scrollHeight;

    const result = await window.electronAPI.login(credentials);
    if (result.success) {
      sessionID = result.result.sessionID;
      logOutput.innerHTML += '<p>✅ 로그인에 성공했습니다!</p>';
      logOutput.scrollTop = logOutput.scrollHeight;
      document.getElementById('login-form').classList.add('hidden');
      document.getElementById('options-form').classList.remove('hidden');
    } else {
      logOutput.innerHTML += `<p>❌ 로그인에 실패했습니다: ${result.error}</p>`;
      logOutput.scrollTop = logOutput.scrollHeight;
    }
  }

  // 로그인 버튼 클릭 이벤트
  loginBtn.addEventListener('click', performLogin);

  // Enter 키 이벤트 리스너 추가
  document.getElementById('username').addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      performLogin();
    }
  });

  document.getElementById('password').addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      performLogin();
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

  // 전체 다운로드 체크박스 이벤트 핸들러
  const downloadAllCheckbox = document.getElementById('download-all');
  if (downloadAllCheckbox) {
    downloadAllCheckbox.addEventListener('change', function() {
      if (this.checked) {
        logOutput.innerHTML += '<p>전체 다운로드가 선택되었습니다. 날짜 필터가 설정되어 있어도 전체 범위를 다운로드합니다.</p>';
        logOutput.scrollTop = logOutput.scrollHeight;
      } else {
        logOutput.innerHTML += '<p>날짜 필터 범위만 다운로드합니다.</p>';
        logOutput.scrollTop = logOutput.scrollHeight;
      }
    });
  }
  

  // changePathBtn 핸들러 별도 함수로 정의
  async function handleChangePath() {
    console.log('Change path button clicked');
    try {
      console.log('Calling window.electronAPI.selectDownloadPath');
      const newPath = await window.electronAPI.selectDownloadPath();
      console.log('Selected path:', newPath);
      if (newPath) {
        downloadPath = newPath;
        downloadPathInput.value = downloadPath;
        console.log('downloadPath updated to:', downloadPath);
        logOutput.innerHTML += `<p>다운로드 경로가 ${downloadPath}로 설정되었습니다.</p>`;
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

  // 파일명 정리용 함수 (현재 미사용, 필요시 사용)
  function removeInvalidFilenameCharacters(str) {
    // 파일명에서 Windows 파일 시스템 금지 문자만 제거 (경로에는 사용 안함)
    // 한글 등 유니코드 문자는 보존, 경로 구분자(: /)는 파일명에서만 제거
    return str.replace(/[<>:"/\\|?*]/g, '');
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

    const isDownloadAll = document.getElementById('download-all').checked;
    const type = document.getElementById('type').value;
    const urltype = document.getElementById('urltype').value;
    
    // 전체 다운로드 체크 시 날짜 필터 무시, 아니면 날짜 필터 적용
    let startDate, endDate, size;
    if (isDownloadAll) {
      startDate = null;
      endDate = null;
      size = 'all';
      logOutput.innerHTML += '<p>전체 다운로드 모드: 모든 날짜 범위의 모든 콘텐츠를 다운로드합니다.</p>';
    } else {
      startDate = document.getElementById('start-date').value || null;
      endDate = document.getElementById('end-date').value || null;
      size = 'all'; // 날짜 필터 범위 내에서 전체 다운로드
      if (startDate || endDate) {
        logOutput.innerHTML += `<p>날짜 필터 모드: ${startDate || '시작일 제한없음'} ~ ${endDate || '종료일 제한없음'} 범위를 다운로드합니다.</p>`;
      } else {
        logOutput.innerHTML += '<p>날짜 필터가 설정되지 않아 전체 범위를 다운로드합니다.</p>';
      }
    }
    logOutput.scrollTop = logOutput.scrollHeight;

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
    
    // 전체 다운로드 완료 메시지
    logOutput.innerHTML += '<p>🎉 모든 다운로드가 완료되었습니다!</p>';
    logOutput.scrollTop = logOutput.scrollHeight;
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