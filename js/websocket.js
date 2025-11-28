// ========================================
// WebSocket 관리 (연결, 구독, 재연결)
// ========================================

// WebSocket 이벤트 콜백 설정
function setupWebSocketCallbacks() {
  // 연결 성공
  wsClient.onConnect = function () {
    updateConnectionStatusWithSensorCount();
    subscribeToAllSensors();
    reconnectAttempts = 0;
    clearTimeout(reconnectTimer);
    startSensorHealthCheck();
    startSensorListMonitoring();
  };

  // 연결 끊김
  wsClient.onDisconnect = function () {
    updateConnectionStatus("disconnected", "연결 끊어짐");
    stopSensorHealthCheck();
    stopSensorListMonitoring();
    attemptReconnect();
  };

  // 에러 발생
  wsClient.onError = function (error) {
    updateConnectionStatus(
      "disconnected",
      `서버가 끊겼습니다! mapping정보 가져오기 에러: ${error.message || error}`
    );
    stopSensorHealthCheck();
    stopSensorListMonitoring();
    attemptReconnect();
  };
}

// 모든 센서 구독
function subscribeToAllSensors() {
  console.log("=== 센서 구독 시작 ===");
  sensors.forEach((sensor, index) => {
    wsClient.subscribe(sensor.topicPath, (body) => {
      updateSensor(index, body);
      updateSensorHealth(sensor.topicPath);
    });
  });
  console.log("=== 웹소켓 구독 완료 ===");
}

// WebSocket 연결
function connectWebSocket() {
  const wsUrl = `ws://${serverIp}:${serverPort}/ws/sensor`;
  console.log("WebSocket 연결 시도:", wsUrl);
  updateConnectionStatus("loading", "WebSocket 연결중...");
  wsClient.connect(wsUrl);
}

// 자동 재연결
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
  const waitTime = reconnectInterval * reconnectAttempts;

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
    resetAndReloadSensors();
  }, waitTime);
}

// 수동 재연결
function manualReconnect() {
  console.log("수동 재연결 시도");
  clearTimeout(reconnectTimer);
  stopSensorHealthCheck();
  stopSensorListMonitoring();
  reconnectAttempts = 0;

  wsClient.disconnect();

  sensorGroups.clear();
  lelSensors.clear();
  sensorGroupAlarms.clear();
  sensorHealthCheck.clear();

  loadSensors();
}
