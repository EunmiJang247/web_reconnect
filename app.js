// 전역 변수
let sensors = [];
let sensorGroups = new Map(); // 복합가스센서용
let lelSensors = new Map(); // LEL센서용
let sensorGroupAlarms = new Map();
let sensorThresholds = new Map(); // 센서별 개별 임계치
let serverIp = "localhost";
let serverPort = "8081";
let isLoadingSensors = false;
let currentThresholdSensorId = null;
let currentThresholdSensorType = null;

// DOM 요소
const elements = {
  connectionStatus: null,
  sensorGrid: null,
  loadingContainer: null,
  errorContainer: null,
  errorMessage: null,
  lastUpdateTime: null,
  totalSensors: null,
  settingsModal: null,
  thresholdModal: null,
  serverIpInput: null,
  serverPortInput: null,
  apiUrl: null,
  wsUrl: null,
  sensorList: null,
  sensorCount: null,
};

// 초기화
document.addEventListener("DOMContentLoaded", function () {
  initializeElements();
  setupEventListeners();
  setupWebSocketCallbacks();
  loadSensors();
});

// DOM 요소 초기화
function initializeElements() {
  elements.connectionStatus = document.getElementById("connectionStatus");
  elements.sensorGrid = document.getElementById("sensorGrid");
  elements.loadingContainer = document.getElementById("loadingContainer");
  elements.errorContainer = document.getElementById("errorContainer");
  elements.errorMessage = document.getElementById("errorMessage");
  elements.lastUpdateTime = document.getElementById("lastUpdateTime");
  elements.totalSensors = document.getElementById("totalSensors");
  elements.settingsModal = document.getElementById("settingsModal");
  elements.thresholdModal = document.getElementById("thresholdModal");
  elements.serverIpInput = document.getElementById("serverIp");
  elements.serverPortInput = document.getElementById("serverPort");
  elements.apiUrl = document.getElementById("apiUrl");
  elements.wsUrl = document.getElementById("wsUrl");
  elements.sensorList = document.getElementById("sensorList");
  elements.sensorCount = document.getElementById("sensorCount");
}

// 이벤트 리스너 설정
function setupEventListeners() {
  // 설정 버튼
  document
    .getElementById("settingsBtn")
    .addEventListener("click", openSettingsModal);

  // 재연결 버튼
  document
    .getElementById("reconnectBtn")
    .addEventListener("click", manualReconnect);

  // 모달 닫기
  document
    .getElementById("closeModal")
    .addEventListener("click", closeSettingsModal);
  document
    .getElementById("cancelBtn")
    .addEventListener("click", closeSettingsModal);
  document
    .getElementById("closeThresholdModal")
    .addEventListener("click", closeThresholdModal);
  document
    .getElementById("cancelThresholdBtn")
    .addEventListener("click", closeThresholdModal);

  // 설정 저장
  document.getElementById("saveBtn").addEventListener("click", saveSettings);
  document
    .getElementById("saveThresholdBtn")
    .addEventListener("click", saveThresholds);

  // 서버 설정 변경시 URL 업데이트
  elements.serverIpInput.addEventListener("input", updateUrlDisplay);
  elements.serverPortInput.addEventListener("input", updateUrlDisplay);

  // 모달 외부 클릭시 닫기
  elements.settingsModal.addEventListener("click", function (e) {
    if (e.target === elements.settingsModal) {
      closeSettingsModal();
    }
  });

  elements.thresholdModal.addEventListener("click", function (e) {
    if (e.target === elements.thresholdModal) {
      closeThresholdModal();
    }
  });
}

// WebSocket 콜백 설정
function setupWebSocketCallbacks() {
  wsClient.onConnect = function () {
    updateConnectionStatus("connected", `${sensors.length}개 센서 구독 완료`);
    subscribeToAllSensors();
  };

  wsClient.onDisconnect = function () {
    updateConnectionStatus("disconnected", "연결 끊어짐");
  };

  wsClient.onError = function (error) {
    updateConnectionStatus(
      "disconnected",
      `연결 오류: ${error.message || error}`
    );
  };

  wsClient.onMessage = function (destination, body, headers) {
    handleSensorMessage(destination, body);
  };
}

// 연결 상태 업데이트
function updateConnectionStatus(status, message) {
  const statusElement = elements.connectionStatus;
  const statusIcon = statusElement.querySelector(".status-icon");
  const statusText = statusElement.querySelector(".status-text");

  // 기존 클래스 제거
  statusElement.classList.remove(
    "status-connected",
    "status-disconnected",
    "status-loading"
  );

  // 새 상태 적용
  statusElement.classList.add(`status-${status}`);
  statusText.textContent = message;

  if (status === "loading") {
    // statusIcon.className = "fas fa-spinner fa-spin status-icon";
  } else if (status === "connected") {
    // statusIcon.className = "fas fa-circle status-icon";
  } else {
    // statusIcon.className = "fas fa-circle status-icon";
  }
}

// 센서 정보 로딩
async function loadSensors() {
  if (isLoadingSensors) {
    console.log("이미 센서 로딩 중 - 중복 요청 방지");
    return;
  }

  isLoadingSensors = true;
  showLoadingState();
  updateConnectionStatus("loading", "센서 정보 로딩중...");

  try {
    const apiUrl = `http://${serverIp}:${serverPort}/api/sensor/mappings`;
    console.log("=== 센서 정보 로딩 시작 ===");
    console.log("API URL:", apiUrl);

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    console.log("HTTP 응답 코드:", response.status);
    console.log("HTTP 응답 헤더:", response.headers);

    if (response.status === 200) {
      const responseData = await response.json();
      console.log("HTTP 응답 데이터:", responseData);

      // 응답 구조 확인 및 데이터 추출
      let sensorData = [];
      if (responseData.data && responseData.data.sensors) {
        // 새로운 구조: {code, message, data: {sensors: []}}
        sensorData = responseData.data.sensors;
      } else if (Array.isArray(responseData.data)) {
        // 데이터가 data 필드에 배열로 있는 경우
        sensorData = responseData.data;
      } else if (Array.isArray(responseData)) {
        // 기존 구조: 직접 배열
        sensorData = responseData;
      } else {
        throw new Error("예상하지 못한 응답 형식입니다.");
      }

      console.log("추출된 센서 데이터:", sensorData);

      // 센서 데이터 파싱
      const validSensorData = sensorData.filter((item) => {
        const isValid =
          !item.modelName || !item.modelName.toLowerCase().includes("error");
        if (!isValid) {
          //   console.log(`에러 센서 제외: ${item.modelName} (${item.portName})`);
        }
        return isValid;
      });

      // 센서 데이터 파싱
      sensors = validSensorData.map((item) => SensorInfo.fromJson(item));
      console.log(`센서 ${sensors.length}개 로드 완료`);

      // UI 업데이트
      updateTotalSensorsCount();
      showSensorGrid();
      renderSensorCards();

      // WebSocket 연결
      connectWebSocket();
    } else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  } catch (error) {
    console.error("센서 로딩 실패:", error);
    showErrorState(error.message);
    updateConnectionStatus("disconnected", "센서 로딩 실패");
  } finally {
    isLoadingSensors = false;
  }
}

// WebSocket 연결
function connectWebSocket() {
  const wsUrl = `ws://${serverIp}:${serverPort}/ws/sensor`;
  console.log("WebSocket 연결 시도:", wsUrl);
  updateConnectionStatus("loading", "WebSocket 연결중...");
  wsClient.connect(wsUrl);
}

// 모든 센서 구독
function subscribeToAllSensors() {
  console.log("--- 센서 구독 시작 ---");

  sensors.forEach((sensor, index) => {
    console.log(`센서 ${index + 1}/${sensors.length}: ${sensor.displayName}`);
    console.log(`  - 토픽: ${sensor.topicPath}`);

    wsClient.subscribe(sensor.topicPath, (body) => {
      updateSensor(index, body);
    });

    console.log("  ✓ 구독 완료");
  });

  console.log("=== 웹소켓 구독 완료 ===");
}

// 센서 메시지 처리
function handleSensorMessage(destination, body) {
  const sensorIndex = sensors.findIndex(
    (sensor) => sensor.topicPath === destination
  );
  if (sensorIndex !== -1) {
    updateSensor(sensorIndex, body);
  }
}

// 센서 데이터 업데이트
// 센서 데이터 업데이트
function updateSensor(sensorIndex, body) {
  if (!body || body.trim() === "" || sensorIndex >= sensors.length) return;

  const now = new Date();
  const nowStr = now.toLocaleTimeString();
  const sensor = sensors[sensorIndex];
  const sensorId = `${sensor.modelName}_${sensor.portName}`;

  console.log("=== 웹소켓 데이터 수신 ===");
  console.log("시간:", nowStr);
  console.log("센서:", sensorId, `(${sensor.displayName})`);
  console.log("원본 데이터:", body);
  console.log("데이터 길이:", body.length, "bytes");

  try {
    // JSON 파싱
    const data = JSON.parse(body);
    console.log("파싱된 데이터:", data);

    // 센서 타입 확인
    if (sensor.gasType === "LEL") {
      // LEL 센서 데이터 처리 (기존 구조 유지)
      const lelData = {
        lel: data.lel || "--",
        temperature: data.temperature || "--",
        humidity: data.humidity || "--",
        gasId: data.gasId || "--",
      };
      lelSensors.set(sensorId, lelData);
      console.log("LEL 센서 데이터 저장:", lelData);
    } else {
      // 복합가스센서 데이터 처리 - 새로운 구조에 맞게 수정
      const gasData = {
        CO: data.co || data.CO || "--", // 소문자 우선, 대문자 fallback
        O2: data.o2 || data.O2 || "--",
        H2S: data.h2s || data.H2S || "--",
        CO2: data.co2 || data.CO2 || "--",
      };
      sensorGroups.set(sensorId, gasData);
      console.log("복합가스센서 데이터 저장:", gasData);
    }

    // 알람 메시지 처리 - 새로운 구조에 맞게 수정
    let alarmMessage = "";
    if (data.alarmResult) {
      const alarmResult = data.alarmResult;
      if (alarmResult.alarmLevel && alarmResult.alarmLevel !== "NORMAL") {
        alarmMessage = `${alarmResult.alarmLevel}`;
        if (alarmResult.messages && alarmResult.messages.length > 0) {
          alarmMessage += `: ${alarmResult.messages.join(", ")}`;
        }
      }
    } else if (data.alarm && data.alarm.trim() !== "") {
      // 기존 alarm 필드도 지원
      alarmMessage = data.alarm;
    }

    if (alarmMessage) {
      sensorGroupAlarms.set(sensorId, alarmMessage);
    } else {
      sensorGroupAlarms.delete(sensorId);
    }

    // 마지막 업데이트 시간 갱신
    elements.lastUpdateTime.textContent = nowStr;

    // UI 업데이트
    renderSensorCards();
  } catch (error) {
    console.error("데이터 파싱 실패:", error);
    console.error("원본 데이터:", body);
  }
}

// UI 상태 함수들
function showLoadingState() {
  elements.loadingContainer.style.display = "flex";
  elements.sensorGrid.style.display = "none";
  elements.errorContainer.style.display = "none";
}

function showSensorGrid() {
  elements.loadingContainer.style.display = "none";
  elements.sensorGrid.style.display = "grid";
  elements.errorContainer.style.display = "none";
}

function showErrorState(message) {
  elements.loadingContainer.style.display = "none";
  elements.sensorGrid.style.display = "none";
  elements.errorContainer.style.display = "flex";
  elements.errorMessage.textContent = message;
}

function updateTotalSensorsCount() {
  elements.totalSensors.textContent = sensors.length;
}

// 센서 카드 렌더링
function renderSensorCards() {
  const grid = elements.sensorGrid;
  grid.innerHTML = "";

  sensors.forEach((sensor, index) => {
    const sensorId = `${sensor.modelName}_${sensor.portName}`;
    let cardElement;

    if (sensor.gasType === "LEL") {
      cardElement = createLelSensorCard(sensorId, sensor);
    } else {
      cardElement = createSensorGroupCard(sensorId, sensor);
    }

    grid.appendChild(cardElement);
  });
}

// LEL 센서 카드 생성
function createLelSensorCard(sensorId, sensor) {
  const lelData = lelSensors.get(sensorId) || {
    lel: "--",
    temperature: "--",
    humidity: "--",
    gasId: "--",
  };
  const alarmMessage = sensorGroupAlarms.get(sensorId) || "";

  // LEL 값으로 상태 계산
  const lelValue = lelData.lel || "--";
  const status = calculateSensorGasStatus(sensorId, "LEL", lelValue);

  let statusColor, statusText;
  switch (status) {
    case SensorStatus.NORMAL:
      statusColor = "#27ae60";
      statusText = "정상";
      break;
    case SensorStatus.WARNING:
      statusColor = "#f39c12";
      statusText = "경고";
      break;
    case SensorStatus.DANGER:
      statusColor = "#e74c3c";
      statusText = "위험";
      break;
    default:
      statusColor = "#95a5a6";
      statusText = "오류";
  }

  const card = document.createElement("div");
  card.className = `sensor-card lel-sensor status-${status}`;
  card.innerHTML = `
        <div class="sensor-header">
            <h3 class="sensor-title">
                 ${sensor.displayName}
            </h3>
            <div class="sensor-actions">
                <button class="btn btn-secondary" onclick="openThresholdModal('${sensorId}', 'lel')">
                    
                </button>
            </div>
        </div>
        
        <div class="sensor-status status-${status}">
            
            <span>${statusText}</span>
        </div>
        
        <div class="lel-main-value">
            <div class="lel-value status-${status}" style="color: ${statusColor}">
                ${lelValue}
            </div>
            <div class="lel-label">LEL (%)</div>
        </div>
        
        <div class="lel-additional">
            <div class="lel-item">
                <div class="lel-item-label">온도</div>
                <div class="lel-item-value">${
                  lelData.temperature === "--"
                    ? "--"
                    : lelData.temperature + "°C"
                }</div>
            </div>
            <div class="lel-item">
                <div class="lel-item-label">습도</div>
                <div class="lel-item-value">${
                  lelData.humidity === "--" ? "--" : lelData.humidity + "%"
                }</div>
            </div>
            <div class="lel-item">
                <div class="lel-item-label">가스ID</div>
                <div class="lel-item-value">${lelData.gasId}</div>
            </div>
        </div>
        
        ${
          alarmMessage
            ? `
            <div class="alarm-message">
                ${alarmMessage}
            </div>
        `
            : ""
        }
    `;

  return card;
}

// 복합가스센서 카드 생성
function createSensorGroupCard(sensorId, sensor) {
  const gasData = sensorGroups.get(sensorId) || {
    CO: "--",
    O2: "--",
    H2S: "--",
    CO2: "--",
  };
  const alarmMessage = sensorGroupAlarms.get(sensorId) || "";

  // 전체 센서 상태 계산
  let hasError = false;
  let hasWarning = false;

  ["CO", "O2", "H2S", "CO2"].forEach((gasType) => {
    const status = calculateSensorGasStatus(
      sensorId,
      gasType,
      gasData[gasType]
    );
    if (status === SensorStatus.DANGER) {
      hasError = true;
    } else if (status === SensorStatus.WARNING) {
      hasWarning = true;
    }
  });

  const groupStatus = hasError
    ? SensorStatus.DANGER
    : hasWarning
    ? SensorStatus.WARNING
    : SensorStatus.NORMAL;
  const groupStatusColor = hasError
    ? "#e74c3c"
    : hasWarning
    ? "#f39c12"
    : "#27ae60";
  const groupStatusText = hasError ? "위험" : hasWarning ? "경고" : "정상";

  const card = document.createElement("div");
  card.className = `sensor-card status-${groupStatus}`;
  card.innerHTML = `
        <div class="sensor-header">
            <h3 class="sensor-title">
                ${sensor.displayName}
            </h3>
            <div class="sensor-actions">
                <button class="btn btn-secondary" onclick="openThresholdModal('${sensorId}', 'composite')">
                    
                </button>
            </div>
        </div>
        
        <div class="sensor-status status-${groupStatus}">
            <span>${groupStatusText}</span>
        </div>
        
        <div class="gas-grid">
            ${createGasCard(sensorId, "CO", gasData.CO)}
            ${createGasCard(sensorId, "O2", gasData.O2)}
            ${createGasCard(sensorId, "H2S", gasData.H2S)}
            ${createGasCard(sensorId, "CO2", gasData.CO2)}
        </div>
        
        ${
          alarmMessage
            ? `
            <div class="alarm-message">
                ${alarmMessage}
            </div>
        `
            : ""
        }
    `;

  return card;
}

// 가스 카드 생성
function createGasCard(sensorId, gasType, gasValue) {
  const threshold = getSensorThreshold(sensorId, gasType);
  const status = calculateSensorGasStatus(sensorId, gasType, gasValue);

  let cardColor;
  switch (status) {
    case SensorStatus.NORMAL:
      cardColor = "#27ae60";
      break;
    case SensorStatus.WARNING:
      cardColor = "#f39c12";
      break;
    case SensorStatus.DANGER:
      cardColor = "#e74c3c";
      break;
    default:
      cardColor = "#95a5a6";
  }

  const displayText = formatGasName(gasType);
  const unit = threshold?.unit || "";
  const normalRangeText = getNormalRangeText(gasType, threshold);

  return `
        <div class="gas-card status-${status}">
            <div class="gas-name">${displayText}</div>
            <div class="gas-value status-${status}" style="color: ${cardColor}">
                ${gasValue}
            </div>
            <div class="gas-unit">${unit}</div>
            <div class="gas-range">${normalRangeText}</div>
        </div>
    `;
}

// 센서별 임계치 가져오기
function getSensorThreshold(sensorId, gasType) {
  const sensorThreshold = sensorThresholds.get(sensorId)?.[gasType];
  const globalThreshold = GasThresholds.thresholds[gasType];
  return sensorThreshold || globalThreshold;
}

// 센서별 가스 상태 계산
function calculateSensorGasStatus(sensorId, gasType, gasValue) {
  const threshold = getSensorThreshold(sensorId, gasType);
  return calculateGasStatus(gasType, gasValue, threshold);
}

// 설정 관련 함수들
function openSettingsModal() {
  elements.serverIpInput.value = serverIp;
  elements.serverPortInput.value = serverPort;
  updateUrlDisplay();
  updateSensorList();
  elements.settingsModal.style.display = "block";
}

function closeSettingsModal() {
  elements.settingsModal.style.display = "none";
}

function updateUrlDisplay() {
  const ip = elements.serverIpInput.value;
  const port = elements.serverPortInput.value;
  elements.apiUrl.textContent = `http://${ip}:${port}/api/sensor/mappings`;
  elements.wsUrl.textContent = `ws://${ip}:${port}/ws/sensor`;
}

function updateSensorList() {
  elements.sensorCount.textContent = sensors.length;

  if (sensors.length === 0) {
    elements.sensorList.innerHTML = `
            <div class="no-sensors">
                <p>등록된 센서가 없습니다</p>
            </div>
        `;
  } else {
    elements.sensorList.innerHTML = sensors
      .map(
        (sensor) => `
            <div class="sensor-item">
                <div class="sensor-info">
                    <div class="sensor-name">${sensor.displayName}</div>
                    <div class="sensor-details">Serial: ${sensor.serialNumber}</div>
                    <div class="sensor-topic">${sensor.topicPath}</div>
                </div>
            </div>
        `
      )
      .join("");
  }
}

function saveSettings() {
  const newIp = elements.serverIpInput.value.trim();
  const newPort = elements.serverPortInput.value.trim();

  if (newIp !== serverIp || newPort !== serverPort) {
    serverIp = newIp;
    serverPort = newPort;

    // 기존 연결 종료
    wsClient.disconnect();

    // 데이터 초기화
    sensorGroups.clear();
    lelSensors.clear();
    sensorGroupAlarms.clear();

    // 새 설정으로 센서 로딩
    loadSensors();
  }

  closeSettingsModal();
}

// 임계치 설정 관련 함수들
function openThresholdModal(sensorId, sensorType) {
  currentThresholdSensorId = sensorId;
  currentThresholdSensorType = sensorType;

  const content = document.getElementById("thresholdContent");
  content.innerHTML = "";

  let gasTypes = [];
  if (sensorType === "composite") {
    gasTypes = ["CO", "O2", "H2S", "CO2"];
  } else if (sensorType === "lel") {
    gasTypes = ["LEL"];
  }

  gasTypes.forEach((gasType) => {
    const section = createThresholdSection(sensorId, gasType);
    content.appendChild(section);
  });

  elements.thresholdModal.style.display = "block";
}

function closeThresholdModal() {
  elements.thresholdModal.style.display = "none";
  currentThresholdSensorId = null;
  currentThresholdSensorType = null;
}

function createThresholdSection(sensorId, gasType) {
  const threshold = getSensorThreshold(sensorId, gasType);
  const unit = threshold?.unit || "";

  const section = document.createElement("div");
  section.className = "threshold-section";
  section.innerHTML = `
        <h4>
            <i class="${threshold?.icon || "fas fa-cog"}"></i>
            ${formatGasName(gasType)} 임계치 설정
        </h4>
        <div class="threshold-grid">
            <div class="threshold-field">
                <label>정상 최소값 (${unit})</label>
                <input type="number" id="normal_min_${gasType}" value="${
    threshold?.normal_min || 0
  }" step="0.1">
            </div>
            <div class="threshold-field">
                <label>정상 최대값 (${unit})</label>
                <input type="number" id="normal_max_${gasType}" value="${
    threshold?.normal_max || 100
  }" step="0.1">
            </div>
            <div class="threshold-field">
                <label>경고 최소값 (${unit})</label>
                <input type="number" id="warning_min_${gasType}" value="${
    threshold?.warning_min || 0
  }" step="0.1">
            </div>
            <div class="threshold-field">
                <label>경고 최대값 (${unit})</label>
                <input type="number" id="warning_max_${gasType}" value="${
    threshold?.warning_max || 100
  }" step="0.1">
            </div>
            <div class="threshold-field">
                <label>위험 최소값 (${unit})</label>
                <input type="number" id="danger_min_${gasType}" value="${
    threshold?.danger_min || 0
  }" step="0.1">
            </div>
        </div>
    `;

  return section;
}

function saveThresholds() {
  if (!currentThresholdSensorId || !currentThresholdSensorType) return;

  let gasTypes = [];
  if (currentThresholdSensorType === "composite") {
    gasTypes = ["CO", "O2", "H2S", "CO2"];
  } else if (currentThresholdSensorType === "lel") {
    gasTypes = ["LEL"];
  }

  // 센서별 임계치 저장
  if (!sensorThresholds.has(currentThresholdSensorId)) {
    sensorThresholds.set(currentThresholdSensorId, {});
  }

  const sensorThreshold = sensorThresholds.get(currentThresholdSensorId);

  gasTypes.forEach((gasType) => {
    const normalMin = parseFloat(
      document.getElementById(`normal_min_${gasType}`).value
    );
    const normalMax = parseFloat(
      document.getElementById(`normal_max_${gasType}`).value
    );
    const warningMin = parseFloat(
      document.getElementById(`warning_min_${gasType}`).value
    );
    const warningMax = parseFloat(
      document.getElementById(`warning_max_${gasType}`).value
    );
    const dangerMin = parseFloat(
      document.getElementById(`danger_min_${gasType}`).value
    );

    const threshold = getSensorThreshold(currentThresholdSensorId, gasType);

    sensorThreshold[gasType] = {
      ...threshold,
      normal_min: normalMin,
      normal_max: normalMax,
      warning_min: warningMin,
      warning_max: warningMax,
      danger_min: dangerMin,
    };
  });

  console.log(`센서 ${currentThresholdSensorId}의 임계치 저장 완료`);

  // UI 업데이트
  renderSensorCards();
  closeThresholdModal();
}

// 수동 재연결
function manualReconnect() {
  console.log("수동 재연결 시도");
  wsClient.disconnect();

  // 데이터 초기화
  sensorGroups.clear();
  lelSensors.clear();
  sensorGroupAlarms.clear();

  // 센서 정보부터 다시 로딩
  loadSensors();
}

// 유틸리티 함수들
function logMessage(message, name = "GasMonitoring") {
  const timestamp = new Date().toLocaleTimeString();
  const logLine = `[${timestamp}] [${name}] ${message}`;
  console.log(logLine);
}
