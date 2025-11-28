// ========================================
// 유틸리티 함수들
// ========================================

// 로그 메시지
function logMessage(message, name = "GasMonitoring") {
  const timestamp = new Date().toLocaleTimeString();
  const logLine = `[${timestamp}] [${name}] ${message}`;
  console.log(logLine);
}
