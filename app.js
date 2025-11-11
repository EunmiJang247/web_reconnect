// 전역 변수
let sensors = [];
let sensorGroups = new Map(); // 복합가스센서용
let lelSensors = new Map(); // LEL센서용
let sensorGroupAlarms = new Map();
let sensorThresholds = new Map(); // 센서별 개별 임계치
let sensorCustomNames = new Map(); // 센서별 사용자 지정 이름 (시리얼번호 -> 이름)
let serverIp = "localhost";
let serverPort = "8081";
let isLoadingSensors = false;
let currentThresholdSensorId = null;
let currentThresholdSensorType = null;
let lampOn = false;
let alertPorts = []; // 경광등 포트 목록
let isAlarmMasterEnabled = true; // 알람 마스터 스위치 상태 (기본값: ON)
let isManuallyDisabled = false; // 수동으로 알람을 끈 상태인지 확인

// 전역 변수에 추가
let reconnectAttempts = 0;
let maxReconnectAttempts = 5;
let reconnectInterval = 5000; // 5초
let reconnectTimer = null;
let sensorHealthCheck = new Map(); // 센서별 마지막 수신 시간
let healthCheckInterval = null;
let sensorListUpdateInterval = null;

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
  loadSensorCustomNames(); // 로컬스토리지에 저장된 센서 이름 로드
  initializeElements(); // DOM 요소 초기화
  setupEventListeners(); // 이벤트 리스너 설정
  setupWebSocketCallbacks(); // WebSocket 이벤트 콜백 설정(연결/끊김/에러/메시지)
  loadAlarmMasterSetting(); // 알람 마스터 설정 로드
  loadAlertList(); // 경광등 리스트 로드
  loadSensors();
});

// 센서 사용자 지정 이름 관리 함수들
function loadSensorCustomNames() {
  try {
    const savedNames = localStorage.getItem("sensorCustomNames");
    if (savedNames) {
      const namesObj = JSON.parse(savedNames);
      sensorCustomNames = new Map(Object.entries(namesObj));
      console.log("저장된 센서 이름 로드:", sensorCustomNames);
    }
  } catch (error) {
    console.error("센서 이름 로드 실패:", error);
    sensorCustomNames = new Map();
  }
}

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

function saveSensorCustomNames() {
  try {
    const namesObj = Object.fromEntries(sensorCustomNames);
    localStorage.setItem("sensorCustomNames", JSON.stringify(namesObj));
    console.log("센서 이름 저장 완료:", namesObj);
  } catch (error) {
    console.error("센서 이름 저장 실패:", error);
  }
}

function generateSensorName(serialNumber, existingCount) {
  // 이미 저장된 이름이 있으면 사용
  if (sensorCustomNames.has(serialNumber)) {
    return sensorCustomNames.get(serialNumber);
  }

  // 새로운 센서면 자동 이름 생성
  const newName = `센서${existingCount + 1}`;
  sensorCustomNames.set(serialNumber, newName);
  saveSensorCustomNames();
  return newName;
}

function updateSensorCustomName(serialNumber, newName) {
  sensorCustomNames.set(serialNumber, newName);
  saveSensorCustomNames();

  // 해당 센서 찾아서 displayName 업데이트
  const sensor = sensors.find((s) => s.serialNumber === serialNumber);
  if (sensor) {
    sensor.customName = newName;
    renderSensorCards(); // UI 다시 렌더링
  }
}

// WebSocket 이벤트 콜백 설정(연결/끊김/에러/메시지)
function setupWebSocketCallbacks() {
  // 연결 성공
  wsClient.onConnect = function () {
    updateConnectionStatusWithSensorCount();
    // 연결 상태 업데이트

    subscribeToAllSensors();
    // 모든 센서 구독

    reconnectAttempts = 0;
    clearTimeout(reconnectTimer);
    // 재연결 성공 시 카운터 리셋

    startSensorHealthCheck();
    // 센서 헬스 체크 시작

    startSensorListMonitoring();
    // sensor/mappings 가져와서 센서 목록 주기적 업데이트 시작
  };

  // 연결 끊김
  wsClient.onDisconnect = function () {
    updateConnectionStatus("disconnected", "연결 끊어짐");

    // 헬스 체크 중지
    stopSensorHealthCheck();

    // 센서 목록 모니터링 중지
    stopSensorListMonitoring();

    // 자동 재연결 시도
    attemptReconnect();
  };

  // 에러 발생
  wsClient.onError = function (error) {
    updateConnectionStatus(
      "disconnected",
      `서버가 끊겼습니다! mapping정보 가져오기 에러: ${error.message || error}`
    );

    // 헬스 체크 중지
    stopSensorHealthCheck();

    // 센서 목록 모니터링 중지
    stopSensorListMonitoring();

    // 자동 재연결 시도
    attemptReconnect();
  };
}

// 모든 센서 구독
function subscribeToAllSensors() {
  console.log("=== 센서 구독 시작 ===");
  sensors.forEach((sensor, index) => {
    wsClient.subscribe(sensor.topicPath, (body) => {
      updateSensor(index, body); // ← 데이터 수신 시 호출
      updateSensorHealth(sensor.topicPath); // 헬스체크 추가
    });
  });
  console.log("=== 웹소켓 구독 완료 ===");
}
// 센서 데이터 업데이트
// 센서 데이터 업데이트
function updateSensor(sensorIndex, body) {
  if (!body || body.trim() === "" || sensorIndex >= sensors.length) return;

  const now = new Date();
  const nowStr = now.toLocaleTimeString();
  const sensor = sensors[sensorIndex];
  const sensorId = `${sensor.modelName}_${sensor.portName}`;

  updateSensorHealth(sensor.topicPath);
  try {
    // JSON 파싱
    const data = JSON.parse(body);

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
      console.log("LEL 센서 데이터:", lelData);

      // 🔥 LEL 센서의 실제 농도값 기반 알람 메시지 생성
      const lelValue = lelData.lel;
      if (lelValue !== "--") {
        const lelStatus = calculateSensorGasStatus(sensorId, "LEL", lelValue);
        if (lelStatus === "danger") {
          const customAlarm = `DANGER: LEL 위험 농도 감지 (${lelValue}%)`;
          sensorGroupAlarms.set(sensorId, customAlarm);
        } else if (lelStatus === "warning") {
          const customAlarm = `WARNING: LEL 경고 농도 감지 (${lelValue}%)`;
          sensorGroupAlarms.set(sensorId, customAlarm);
        } else {
          sensorGroupAlarms.delete(sensorId); // 정상 시 알람 제거
        }
      }

      console.log("----------------------------");
    } else {
      // 복합가스센서 데이터 처리 - 새로운 구조에 맞게 수정
      const gasData = {
        CO: data.co || data.CO || "--", // 소문자 우선, 대문자 fallback
        O2: data.o2 || data.O2 || "--",
        H2S: data.h2s || data.H2S || "--",
        CO2: data.co2 || data.CO2 || "--",
      };
      sensorGroups.set(sensorId, gasData);
      console.log("복합가스센서 데이터:", gasData);

      // 🔥 각 가스의 실제 농도값 기반 알람 메시지 생성
      let dangerGases = [];
      let warningGases = [];

      ["CO", "O2", "H2S", "CO2"].forEach((gasType) => {
        const gasValue = gasData[gasType];
        if (gasValue !== "--") {
          const gasStatus = calculateSensorGasStatus(
            sensorId,
            gasType,
            gasValue
          );
          if (gasStatus === "danger") {
            dangerGases.push(
              `${formatGasName(gasType)} 위험 (${gasValue}${
                getSensorThreshold(sensorId, gasType)?.unit || ""
              })`
            );
          } else if (gasStatus === "warning") {
            warningGases.push(
              `${formatGasName(gasType)} 경고 (${gasValue}${
                getSensorThreshold(sensorId, gasType)?.unit || ""
              })`
            );
          }
        }
      });

      // 위험이 우선, 그 다음 경고
      if (dangerGases.length > 0) {
        const customAlarm = `DANGER: ${dangerGases.join(", ")}`;
        sensorGroupAlarms.set(sensorId, customAlarm);
      } else if (warningGases.length > 0) {
        const customAlarm = `WARNING: ${warningGases.join(", ")}`;
        sensorGroupAlarms.set(sensorId, customAlarm);
      } else {
        sensorGroupAlarms.delete(sensorId); // 정상 시 알람 제거
      }
    }

    // 🔥 서버에서 온 알람 메시지는 참고용으로만 사용 (실제 농도값 기반 판단이 우선)
    let serverAlarmMessage = "";
    if (data.alarmResult) {
      const alarmResult = data.alarmResult;
      if (alarmResult.alarmLevel && alarmResult.alarmLevel !== "NORMAL") {
        serverAlarmMessage = `${alarmResult.alarmLevel}`;
        if (alarmResult.messages && alarmResult.messages.length > 0) {
          serverAlarmMessage += `: ${alarmResult.messages.join(", ")}`;
        }
        console.log("서버 알람 메시지 (참고용):", serverAlarmMessage);
      }
    } else if (data.alarm && data.alarm.trim() !== "") {
      // 기존 alarm 필드도 지원
      serverAlarmMessage = data.alarm;
      console.log("서버 알람 메시지 (참고용):", serverAlarmMessage);
    }

    // 마지막 업데이트 시간 갱신
    elements.lastUpdateTime.textContent = nowStr;

    // 현재 설정된 알람 메시지 로그 출력
    const currentAlarm = sensorGroupAlarms.get(sensorId);
    if (currentAlarm) {
      console.log("🚨 사용자 설정 기반 알람:", currentAlarm);
    }

    // 웹소켓에서 데이터를 받은 후 UI 업데이트 호출
    renderSensorCards();
  } catch (error) {
    console.error("데이터 파싱 실패:", error);
    console.error("원본 데이터:", body);
  }
}

// 자동 재연결 함수
function attemptReconnect() {
  if (reconnectAttempts >= maxReconnectAttempts) {
    updateConnectionStatus(
      "disconnected",
      `재연결 실패 (${maxReconnectAttempts}회 시도)`
    );
    console.error(
      `최대 재연결 시도 횟수(${maxReconnectAttempts})에 도달했습니다.`
    );
    return;
  }

  reconnectAttempts++;
  const waitTime = reconnectInterval * reconnectAttempts; // 지수 백오프

  updateConnectionStatus(
    "loading",
    `재연결 시도 중... (${reconnectAttempts}/${maxReconnectAttempts})`
  );

  console.log(
    `${
      waitTime / 1000
    }초 후 재연결 시도 (${reconnectAttempts}/${maxReconnectAttempts})`
  );

  reconnectTimer = setTimeout(() => {
    console.log(`재연결 시도 ${reconnectAttempts}회차 시작`);

    // 완전히 처음부터 다시 시작
    resetAndReloadSensors();
  }, waitTime);
}

// 센서 헬스 체크 시작
function startSensorHealthCheck() {
  // 기존 타이머 정리
  stopSensorHealthCheck();

  // 모든 센서의 마지막 수신 시간 초기화
  sensors.forEach((sensor) => {
    const sensorId = `${sensor.modelName}_${sensor.portName}`;
    sensorHealthCheck.set(sensorId, Date.now());
  });

  // 30초마다 헬스 체크
  healthCheckInterval = setInterval(checkSensorHealth, 30000);
  console.log("센서 헬스 체크 시작 (30초 간격)");
}

// 센서 헬스 체크 중지
function stopSensorHealthCheck() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
    console.log("센서 헬스 체크 중지");
  }
}

// 센서 헬스 상태 업데이트
function updateSensorHealth(destination) {
  const sensor = sensors.find((s) => s.topicPath === destination);
  if (sensor) {
    const sensorId = `${sensor.modelName}_${sensor.portName}`;
    sensorHealthCheck.set(sensorId, Date.now());
  }
}

// 센서 헬스 체크 실행
function checkSensorHealth() {
  console.log("🔍 센서 헬스 체크 시작...");

  const now = Date.now();
  const timeoutThreshold = 60000; // 60초 타임아웃
  let unhealthySensors = [];
  let activeSensors = 0;

  for (const [sensorId, lastSeen] of sensorHealthCheck.entries()) {
    activeSensors++;
    const timeSinceLastSeen = now - lastSeen;

    if (timeSinceLastSeen > timeoutThreshold) {
      const sensor = sensors.find(
        (s) => `${s.modelName}_${s.portName}` === sensorId
      );
      if (sensor) {
        unhealthySensors.push({
          id: sensorId,
          name: sensor.displayName,
          lastSeen: Math.floor(timeSinceLastSeen / 1000),
        });
      }
    }
  }

  console.log(
    `📊 헬스 체크 결과: ${activeSensors}개 센서 중 ${unhealthySensors.length}개 응답 없음`
  );

  if (unhealthySensors.length > 0) {
    console.warn("❌ 응답하지 않는 센서들:");
    unhealthySensors.forEach((sensor) => {
      console.warn(
        `  - ${sensor.name} (${sensor.id}): ${sensor.lastSeen}초 전 마지막 수신`
      );
    });

    // 센서가 없거나 활성 센서의 30% 미만만 동작하면 완전 리셋
    if (
      activeSensors === 0 ||
      (activeSensors > 0 && unhealthySensors.length >= activeSensors * 0.7)
    ) {
      console.error(
        "🚨 대부분의 센서가 응답하지 않음. 전체 시스템 리셋 시작..."
      );
      resetAndReloadSensors();
      return;
    }

    // 전체 센서의 50% 이상이 응답하지 않으면 재연결만 시도
    if (unhealthySensors.length >= activeSensors * 0.5) {
      console.warn("⚠️ 다수의 센서가 응답하지 않음. WebSocket 재연결 시도...");
      wsClient.disconnect();
    }
  } else {
    console.log("✅ 모든 센서가 정상 응답 중");
  }
}

// 센서 목록 주기적 모니터링 시작
function startSensorListMonitoring() {
  // 기존 타이머 정리
  stopSensorListMonitoring();

  // 60초마다 센서 목록 다시 확인
  sensorListUpdateInterval = setInterval(async () => {
    console.log("🔄 센서 목록 업데이트 확인 중...");

    try {
      const response = await fetch(
        `http://${serverIp}:${serverPort}/api/sensor/mappings`
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const responseData = await response.json();

      // 응답 구조 확인 및 데이터 추출
      let newSensorData = [];
      if (responseData.data && responseData.data.sensors) {
        newSensorData = responseData.data.sensors;
      } else if (Array.isArray(responseData.data)) {
        newSensorData = responseData.data;
      } else if (Array.isArray(responseData)) {
        newSensorData = responseData;
      } else {
        throw new Error("예상하지 못한 응답 형식입니다.");
      }

      // 에러 센서 제외
      const validSensorData = newSensorData.filter((item) => {
        return (
          !item.modelName || !item.modelName.toLowerCase().includes("error")
        );
      });

      const newSensors = validSensorData.map((item, index) => {
        const sensor = SensorInfo.fromJson(item);
        // 사용자 지정 이름 생성 및 할당 (기존 이름 우선 적용)
        sensor.customName = generateSensorName(
          sensor.serialNumber,
          sensors.length + index
        );
        return sensor;
      });

      // 기존 센서와 비교
      if (hasSensorListChanged(sensors, newSensors)) {
        console.log(
          `📊 센서 목록 변경 감지: ${sensors.length} → ${newSensors.length}`
        );

        // 제거된 센서들 정리
        cleanupRemovedSensors(sensors, newSensors);

        // 센서 목록 업데이트
        const oldSensorCount = sensors.length;
        sensors = newSensors;

        // 새로운 센서들 구독
        subscribeToAllSensors();

        // 헬스체크 맵 업데이트
        updateHealthCheckForNewSensors();

        // UI 업데이트
        updateTotalSensorsCount();
        renderSensorCards();

        // 연결 상태 메시지 업데이트
        updateConnectionStatusWithSensorCount();

        console.log(
          `센서 목록 업데이트 완료: ${oldSensorCount} → ${sensors.length}개`
        );

        // 센서가 모두 제거된 경우
        if (sensors.length === 0) {
          console.warn("⚠️ 모든 센서가 제거되었습니다.");
          showNoSensorsState();
        }
      }
    } catch (error) {
      console.warn("센서 목록 업데이트 실패:", error.message);
    }
  }, 60000);
  // 60초마다 센서 목록 업데이트 확인(뽑히는 센서를 감지하기 위함)
}

// 센서 목록 모니터링 중지
function stopSensorListMonitoring() {
  if (sensorListUpdateInterval) {
    clearInterval(sensorListUpdateInterval);
    sensorListUpdateInterval = null;
    console.log("센서 목록 모니터링 중지");
  }
}

// 센서 목록 변경 확인
function hasSensorListChanged(oldSensors, newSensors) {
  if (oldSensors.length !== newSensors.length) {
    return true;
  }

  // 각 센서의 ID로 비교
  const oldSensorIds = new Set(
    oldSensors.map((s) => `${s.modelName}_${s.portName}`)
  );
  const newSensorIds = new Set(
    newSensors.map((s) => `${s.modelName}_${s.portName}`)
  );

  // 제거된 센서 확인
  for (const oldId of oldSensorIds) {
    if (!newSensorIds.has(oldId)) {
      return true;
    }
  }

  // 추가된 센서 확인
  for (const newId of newSensorIds) {
    if (!oldSensorIds.has(newId)) {
      return true;
    }
  }

  return false;
}

// 새로운 센서 목록에 맞게 헬스체크 업데이트
function updateHealthCheckForNewSensors() {
  const currentTime = Date.now();
  const newHealthCheck = new Map();

  // 새로운 센서들에 대해서만 헬스체크 설정
  sensors.forEach((sensor) => {
    const sensorId = `${sensor.modelName}_${sensor.portName}`;
    // 기존 헬스체크 데이터가 있으면 유지, 없으면 현재 시간으로 설정
    const lastSeen = sensorHealthCheck.get(sensorId) || currentTime;
    newHealthCheck.set(sensorId, lastSeen);
  });

  sensorHealthCheck = newHealthCheck;
  console.log(`헬스체크 업데이트 완료: ${sensorHealthCheck.size}개 센서`);
}

// 제거된 센서들 정리
function cleanupRemovedSensors(oldSensors, newSensors) {
  const newSensorIds = new Set(
    newSensors.map((s) => `${s.modelName}_${s.portName}`)
  );

  oldSensors.forEach((oldSensor) => {
    const oldSensorId = `${oldSensor.modelName}_${oldSensor.portName}`;

    if (!newSensorIds.has(oldSensorId)) {
      console.log(`센서 제거됨: ${oldSensorId} (${oldSensor.displayName})`);

      // 구독 해제
      if (wsClient.isConnected()) {
        wsClient.unsubscribe(oldSensor.topicPath);
      }

      // 모든 관련 데이터 완전히 제거
      sensorGroups.delete(oldSensorId);
      lelSensors.delete(oldSensorId);
      sensorGroupAlarms.delete(oldSensorId);
      sensorHealthCheck.delete(oldSensorId);
      sensorThresholds.delete(oldSensorId);

      console.log(`센서 ${oldSensorId} 데이터 완전 정리 완료`);
    }
  });
}

// 센서 목록 리셋 및 다시 로딩
function resetAndReloadSensors() {
  console.log("=========================");
  console.log("전체 시스템 리셋 시작");
  console.log("=========================");

  // 기존 연결 및 타이머 정리
  wsClient.disconnect();
  stopSensorHealthCheck();
  stopSensorListMonitoring();
  clearTimeout(reconnectTimer);

  // 모든 센서 관련 데이터 초기화 (사용자 지정 이름은 보존)
  sensors = [];
  sensorGroups.clear();
  lelSensors.clear();
  sensorGroupAlarms.clear();
  sensorHealthCheck.clear();
  sensorThresholds.clear();
  reconnectAttempts = 0;

  // 사용자 지정 이름은 보존 (sensorCustomNames는 초기화하지 않음)
  console.log(
    "사용자 지정 센서 이름 보존:",
    Object.fromEntries(sensorCustomNames)
  );

  // UI 상태 초기화
  updateTotalSensorsCount();
  showLoadingState();

  // 3초 후 센서 목록 다시 로딩
  setTimeout(() => {
    console.log("센서 목록 재로딩 시작...");
    loadSensors();
  }, 3000);
}

// 센서가 없을 때 상태 표시
function showNoSensorsState() {
  const grid = elements.sensorGrid;
  grid.innerHTML = `
    <div class="no-sensors-container">
      <div class="no-sensors-content">
        <i class="fas fa-exclamation-triangle" style="color: #e74c3c; font-size: 3rem; margin-bottom: 1rem;"></i>
        <h3>연결된 센서가 없습니다</h3>
        <p>센서 연결을 확인하거나 설정을 다시 확인해주세요.</p>
        <div class="no-sensors-actions">
          <button class="btn btn-primary" onclick="resetAndReloadSensors()">
            재연결 시도
          </button>
          <button class="btn btn-secondary" onclick="openSettingsModal()">
            설정 확인
          </button>
        </div>
      </div>
    </div>
  `;

  // 출입 상태를 위험으로 설정
  updateAccessStatusForNoSensors();
  updateSystemStatusBannerForNoSensors();
}

// 센서가 없을 때 출입 상태 업데이트
function updateAccessStatusForNoSensors() {
  const existingStatus = document.querySelector(".access-status");
  if (existingStatus) {
    existingStatus.remove();
  }

  const accessStatusEl = document.createElement("div");
  accessStatusEl.className = "access-status danger";
  accessStatusEl.innerHTML = `
    <i class="fas fa-ban"></i>
    센서 연결 없음 - 출입 불가!
  `;

  document.body.appendChild(accessStatusEl);
}

// 센서가 없을 때 시스템 상태 배너 업데이트
function updateSystemStatusBannerForNoSensors() {
  const existingBanner = document.querySelector(".system-status-card");
  if (existingBanner) {
    existingBanner.remove();
  }

  const bannerEl = document.createElement("div");
  bannerEl.className = "system-status-card danger";
  bannerEl.innerHTML = `
    <div class="system-status-title danger">
      <i class="fas fa-exclamation-triangle"></i>
      <span>시스템 오류</span>
    </div>
    <div class="system-status-message">
      연결된 센서가 없습니다.
    </div>
    <div class="system-status-details">
      가스 모니터링이 불가능한 상태입니다.
    </div>
  `;

  const mainContent = document.querySelector(".main-content");
  if (mainContent) {
    mainContent.insertBefore(bannerEl, mainContent.firstChild);
  }
}

// 수동 재연결 함수 수정
function manualReconnect() {
  console.log("수동 재연결 시도");

  // 모든 타이머 정리
  clearTimeout(reconnectTimer);
  stopSensorHealthCheck();
  stopSensorListMonitoring();
  reconnectAttempts = 0;

  // 기존 연결 종료
  wsClient.disconnect();

  // 데이터 초기화
  sensorGroups.clear();
  lelSensors.clear();
  sensorGroupAlarms.clear();
  sensorHealthCheck.clear();

  // 센서 정보부터 다시 로딩
  loadSensors();
}

// 웹소켓에서 데이터를 받은 후 UI업데이트사항 랜더링
function renderSensorCards() {
  if (sensors.length === 0) {
    showNoSensorsState();
    return;
  }

  const grid = elements.sensorGrid;
  grid.innerHTML = "";

  // 센서를 이름순으로 정렬
  const sortedSensors = [...sensors].sort((a, b) => {
    const nameA = a.displayName.toLowerCase();
    const nameB = b.displayName.toLowerCase();
    return nameA.localeCompare(nameB);
  });

  sortedSensors.forEach((sensor) => {
    const sensorId = `${sensor.modelName}_${sensor.portName}`;
    let cardElement;

    if (sensor.gasType === "LEL") {
      cardElement = createLelSensorCard(sensorId, sensor);
    } else {
      cardElement = createSensorGroupCard(sensorId, sensor);
    }

    grid.appendChild(cardElement);
  });

  // 🔥 안전 상태 확인 및 배너 업데이트(임계치 넘으면 카드 변경줌)
  updateSystemStatusBanner();

  // 연결 상태 업데이트
  updateConnectionStatusWithSensorCount();
}

// 페이지 종료 시 정리
window.addEventListener("beforeunload", function () {
  stopSensorHealthCheck();
  stopSensorListMonitoring();
  clearTimeout(reconnectTimer);
  wsClient.disconnect();
});

// 연결 상태 업데이트
function updateConnectionStatus(status, message) {
  const statusElement = elements.connectionStatus;
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
}

// 연결된 센서 개수로 상태 메시지 업데이트
function updateConnectionStatusWithSensorCount() {
  if (wsClient && wsClient.isConnected()) {
    updateConnectionStatus("connected", `${sensors.length}개 센서 연결됨`);
  }
}

// 센서 정보 로딩
async function loadSensors() {
  if (isLoadingSensors) {
    return;
  }

  isLoadingSensors = true;
  showLoadingState();
  updateConnectionStatus("loading", "센서 정보 로딩중...");

  try {
    const apiUrl = `http://${serverIp}:${serverPort}/api/sensor/mappings`;
    console.log("=== 센서 정보 로딩 시작 ===");
    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

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
      sensors = validSensorData.map((item, index) => {
        const sensor = SensorInfo.fromJson(item);
        // 사용자 지정 이름 생성 및 할당
        sensor.customName = generateSensorName(sensor.serialNumber, index);
        return sensor;
      });
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
// 센서 카드 렌더링 수정
function renderSensorCards() {
  if (sensors.length === 0) {
    showNoSensorsState();
    return;
  }

  const grid = elements.sensorGrid;
  grid.innerHTML = "";

  // 센서를 이름순으로 정렬
  const sortedSensors = [...sensors].sort((a, b) => {
    const nameA = a.displayName.toLowerCase();
    const nameB = b.displayName.toLowerCase();
    return nameA.localeCompare(nameB);
  });

  // 최대 4개의 센서만 표시 (2행 2열)
  const maxSensors = 4;
  const sensorsToShow = sortedSensors.slice(0, maxSensors);

  sensorsToShow.forEach((sensor, index) => {
    const sensorId = `${sensor.modelName}_${sensor.portName}`;
    let cardElement;

    if (sensor.gasType === "LEL") {
      cardElement = createLelSensorCard(sensorId, sensor);
    } else {
      cardElement = createSensorGroupCard(sensorId, sensor);
    }

    grid.appendChild(cardElement);
  });

  // 출입 상태 및 시스템 상태 업데이트
  updateSystemStatusBanner();

  // 연결 상태 업데이트
  updateConnectionStatusWithSensorCount();
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
  const alarmLevel = getAlarmMessageLevel(alarmMessage);

  // LEL 값으로 상태 계산
  let lelValue = lelData.lel || "--";

  // 🔥 LEL 값이 100을 넘으면 100으로 제한
  if (lelValue !== "--") {
    const numericValue = parseFloat(lelValue);
    if (!isNaN(numericValue) && numericValue > 100) {
      lelValue = "100.0";
      console.warn(
        `⚠️ LEL 값이 100%를 초과하여 100%로 제한됨: 원본값 ${lelData.lel}% → 표시값 ${lelValue}%`
      );
    }
  }

  let status = calculateSensorGasStatus(sensorId, "LEL", lelValue);

  // 🔥 알람 메시지 레벨도 센서 카드 상태에 반영
  if (alarmLevel === "danger") {
    status = SensorStatus.DANGER; // 알람이 위험 레벨이면 전체 카드도 위험으로
  } else if (alarmLevel === "warning" && status === SensorStatus.NORMAL) {
    status = SensorStatus.WARNING; // 알람이 경고 레벨이고 현재 정상이면 경고로
  }

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
  card.className = `sensor-card status-${status}`;
  card.innerHTML = `
        <div class="sensor-header hover-reveal">
            <h3 class="sensor-title" ondblclick="editSensorName('${
              sensor.serialNumber
            }', this)">
                 ${sensor.displayName}
            </h3>
            <div class="sensor-actions">
                <button class="btn btn-secret" onclick="editSensorName('${
                  sensor.serialNumber
                }')">
                     이름 변경
                </button>
                <button class="btn btn-secret" onclick="openThresholdModal('${sensorId}', 'lel')">
                    <i class="fas fa-cog"></i> 임계치 설정
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
                <div class="lel-item-value">${lelData.gasId} ${getGasNameFromId(
    lelData.gasId
  )}</div>
            </div>
        </div>
        
        ${
          alarmMessage
            ? `
            <div class="alarm-message alarm-${alarmLevel}">
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
  const alarmLevel = getAlarmMessageLevel(alarmMessage);

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

  // 🔥 알람 메시지 레벨도 센서 카드 상태에 반영
  if (alarmLevel === "danger") {
    hasError = true; // 알람이 위험 레벨이면 전체 카드도 위험으로
  } else if (alarmLevel === "warning") {
    hasWarning = true; // 알람이 경고 레벨이면 전체 카드도 경고로
  }

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
        <div class="sensor-header hover-reveal">
            <h3 class="sensor-title" ondblclick="editSensorName('${
              sensor.serialNumber
            }', this)">
                ${sensor.displayName}
            </h3>
            <div class="sensor-actions">
                <button class="btn btn-secret" onclick="editSensorName('${
                  sensor.serialNumber
                }')">
                    이름 변경
                </button>
                <button class="btn btn-secret" onclick="openThresholdModal('${sensorId}', 'composite')">
                    임계치 설정
                </button>
            </div>
        </div>
        
        <div class="sensor-status space-below status-${groupStatus}">
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
            <div class="alarm-message alarm-${alarmLevel}">
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

// 가스 ID를 가스명으로 변환하는 함수
function getGasNameFromId(gasId) {
  const gasIdMap = {
    0: "(가스 없음)",
    1: "(수소)",
    2: "(수소 혼합)",
    3: "(메탄)",
    4: "(가벼운 가스)",
    5: "(중간 밀도 가스)",
    6: "(무거운 가스)",
    253: "(알 수 없는 가스)",
    254: "(측정 하한 미만)",
    255: "(측정 상한 초과)",
  };

  const numericGasId = parseInt(gasId);
  return gasIdMap[numericGasId] || `Unknown ID: ${gasId}`;
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

// 알람 메시지 레벨 결정 함수 (사용자 설정 임계값 우선 적용)
function getAlarmMessageLevel(alarmMessage) {
  if (!alarmMessage || alarmMessage.trim() === "") {
    return "normal";
  }

  // 🔥 1. 먼저 알람 메시지에서 농도값을 추출하여 사용자 설정 임계값과 비교
  const concentrationLevel = analyzeAlarmConcentration(alarmMessage);
  if (concentrationLevel !== "normal") {
    return concentrationLevel; // 농도 기반 판단이 우선
  }

  // 🔥 2. 농도값이 없을 때만 키워드로 판단
  const upperAlarmMessage = alarmMessage.toUpperCase();

  if (
    upperAlarmMessage.includes("DANGER") ||
    upperAlarmMessage.includes("CRITICAL") ||
    upperAlarmMessage.includes("HIGH") ||
    upperAlarmMessage.includes("위험") ||
    upperAlarmMessage.includes("ERROR")
  ) {
    return "danger";
  } else if (
    upperAlarmMessage.includes("WARNING") ||
    upperAlarmMessage.includes("WARN") ||
    upperAlarmMessage.includes("LOW") ||
    upperAlarmMessage.includes("경고") ||
    upperAlarmMessage.includes("주의")
  ) {
    return "warning";
  } else {
    // 레벨을 알 수 없는 경우 기본적으로 경고로 처리
    return "warning";
  }
}

// 🔥 알람 메시지에서 농도값을 분석하여 사용자 설정 임계값과 비교
function analyzeAlarmConcentration(alarmMessage) {
  if (!alarmMessage) return "normal";

  // PPM 농도값 추출 정규식 패턴들
  const ppmPatterns = [
    /(\d+(?:\.\d+)?)\s*ppm/i, // "2145.0 ppm" 또는 "2145 ppm"
    /농도.*?(\d+(?:\.\d+)?)/, // "농도 주의 (2145.0"
    /(\d+(?:\.\d+)?)\s*%/i, // 퍼센트 농도 "23.5%"
  ];

  let gasType = null;
  let concentration = null;

  // 가스 타입 식별
  if (alarmMessage.includes("CO₂") || alarmMessage.includes("CO2")) {
    gasType = "CO2";
  } else if (
    alarmMessage.includes("CO") &&
    !alarmMessage.includes("CO₂") &&
    !alarmMessage.includes("CO2")
  ) {
    gasType = "CO";
  } else if (alarmMessage.includes("H₂S") || alarmMessage.includes("H2S")) {
    gasType = "H2S";
  } else if (alarmMessage.includes("O₂") || alarmMessage.includes("O2")) {
    gasType = "O2";
  } else if (alarmMessage.includes("LEL")) {
    gasType = "LEL";
  }

  // 농도값 추출
  for (const pattern of ppmPatterns) {
    const match = alarmMessage.match(pattern);
    if (match) {
      concentration = parseFloat(match[1]);
      break;
    }
  }

  // 가스타입과 농도값이 모두 있을 때 기존 calculateGasStatus 함수 활용
  if (gasType && concentration !== null && !isNaN(concentration)) {
    const gasStatus = calculateGasStatus(gasType, concentration.toString());
    return gasStatus; // "normal", "warning", "danger", "error" 반환
  }

  return "normal"; // 농도값을 파싱할 수 없으면 키워드 판단으로 넘김
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
    // 센서를 이름순으로 정렬
    const sortedSensors = [...sensors].sort((a, b) => {
      const nameA = a.displayName.toLowerCase();
      const nameB = b.displayName.toLowerCase();
      return nameA.localeCompare(nameB);
    });

    elements.sensorList.innerHTML = sortedSensors
      .map(
        (sensor) => `
            <div class="sensor-item">
                <div class="sensor-info">
                    <div class="sensor-name">${sensor.displayName}</div>
                    <div class="sensor-details">Serial: ${sensor.serialNumber} | Model: ${sensor.modelName} (${sensor.portName})</div>
                    <div class="sensor-topic">${sensor.topicPath}</div>
                </div>
                <div class="sensor-actions">
                    <button class="btn btn-secondary btn-sm" onclick="editSensorName('${sensor.serialNumber}')">
                        이름 변경
                    </button>
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

// 출입 상태 관리 함수들
function checkOverallSafetyStatus() {
  let hasDanger = false;
  let hasWarning = false;
  let problemSensors = [];

  // 복합가스센서들 상태 확인
  for (const [sensorId, gasData] of sensorGroups.entries()) {
    const sensor = sensors.find(
      (s) => `${s.modelName}_${s.portName}` === sensorId
    );
    if (!sensor) continue;

    ["CO", "O2", "H2S", "CO2"].forEach((gasType) => {
      const status = calculateSensorGasStatus(
        sensorId,
        gasType,
        gasData[gasType]
      );
      if (status === SensorStatus.DANGER) {
        hasDanger = true;
        problemSensors.push(`${sensor.displayName} ${formatGasName(gasType)}`);
      } else if (status === SensorStatus.WARNING) {
        hasWarning = true;
      }
    });
  }

  // LEL센서들 상태 확인
  for (const [sensorId, lelData] of lelSensors.entries()) {
    const sensor = sensors.find(
      (s) => `${s.modelName}_${s.portName}` === sensorId
    );
    if (!sensor) continue;

    const status = calculateSensorGasStatus(sensorId, "LEL", lelData.lel);
    if (status === SensorStatus.DANGER) {
      hasDanger = true;
      problemSensors.push(`${sensor.displayName} LEL`);
    } else if (status === SensorStatus.WARNING) {
      hasWarning = true;
    }
  }

  // 알람이 있는 센서들 확인
  for (const [sensorId, alarmMessage] of sensorGroupAlarms.entries()) {
    if (alarmMessage && alarmMessage.trim() !== "") {
      const sensor = sensors.find(
        (s) => `${s.modelName}_${s.portName}` === sensorId
      );
      if (sensor) {
        // 알람 메시지의 레벨에 따라 구분 처리
        const upperAlarmMessage = alarmMessage.toUpperCase();
        if (
          upperAlarmMessage.includes("DANGER") ||
          upperAlarmMessage.includes("CRITICAL") ||
          upperAlarmMessage.includes("HIGH")
        ) {
          hasDanger = true;
          problemSensors.push(`${sensor.displayName} 알람`);
        } else if (
          upperAlarmMessage.includes("WARNING") ||
          upperAlarmMessage.includes("WARN") ||
          upperAlarmMessage.includes("LOW")
        ) {
          hasWarning = true;
        }
      }
    }
  }

  return {
    isDangerous: hasDanger,
    hasWarning: hasWarning,
    problemSensors: problemSensors,
  };
}

const handleDangerousState = () => {
  if (lampOn) return;

  // 알람 마스터 스위치가 OFF인 경우 알람을 울리지 않음
  if (!isAlarmMasterEnabled) {
    console.log(
      "⚠️ 전체 알람 시스템이 OFF 상태입니다. 설정에서 알람 스위치를 켜주세요."
    );
    return;
  }

  // 수동으로 비활성화된 경우 알람을 울리지 않음
  if (isManuallyDisabled) {
    console.log(
      "수동으로 알람이 비활성화된 상태입니다. 마스터 스위치를 다시 조작하거나 켜기 버튼을 눌러주세요."
    );
    return;
  }

  console.warn("위험 상태 감지됨! 즉시 조치가 필요합니다.");
  lampOn = true;

  // 알람 API 호출 (켜기)
  callAlertAPI(true);
}; // 안전 상태로 복귀할 때 호출할 함수 추가
const handleSafeState = () => {
  if (!lampOn) return;
  console.log("안전 상태로 복귀됨. 알람을 자동으로 끕니다.");
  lampOn = false;
  // 자동으로 끄는 경우에는 isManuallyDisabled를 변경하지 않음

  // 알람 API 호출 (끄기)
  callAlertAPI(false);
};

// 경광등 리스트 가져오기
async function loadAlertList() {
  try {
    const response = await fetch(`http://${serverIp}:${serverPort}/api/alert`);

    if (response.ok) {
      const result = await response.json();
      if (result.code === 200 && result.data && result.data.alerts) {
        alertPorts = result.data.alerts.map((alert) => alert.portName);
        console.log("🚨 경광등 포트 목록:", alertPorts);
        return alertPorts;
      } else {
        console.warn("경광등 리스트 응답 형식이 예상과 다름:", result);
        return [];
      }
    } else {
      console.error(
        "경광등 리스트 가져오기 실패:",
        response.status,
        response.statusText
      );
      return [];
    }
  } catch (error) {
    console.error("경광등 리스트 가져오기 중 오류 발생:", error);
    return [];
  }
}

// 알람 API 호출 함수 수정
async function callAlertAPI(turnOn, isManual = false) {
  // 먼저 경광등 리스트를 가져와서 포트 정보 확인
  if (alertPorts.length === 0) {
    console.log("경광등 포트 정보를 가져오는 중...");
    await loadAlertList();
  }

  if (alertPorts.length === 0) {
    console.log("사용 가능한 경광등 포트가 없어 알람 API 호출을 건너뜁니다.");
    return;
  }

  const endpoint = turnOn ? "on" : "off";
  const action = turnOn ? "켜기" : "끄기";
  const portNames = alertPorts.join(", ");

  try {
    const response = await fetch(
      `http://${serverIp}:${serverPort}/api/alert/${endpoint}?portNames=${encodeURIComponent(
        portNames
      )}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.ok) {
      console.log(`🚨 알람 ${action} API 호출 성공 (포트: ${portNames})`);

      // 수동 조작인 경우 상태 업데이트
      if (isManual) {
        if (turnOn) {
          lampOn = true;
          isManuallyDisabled = false;
          // 켤 때는 마스터 스위치도 자동으로 ON
          isAlarmMasterEnabled = true;
          const toggleElement = document.getElementById("beaconToggle");
          if (toggleElement) {
            toggleElement.checked = true;
          }
          localStorage.setItem("alarmMasterEnabled", "true");
          console.log(
            "✅ 수동으로 알람을 켰습니다. 전체 알람 시스템이 활성화되었습니다."
          );
        } else {
          lampOn = false;
          isManuallyDisabled = true;
          // 끌 때는 마스터 스위치도 자동으로 OFF
          isAlarmMasterEnabled = false;
          const toggleElement = document.getElementById("beaconToggle");
          if (toggleElement) {
            toggleElement.checked = false;
          }
          localStorage.setItem("alarmMasterEnabled", "false");
          console.log(
            "⛔ 수동으로 알람을 껐습니다. 전체 알람 시스템이 비활성화되었습니다."
          );
          // Alert 메시지 표시
          alert(
            "🚨 알람이 수동으로 꺼졌습니다!\n\n조치를 취한 후 설정에서 알람 스위치를 다시 켜주세요."
          );
        }
      }
    } else {
      console.error(
        `알람 ${action} API 호출 실패:`,
        response.status,
        response.statusText
      );
    }
  } catch (error) {
    console.error(`알람 ${action} API 호출 중 오류 발생:`, error);
  }
}

function updateSystemStatusBanner() {
  const safetyStatus = checkOverallSafetyStatus();

  // 기존 시스템 상태 배너 제거
  const existingBanner = document.querySelector(".system-status-card");
  if (existingBanner) {
    existingBanner.remove();
  }

  // 새로운 시스템 상태 배너 생성
  const bannerEl = document.createElement("div");
  bannerEl.className = "system-status-card";

  if (safetyStatus.isDangerous) {
    handleDangerousState();
    bannerEl.classList.add("danger");
    bannerEl.innerHTML = `
      <div class="system-status-title danger">
        <span>출입 불가</span>
      </div>
      <div class="system-status-message">
        센서 임계치를 초과했습니다! 즉시 조치가 필요합니다.
      </div>
      <div class="system-status-details">
        감지 코드 : ${safetyStatus.problemSensors.join(", ")}
      </div>
    `;
  } else if (safetyStatus.hasWarning) {
    bannerEl.classList.add("warning");
    bannerEl.innerHTML = `
      <div class="system-status-title" style="color: #ffffff;">
        <span>주의 필요</span>
      </div>
      <div class="system-status-message">
        경고 수치가 감지되었습니다. 주의하세요.
      </div>
    `;
  } else {
    // 안전 상태일 때 알람 끄기
    handleSafeState();
    bannerEl.classList.add("safe");
    bannerEl.innerHTML = `
      <div class="system-status-title safe">
        <span>출입 가능</span>
      </div>
      <div class="system-status-message">
        모든 센서가 정상 범위 내에 있습니다.
      </div>
    `;
  }

  // 메인 컨텐츠 상단에 추가
  const mainContent = document.querySelector(".main-content");
  if (mainContent) {
    mainContent.insertBefore(bannerEl, mainContent.firstChild);
  }
}

// 유틸리티 함수들
function logMessage(message, name = "GasMonitoring") {
  const timestamp = new Date().toLocaleTimeString();
  const logLine = `[${timestamp}] [${name}] ${message}`;
  console.log(logLine);
}

// 센서 이름 편집 함수
function editSensorName(serialNumber, titleElement = null) {
  const sensor = sensors.find((s) => s.serialNumber === serialNumber);
  if (!sensor) {
    console.error("센서를 찾을 수 없습니다:", serialNumber);
    return;
  }

  const currentName = sensor.displayName;
  const newName = prompt(`센서 이름을 입력하세요:`, currentName);

  if (newName && newName.trim() !== "" && newName !== currentName) {
    const trimmedName = newName.trim();
    updateSensorCustomName(serialNumber, trimmedName);

    // 즉시 UI 업데이트 (전체 렌더링 대신 해당 요소만)
    if (titleElement) {
      titleElement.textContent = trimmedName;
    }

    console.log(`센서 이름 변경: ${currentName} → ${trimmedName}`);
  }
}

// 알람 마스터 스위치 토글 함수
function toggleAlarmMaster(enabled) {
  isAlarmMasterEnabled = enabled;
  console.log(`🔔 알람 마스터 스위치: ${enabled ? "ON" : "OFF"}`);

  // 설정값 로컬 저장소에 저장
  localStorage.setItem("alarmMasterEnabled", enabled.toString());

  // 스위치 조작 시 수동 비활성화 상태 해제
  if (enabled) {
    isManuallyDisabled = false;
    console.log(
      "✅ 알람 시스템이 활성화되었습니다. 수동 비활성화 상태가 해제되고, 위험 감지 시 자동으로 알람이 울립니다."
    );
  } else {
    // 스위치가 OFF로 변경되고 현재 알람이 켜져있다면 즉시 끄기
    if (lampOn) {
      console.log(
        "알람 마스터 스위치가 OFF로 변경되어 현재 켜진 알람을 끕니다."
      );
      callAlertAPI(false);
      lampOn = false;
    }
    console.log(
      "❌ 알람 시스템이 비활성화되었습니다. 위험 감지되어도 알람이 울리지 않습니다."
    );
  }
}

// 알람 마스터 스위치 설정 로드
function loadAlarmMasterSetting() {
  try {
    const saved = localStorage.getItem("alarmMasterEnabled");
    if (saved !== null) {
      isAlarmMasterEnabled = saved === "true";
      console.log(
        `💾 저장된 알람 마스터 설정 로드: ${
          isAlarmMasterEnabled ? "ON" : "OFF"
        }`
      );
    } else {
      // 처음 실행시 기본값 설정
      isAlarmMasterEnabled = true; // 기본값: ON
      localStorage.setItem("alarmMasterEnabled", "true");
      console.log("🔧 알람 마스터 설정 초기화: ON (기본값)");
    }

    // 🔥 HTML 스위치 상태 동기화 (DOM이 로드된 후 실행)
    setTimeout(() => {
      const toggleElement = document.getElementById("beaconToggle");
      if (toggleElement) {
        toggleElement.checked = isAlarmMasterEnabled;
        console.log(
          `✅ HTML 토글 스위치 동기화: ${isAlarmMasterEnabled ? "ON" : "OFF"}`
        );

        // 🔥 이벤트 리스너도 추가 (만약 없다면)
        if (!toggleElement.hasAttribute("data-listener-added")) {
          toggleElement.addEventListener("change", function () {
            toggleAlarmMaster(this.checked);
          });
          toggleElement.setAttribute("data-listener-added", "true");
          console.log("🔗 토글 스위치 이벤트 리스너 추가됨");
        }
      } else {
        console.warn(
          "⚠️ beaconToggle 요소를 찾을 수 없습니다. HTML을 확인하세요."
        );
      }
    }, 100); // DOM 로딩 완료 후 실행
  } catch (error) {
    console.error("알람 마스터 설정 로드 중 오류:", error);
    // 오류 발생시 기본값으로 설정
    isAlarmMasterEnabled = true;
    localStorage.setItem("alarmMasterEnabled", "true");
  }
}
