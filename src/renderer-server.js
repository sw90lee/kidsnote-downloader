// 서버 모드용 renderer 스크립트
class KidsnoteServerClient {
  constructor() {
    this.sessionData = null;
    this.children = [];
    this.downloadPath = '';
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
      downloadBtn: document.getElementById('download-btn')
    };

    this.bindEvents();
    this.startLogPolling();
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
      // 먼저 탐색기를 열고 현재 경로를 확인
      const response = await fetch('/api/open-explorer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          defaultPath: this.downloadPath || null 
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        this.log(`탐색기가 열렸습니다: ${result.path}`);
        
        // 탐색기가 열린 후 사용자가 경로를 입력하도록 안내
        setTimeout(() => {
          const path = prompt('탐색기에서 원하는 폴더를 확인한 후, 다운로드 경로를 입력하세요:', result.path);
          if (path) {
            this.downloadPath = path;
            this.elements.downloadPathInput.value = path;
            this.updatePathStatus();
            this.log(`다운로드 경로가 설정되었습니다: ${path}`);
          }
        }, 1000);
      } else {
        this.log(`탐색기 열기 실패: ${result.error}`);
        // 탐색기 열기가 실패한 경우 기존 방식으로 진행
        const path = prompt('다운로드 경로를 입력하세요:', this.downloadPath || '');
        if (path) {
          this.downloadPath = path;
          this.elements.downloadPathInput.value = path;
          this.updatePathStatus();
        }
      }
    } catch (error) {
      this.log(`경로 변경 오류: ${error.message}`);
      // 오류 발생 시 기존 방식으로 진행
      const path = prompt('다운로드 경로를 입력하세요:', this.downloadPath || '');
      if (path) {
        this.downloadPath = path;
        this.elements.downloadPathInput.value = path;
        this.updatePathStatus();
      }
    }
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

    this.elements.downloadBtn.disabled = true;
    this.elements.downloadBtn.textContent = '다운로드 중...';

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
      this.elements.downloadBtn.disabled = false;
      this.elements.downloadBtn.textContent = '⬇️ 다운로드 시작';
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
}

// DOM이 로드되면 클라이언트 초기화
document.addEventListener('DOMContentLoaded', () => {
  new KidsnoteServerClient();
});

new KidsnoteServerClient();