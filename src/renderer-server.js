// 서버 모드용 renderer 스크립트
class KidsnoteServerClient {
  constructor() {
    this.sessionData = null;
    this.children = [];
    this.downloadPath = '';
    this.directoryHandle = null; // File System Access API용
    this.isDownloading = false;
    this.init();
  }

  init() {
    // DOM 요소들
    this.elements = {
      loginForm: document.getElementById('login-form'),
      optionsForm: document.getElementById('options-form'),
      childrenSelection: document.getElementById('children-selection'),
      logOutput: document.getElementById('log-output'),
      
      // 단계 표시
      step1: document.getElementById('step-1'),
      step2: document.getElementById('step-2'),
      step3: document.getElementById('step-3'),
      line1: document.getElementById('line-1'),
      line2: document.getElementById('line-2'),
      
      // 입력 필드들
      username: document.getElementById('username'),
      password: document.getElementById('password'),
      type: document.getElementById('type'),
      urltype: document.getElementById('urltype'),
      startDate: document.getElementById('start-date'),
      endDate: document.getElementById('end-date'),
      downloadAll: document.getElementById('download-all'),
      downloadPathInput: document.getElementById('download-path'),
      pathStatus: document.getElementById('path-status'),
      
      // 버튼들
      loginBtn: document.getElementById('login-btn'),
      nextBtn: document.getElementById('next-btn'),
      changePathBtn: document.getElementById('change-path-btn'),
      downloadBtn: document.getElementById('download-btn'),
      cancelBtn: document.getElementById('cancel-btn')
    };

    this.bindEvents();
    this.startLogPolling();
    this.startDownloadStatusPolling();
    this.log('웹 서버 모드로 실행 중입니다. 로그인을 진행해주세요.');
  }

  bindEvents() {
    // 로그인 버튼
    this.elements.loginBtn.addEventListener('click', () => this.handleLogin());
    
    // Enter 키로 로그인
    this.elements.password.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleLogin();
    });
    
    // 다음 단계 버튼
    this.elements.nextBtn.addEventListener('click', () => this.handleNext());
    
    // 경로 변경 버튼 (서버 모드에서는 직접 입력)
    this.elements.changePathBtn.addEventListener('click', () => this.handlePathChange());
    
    // 다운로드 시작 버튼
    this.elements.downloadBtn.addEventListener('click', () => this.handleDownload());
    
    // 다운로드 중단 버튼
    if (this.elements.cancelBtn) {
      this.elements.cancelBtn.addEventListener('click', () => this.handleCancelDownload());
    }
    
    // 다운로드 경로 입력 감지
    this.elements.downloadPathInput.addEventListener('input', () => this.updatePathStatus());
    
    // 전체 다운로드 체크박스 이벤트
    this.elements.downloadAll.addEventListener('change', () => this.handleDownloadAllChange());
  }

  async handleLogin() {
    const username = this.elements.username.value.trim();
    const password = this.elements.password.value.trim();

    if (!username || !password) {
      this.log('아이디와 비밀번호를 입력해주세요.');
      return;
    }

    this.elements.loginBtn.disabled = true;
    this.elements.loginBtn.textContent = '로그인 중...';

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: username, password })
      });

      const result = await response.json();

      if (result.success) {
        this.sessionData = result.result;
        this.showOptionsForm();
        this.updateStep(2);
      } else {
        this.log(`로그인 실패: ${result.error}`);
      }
    } catch (error) {
      this.log(`로그인 오류: ${error.message}`);
    } finally {
      this.elements.loginBtn.disabled = false;
      this.elements.loginBtn.textContent = '🚀 로그인하기';
    }
  }

  async handleNext() {
    const type = this.elements.type.value;
    const urltype = this.elements.urltype.value;

    if (!this.sessionData) {
      this.log('세션이 만료되었습니다. 다시 로그인해주세요.');
      return;
    }

    this.elements.nextBtn.disabled = true;
    this.elements.nextBtn.textContent = '처리 중...';

    try {
      const response = await fetch('/api/getID', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session: this.sessionData.sessionID,
          type,
          urltype
        })
      });

      const result = await response.json();

      if (result.success && result.result.children) {
        this.children = result.result.children;
        this.showChildrenSelection();
        this.updateStep(3);
      } else {
        this.log(`자녀 정보 조회 실패: ${result.error || '알 수 없는 오류'}`);
      }
    } catch (error) {
      this.log(`자녀 정보 조회 오류: ${error.message}`);
    } finally {
      this.elements.nextBtn.disabled = false;
      this.elements.nextBtn.textContent = '➡️ 다음 단계';
    }
  }

  async handlePathChange() {
    try {
      this.elements.changePathBtn.disabled = true;
      this.elements.changePathBtn.textContent = '📂 폴더 선택 중...';
      
      // 최신 브라우저에서 File System Access API 시도
      if ('showDirectoryPicker' in window) {
        try {
          const directoryHandle = await window.showDirectoryPicker();

          console.log('선택된 폴더123123123:', directoryHandle);
          // // 사용자가 쓰기 권한 허용해야 함
          // const permission = await directoryHandle.requestPermission({ mode: 'readwrite' });
          // if (permission !== 'granted') {
          //   throw new Error('쓰기 권한이 거부되었습니다.');
          // }

          
          // 내부적으로는 directoryHandle을 저장하고 절대 경로 설정
          this.directoryHandle = directoryHandle;
          
          // 서버에 directoryHandle 정보 전송하여 실제 경로 획득
          try {
            const response = await fetch('/api/resolve-directory', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                directoryName: directoryHandle.name,
                kind: directoryHandle.kind 
              })
            });
            
            const result = await response.json();
            if (result.success && result.resolvedPath) {
              this.downloadPath = result.resolvedPath;
            } else {
              // 기본 다운로드 폴더 사용
              this.downloadPath = `./downloads/${directoryHandle.name}`;
            }
          } catch (error) {
            console.log('경로 해결 실패, 기본 경로 사용:', error);
            this.downloadPath = `./downloads/${directoryHandle.name}`;
          }
          
          // 화면에는 간단히 표시
          this.elements.downloadPathInput.value = `선택된 폴더: ${directoryHandle.name}`;
          this.updatePathStatus();
          this.log(`다운로드 폴더가 선택되었습니다: ${directoryHandle.name}`);
          this.log(`절대 경로: ${this.downloadPath}`);
          this.log('실제 다운로드는 해당 절대 경로에 저장됩니다.');
          return;
        } catch (fsError) {
          this.log('폴더 선택이 취소되었거나 실패했습니다. 직접 입력 방법을 사용합니다.');
        }
      }
      
      // webkitdirectory가 실패하는 경우가 많으므로 직접 입력 방식 사용
      this.log('브라우저 환경에서는 직접 경로를 입력해주세요.');
      
      // 직접 입력 프롬프트
      const path = prompt(
        '다운로드 경로를 입력하세요:\n\n예시:\n- C:\\Downloads\\KidsnoteFiles\n- D:\\MyFiles\\Kidsnote\n- ./downloads\n\n경로:', 
        this.downloadPath || 'C:\\Downloads\\KidsnoteFiles'
      );
      
      if (path && path.trim()) {
        // 절대 경로로 저장
        this.downloadPath = path.trim();
        this.directoryHandle = null; // 직접 입력시에는 handle 없음
        
        // 화면에는 경로 숨기고 간단히 표시
        const pathParts = path.trim().split(/[\/\\]/);
        const folderName = pathParts[pathParts.length - 1] || 'root';
        this.elements.downloadPathInput.value = `설정된 폴더: ${folderName}`;
        
        this.updatePathStatus();
        this.log(`다운로드 경로가 설정되었습니다: ${folderName}`);
        this.log(`실제 다운로드는 지정한 절대 경로에 저장됩니다.`);
        return; // 성공적으로 설정되면 여기서 리턴
      } else {
        this.log('경로 설정이 취소되었습니다.');
        return;
      }
      
    } catch (error) {
      this.log(`폴더 선택 오류: ${error.message}`);
      // 오류 시 직접 입력
      const path = prompt('다운로드 경로를 직접 입력하세요:', this.downloadPath || '');
      if (path) {
        this.downloadPath = path;
        this.elements.downloadPathInput.value = path;
        this.updatePathStatus();
      }
    } finally {
      this.elements.changePathBtn.disabled = false;
      this.elements.changePathBtn.textContent = '📂 경로 변경';
    }
  }

  showPathSelectionModal(suggestedPaths, message, instructions) {
    // 모달 생성
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 1000;
    `;

    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      background: white;
      padding: 30px;
      border-radius: 15px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
      max-width: 600px;
      width: 90%;
      max-height: 80%;
      overflow-y: auto;
    `;

    modalContent.innerHTML = `
      <h3 style="margin-top: 0; color: #333; margin-bottom: 15px;">📂 다운로드 경로 선택</h3>
      <p style="color: #666; margin-bottom: 20px; line-height: 1.5;">${message}</p>
      <p style="color: #444; margin-bottom: 20px; font-weight: 500;">${instructions}</p>
      
      <div style="margin-bottom: 20px;">
        <label style="display: block; margin-bottom: 10px; font-weight: 500; color: #555;">제안된 경로:</label>
        <div id="path-suggestions" style="margin-bottom: 15px;"></div>
      </div>
      
      <div style="margin-bottom: 20px;">
        <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #555;">직접 입력:</label>
        <input type="text" id="custom-path" placeholder="경로를 직접 입력하세요" 
               style="width: 100%; padding: 12px; border: 2px solid #e1e5e9; border-radius: 8px; font-size: 16px;"
               value="${this.downloadPath || ''}">
      </div>
      
      <div style="display: flex; gap: 10px; justify-content: flex-end;">
        <button id="cancel-path" style="padding: 12px 20px; border: 2px solid #ddd; background: white; color: #666; border-radius: 8px; cursor: pointer;">취소</button>
        <button id="confirm-path" style="padding: 12px 20px; border: none; background: linear-gradient(135deg, #667eea, #764ba2); color: white; border-radius: 8px; cursor: pointer;">확인</button>
      </div>
    `;

    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    // 제안된 경로 버튼 생성
    const suggestionsContainer = modalContent.querySelector('#path-suggestions');
    suggestedPaths.forEach(path => {
      const pathBtn = document.createElement('button');
      pathBtn.textContent = path;
      pathBtn.style.cssText = `
        display: block;
        width: 100%;
        padding: 10px 15px;
        margin-bottom: 8px;
        border: 2px solid #e1e5e9;
        background: #f8f9fa;
        color: #333;
        border-radius: 8px;
        cursor: pointer;
        text-align: left;
        transition: all 0.2s ease;
      `;
      
      pathBtn.addEventListener('click', () => {
        modalContent.querySelector('#custom-path').value = path;
      });
      
      pathBtn.addEventListener('mouseenter', () => {
        pathBtn.style.background = '#e9ecef';
        pathBtn.style.borderColor = '#667eea';
      });
      
      pathBtn.addEventListener('mouseleave', () => {
        pathBtn.style.background = '#f8f9fa';
        pathBtn.style.borderColor = '#e1e5e9';
      });
      
      suggestionsContainer.appendChild(pathBtn);
    });

    // 이벤트 핸들러
    modalContent.querySelector('#cancel-path').addEventListener('click', () => {
      document.body.removeChild(modal);
    });

    modalContent.querySelector('#confirm-path').addEventListener('click', () => {
      const selectedPath = modalContent.querySelector('#custom-path').value.trim();
      if (selectedPath) {
        this.downloadPath = selectedPath;
        this.elements.downloadPathInput.value = selectedPath;
        this.updatePathStatus();
        this.log(`다운로드 경로가 설정되었습니다: ${selectedPath}`);
      }
      document.body.removeChild(modal);
    });

    // Enter 키로 확인
    modalContent.querySelector('#custom-path').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        modalContent.querySelector('#confirm-path').click();
      }
    });

    // 배경 클릭으로 닫기
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });

    // 첫 번째 입력 필드에 포커스
    setTimeout(() => {
      modalContent.querySelector('#custom-path').focus();
    }, 100);
  }

  updatePathStatus() {
    const path = this.elements.downloadPathInput.value.trim();
    if (path) {
      this.downloadPath = path;
      this.elements.pathStatus.textContent = '경로 설정됨';
      this.elements.pathStatus.className = 'path-status set';
    } else {
      this.elements.pathStatus.textContent = '경로 설정 필요';
      this.elements.pathStatus.className = 'path-status unset';
    }
  }

  handleDownloadAllChange() {
    const isChecked = this.elements.downloadAll.checked;
    
    if (isChecked) {
      this.log('전체 다운로드가 선택되었습니다. 날짜 필터가 설정되어 있어도 전체 범위를 다운로드합니다.');
    } else {
      this.log('날짜 필터 범위만 다운로드합니다.');
    }
  }

  async handleDownload() {
    if (!this.downloadPath) {
      this.log('다운로드 경로를 설정해주세요.');
      return;
    }

    const selectedChildSelect = document.querySelector('#child-select');
    if (!selectedChildSelect || !selectedChildSelect.value) {
      this.log('자녀를 선택해주세요.');
      return;
    }

    const childId = selectedChildSelect.value;
    const type = this.elements.type.value;
    const urltype = this.elements.urltype.value;
    const isDownloadAll = this.elements.downloadAll.checked;
    
    // 전체 다운로드 체크 시 날짜 필터 무시, 아니면 날짜 필터 적용
    let startDate, endDate, size;
    if (isDownloadAll) {
      startDate = null;
      endDate = null;
      size = 'all';
      this.log('전체 다운로드 모드: 모든 날짜 범위의 모든 콘텐츠를 다운로드합니다.');
    } else {
      startDate = this.elements.startDate.value || null;
      endDate = this.elements.endDate.value || null;
      size = 'all'; // 날짜 필터 범위 내에서 전체 다운로드
      if (startDate || endDate) {
        this.log(`날짜 필터 모드: ${startDate || '시작일 제한없음'} ~ ${endDate || '종료일 제한없음'} 범위를 다운로드합니다.`);
      } else {
        this.log('날짜 필터가 설정되지 않아 전체 범위를 다운로드합니다.');
      }
    }

    this.setDownloadingState(true);

    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: childId,
          session: this.sessionData.sessionID,
          type,
          size,
          index: 1,
          urltype,
          downloadPath: this.downloadPath,
          startDate,
          endDate
        })
      });

      const result = await response.json();

      if (result.success) {
        this.log('다운로드가 완료되었습니다!');
      } else {
        this.log(`다운로드 실패: ${result.error}`);
      }
    } catch (error) {
      this.log(`다운로드 오류: ${error.message}`);
    } finally {
      this.setDownloadingState(false);
    }
  }

  async handleCancelDownload() {
    try {
      this.elements.cancelBtn.disabled = true;
      this.elements.cancelBtn.textContent = '중단 중...';
      
      const response = await fetch('/api/cancel-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const result = await response.json();
      
      if (result.success) {
        this.log('다운로드가 중단되었습니다.');
      } else {
        this.log(`다운로드 중단 실패: ${result.error}`);
      }
    } catch (error) {
      this.log(`다운로드 중단 오류: ${error.message}`);
    } finally {
      this.setDownloadingState(false);
    }
  }

  setDownloadingState(downloading) {
    this.isDownloading = downloading;
    
    if (downloading) {
      this.elements.downloadBtn.disabled = true;
      this.elements.downloadBtn.textContent = '다운로드 중...';
      
      if (this.elements.cancelBtn) {
        this.elements.cancelBtn.style.display = 'inline-block';
        this.elements.cancelBtn.disabled = false;
        this.elements.cancelBtn.textContent = '🛑 다운로드 중단';
      }
    } else {
      this.elements.downloadBtn.disabled = false;
      this.elements.downloadBtn.textContent = '⬇️ 다운로드 시작';
      
      if (this.elements.cancelBtn) {
        this.elements.cancelBtn.style.display = 'none';
        this.elements.cancelBtn.disabled = false;
        this.elements.cancelBtn.textContent = '🛑 다운로드 중단';
      }
    }
  }

  showOptionsForm() {
    this.elements.loginForm.classList.add('hidden');
    this.elements.optionsForm.classList.remove('hidden');
  }

  showChildrenSelection() {
    this.elements.optionsForm.classList.add('hidden');
    this.elements.childrenSelection.classList.remove('hidden');
    this.renderChildrenList();
  }

  renderChildrenList() {
    const container = document.getElementById('children-list');
    if (!container) return;

    if (this.children.length === 0) {
      container.innerHTML = `
        <div class="children-empty">
          <span class="emoji">👶</span>
          자녀 정보를 찾을 수 없습니다.
        </div>
      `;
      return;
    }

    const html = `
      <label for="child-select">자녀 선택</label>
      <select id="child-select" name="child" style="margin-top: 10px;">
        <option value="">자녀를 선택하세요</option>
        ${this.children.map(child => `
          <option value="${child.id}">${child.name}</option>
        `).join('')}
      </select>
    `;
    container.innerHTML = html;

    // 콤보박스 스타일링 및 이벤트 처리
    const selectElement = container.querySelector('#child-select');
    if (selectElement) {
      selectElement.addEventListener('change', (e) => {
        const selectedValue = e.target.value;
        if (selectedValue) {
          const selectedChild = this.children.find(child => child.id === selectedValue);
          if (selectedChild) {
            this.log(`선택된 자녀: ${selectedChild.name}`);
          }
        }
      });
    }
  }

  updateStep(activeStep) {
    [1, 2, 3].forEach(step => {
      const stepEl = this.elements[`step${step}`];
      const lineEl = step < 3 ? this.elements[`line${step}`] : null;

      if (step < activeStep) {
        stepEl.className = 'step completed';
        if (lineEl) lineEl.className = 'step-line completed';
      } else if (step === activeStep) {
        stepEl.className = 'step active';
        if (lineEl) lineEl.className = 'step-line';
      } else {
        stepEl.className = 'step';
        if (lineEl) lineEl.className = 'step-line';
      }
    });
  }

  log(message) {
    const logOutput = this.elements.logOutput;
    const p = document.createElement('p');
    p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logOutput.appendChild(p);
    logOutput.scrollTop = logOutput.scrollHeight;
  }

  // 서버 로그 폴링
  startLogPolling() {
    let lastLogCount = 0;
    
    setInterval(async () => {
      try {
        const response = await fetch('/api/logs');
        const data = await response.json();
        
        if (data.logs && data.logs.length > lastLogCount) {
          const newLogs = data.logs.slice(lastLogCount);
          newLogs.forEach(logEntry => {
            const logOutput = this.elements.logOutput;
            const p = document.createElement('p');
            const timestamp = new Date(logEntry.timestamp).toLocaleTimeString();
            p.textContent = `[${timestamp}] ${logEntry.message}`;
            logOutput.appendChild(p);
          });
          this.elements.logOutput.scrollTop = this.elements.logOutput.scrollHeight;
          lastLogCount = data.logs.length;
        }
      } catch (error) {
        // 폴링 에러는 무시 (서버가 아직 시작되지 않았을 수 있음)
      }
    }, 1000);
  }

  // 다운로드 상태 폴링
  startDownloadStatusPolling() {
    setInterval(async () => {
      try {
        const response = await fetch('/api/download-status');
        const data = await response.json();
        
        // 서버의 다운로드 상태와 클라이언트 상태가 다른 경우 동기화
        if (data.isDownloading !== this.isDownloading) {
          this.setDownloadingState(data.isDownloading);
        }
      } catch (error) {
        // 폴링 에러는 무시
      }
    }, 2000);
  }
}

// DOM이 로드되면 클라이언트 초기화
document.addEventListener('DOMContentLoaded', () => {
  new KidsnoteServerClient();
});

new KidsnoteServerClient();