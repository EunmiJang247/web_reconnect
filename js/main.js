// ========================================
// 메인 초기화 및 실행
// ========================================

// 페이지 로드 시 초기화
document.addEventListener("DOMContentLoaded", function () {
  loadSensorCustomNames(); // 로컬스토리지에 저장된 센서 이름 로드
  loadSensorThresholds(); // 로컬스토리지에 저장된 임계치 로드
  initializeElements(); // DOM 요소 초기화
  setupEventListeners(); // 이벤트 리스너 설정
  setupWebSocketCallbacks(); // WebSocket 이벤트 콜백 설정
  loadAlarmMasterSetting(); // 알람 마스터 설정 로드
  loadFanStates(); // 배기팬 상태 로드
  loadFanPosition(); // 배기팬 위치 로드
  // 배기팬 상태를 1초마다 확인하여 실시간 업데이트
  setTimeout(() => {
    startFanPolling();
  }, 2000); // 초기 로드 후 2초 뒤 폴링 시작
  loadAlertList(); // 경광등 리스트 로드
  loadSensors(); // 센서 및 팬정보 로딩
});

// 페이지 종료 시 정리
window.addEventListener("beforeunload", function () {
  stopSensorHealthCheck();
  stopSensorListMonitoring();
  stopFanPolling(); // 배기팬 폴링 중지
  clearTimeout(reconnectTimer);
  wsClient.disconnect();
});
