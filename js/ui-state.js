// ========================================
// UI 상태 관리 (로딩, 에러, 연결 상태)
// ========================================

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

// 로딩 상태 표시
function showLoadingState() {
  elements.loadingContainer.style.display = "flex";
  elements.sensorGrid.style.display = "none";
  elements.errorContainer.style.display = "none";
}

// 센서 그리드 표시
function showSensorGrid() {
  elements.loadingContainer.style.display = "none";
  elements.sensorGrid.style.display = "grid";
  elements.errorContainer.style.display = "none";
}

// 에러 상태 표시
function showErrorState(message) {
  elements.loadingContainer.style.display = "none";
  elements.sensorGrid.style.display = "none";
  elements.errorContainer.style.display = "flex";
  elements.errorMessage.textContent = message;
}

// 연결 상태 업데이트
function updateConnectionStatus(status, message) {
  const statusElement = elements.connectionStatus;
  const statusText = statusElement.querySelector(".status-text");

  statusElement.classList.remove(
    "status-connected",
    "status-disconnected",
    "status-loading"
  );

  statusElement.classList.add(`status-${status}`);
  statusText.textContent = message;
}

// 연결된 센서 개수로 상태 메시지 업데이트
function updateConnectionStatusWithSensorCount() {
  if (wsClient && wsClient.isConnected()) {
    updateConnectionStatus("connected", `${sensors.length}개 센서 연결됨`);
  }
}

// 총 센서 개수 업데이트
function updateTotalSensorsCount() {
  elements.totalSensors.textContent = sensors.length;
}
