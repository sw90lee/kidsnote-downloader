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
      size: document.getElementById('size'),
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
    // 브라우저 환경에서는 폴더 선택 다이얼로그 사용 시도
    if ('showDirectoryPicker' in window) {
      try {
        // File System Access API 사용 (Chrome 86+)
        const dirHandle = await window.showDirectoryPicker();
        const path = dirHandle.name;
        this.downloadPath = `./downloads/${path}`;
        this.elements.downloadPathInput.value = this.downloadPath;
        this.updatePathStatus();
        this.log(`다운로드 경로가 ${this.downloadPath}로 설정되었습니다.`);
        return;
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.log('File System Access API 사용 실패:', error);
        }
      }
    }

    // 폴백: 서버에서 기본 경로를 가져와서 prompt 사용
    try {
      const response = await fetch('/api/select-download-path');
      const result = await response.json();
      
      const defaultPath = result.path || './downloads';
      const userPath = prompt(`다운로드 경로를 입력하세요:\n\n💡 참고:\n- 서버가 실행되는 머신의 절대 경로를 입력하세요\n- 예시: /home/user/Downloads 또는 C:\\Users\\사용자\\Downloads`, defaultPath);
      
      if (userPath) {
        this.downloadPath = userPath;
        this.elements.downloadPathInput.value = userPath;
        this.updatePathStatus();
        this.log(`다운로드 경로가 ${userPath}로 설정되었습니다.`);
      }
    } catch (error) {
      this.log(`경로 설정 오류: ${error.message}`);
      // 오류 발생시 직접 입력
      const userPath = prompt('다운로드 경로를 입력하세요:', this.downloadPath || './downloads');
      if (userPath) {
        this.downloadPath = userPath;
        this.elements.downloadPathInput.value = userPath;
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

  async handleDownload() {
    if (!this.downloadPath) {
      this.log('다운로드 경로를 설정해주세요.');
      return;
    }

    const childrenSelect = document.getElementById('children-select');
    if (!childrenSelect || !childrenSelect.value) {
      this.log('자녀를 선택해주세요.');
      return;
    }

    const childId = childrenSelect.value;
    const type = this.elements.type.value;
    const urltype = this.elements.urltype.value;
    const startDate = this.elements.startDate.value || null;
    const endDate = this.elements.endDate.value || null;
    const size = this.elements.size.value.trim() || 'all';

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

    // 콤보박스 스타일로 변경 (Electron과 동일)
    const select = document.createElement('select');
    select.id = 'children-select';
    select.multiple = false;
    select.size = this.children.length > 5 ? 5 : this.children.length;
    select.style.cssText = `
      width: 100%;
      min-height: 80px;
      max-height: 150px;
      padding: 15px;
      border: 2px solid #e1e5e9;
      border-radius: 10px;
      background: #fafbfc;
      font-size: 16px;
      cursor: pointer;
      transition: all 0.3s ease;
      font-family: inherit;
    `;

    // 포커스 스타일
    select.addEventListener('focus', () => {
      select.style.borderColor = '#667eea';
      select.style.background = 'white';
      select.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
    });

    select.addEventListener('blur', () => {
      select.style.borderColor = '#e1e5e9';
      select.style.background = '#fafbfc';
      select.style.boxShadow = 'none';
    });

    // 옵션 추가
    this.children.forEach(child => {
      const option = document.createElement('option');
      option.value = child.id;
      option.textContent = child.name;
      option.style.cssText = `
        padding: 10px 15px;
        font-size: 16px;
        background: white;
        border: none;
      `;
      select.appendChild(option);
    });

    // 컨테이너 초기화 및 select 추가
    container.innerHTML = '';
    container.appendChild(select);
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

  // 서버 로그 실시간 수신 (Server-Sent Events)
  startLogPolling() {
    try {
      const eventSource = new EventSource('/api/logs/stream');
      
      eventSource.onmessage = (event) => {
        try {
          const logEntry = JSON.parse(event.data);
          const logOutput = this.elements.logOutput;
          const p = document.createElement('p');
          const timestamp = new Date(logEntry.timestamp).toLocaleTimeString();
          p.textContent = `${logEntry.message}`;
          logOutput.appendChild(p);
          this.elements.logOutput.scrollTop = this.elements.logOutput.scrollHeight;
        } catch (error) {
          console.error('로그 파싱 오류:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE 연결 오류:', error);
        // 연결이 끊어지면 3초 후 재연결 시도
        setTimeout(() => {
          if (eventSource.readyState === EventSource.CLOSED) {
            this.startLogPolling();
          }
        }, 3000);
      };

      // 페이지 언로드시 연결 종료
      window.addEventListener('beforeunload', () => {
        eventSource.close();
      });
    } catch (error) {
      console.error('SSE 시작 오류:', error);
      // SSE를 지원하지 않는 경우 폴백으로 폴링 사용
      this.startLogPollingFallback();
    }
  }

  // 폴백 폴링 방식
  startLogPollingFallback() {
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
            p.textContent = `${logEntry.message}`;
            logOutput.appendChild(p);
          });
          this.elements.logOutput.scrollTop = this.elements.logOutput.scrollHeight;
          lastLogCount = data.logs.length;
        }
      } catch (error) {
        // 폴링 에러는 무시
      }
    }, 1000);
  }
}

// DOM이 로드되면 클라이언트 초기화
document.addEventListener('DOMContentLoaded', () => {
  new KidsnoteServerClient();
});

new KidsnoteServerClient();