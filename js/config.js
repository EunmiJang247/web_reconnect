// ========================================
// 전역 변수 및 설정
// ========================================

// 센서 데이터
let sensors = [];
let sensorGroups = new Map(); // 복합가스센서용
let lelSensors = new Map(); // LEL센서용
let sensorGroupAlarms = new Map();
let sensorThresholds = new Map(); // 센서별 개별 임계치
let sensorCustomNames = new Map(); // 센서별 사용자 지정 이름 (시리얼번호 -> 이름)

// 배기팬 데이터
let fans = []; // 배기팬 포트 정보
let fanStatus = new Map(); // 포트별 배기팬 상태 (예: COM23 -> {fan1: "ON", fan2: "OFF"})

// 서버 설정
let serverIp = "localhost";
let serverPort = "8081";

// 로딩 상태
let isLoadingSensors = false;

// 모달 상태
let currentThresholdSensorId = null;
let currentThresholdSensorType = null;

// 알람 상태
let lampOn = false;
let alertPorts = []; // 경광등 포트 목록
let isAlarmMasterEnabled = true; // 알람 마스터 스위치 상태 (기본값: ON)
let isManuallyTurnOFF = false; // 수동으로 알람을 끈 상태인지 확인
let isManuallyTurnON = false; // 수동으로 알람을 켠 상태인지 확인

// 재연결 설정
let reconnectAttempts = 0;
let maxReconnectAttempts = 5;
let reconnectInterval = 5000; // 5초
let reconnectTimer = null;

// 센서 헬스체크
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
