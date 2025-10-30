// 가스 타입별 임계값 설정
const GasThresholds = {
  thresholds: {
    CO: {
      normal_min: 0,
      normal_max: 30,
      warning_min: 30,
      warning_max: 200,
      danger_min: 200,
      unit: "ppm",
      color: "#27ae60",
      icon: "fas fa-wind",
    },
    O2: {
      normal_min: 20,
      normal_max: 22,
      warning_min_low: 19.5,
      warning_max_low: 20,
      warning_min_high: 22,
      warning_max_high: 23.5,
      danger_max: 23.5,
      danger_min: 19.5,
      unit: "%",
      color: "#3498db",
      icon: "fas fa-circle",
    },
    H2S: {
      normal_min: 0,
      normal_max: 5,
      warning_min: 5,
      warning_max: 50,
      danger_min: 50,
      unit: "ppm",
      color: "#f39c12",
      icon: "fas fa-exclamation-triangle",
    },
    CO2: {
      normal_min: 0,
      normal_max: 1500,
      warning_min: 1500,
      warning_max: 5000,
      danger_min: 5000,
      unit: "ppm",
      color: "#e74c3c",
      icon: "fas fa-cloud",
    },
    LEL: {
      normal_min: 0,
      normal_max: 10,
      warning_min: 10,
      warning_max: 25,
      danger_min: 25,
      unit: "%",
      color: "#9b59b6",
      icon: "fas fa-fire",
    },
  },

  getGasType(modelName) {
    if (modelName.includes("LEL")) return "LEL";
    if (modelName.includes("CO2")) return "CO2";
    if (modelName.includes("CO")) return "CO";
    if (modelName.includes("O2")) return "O2";
    if (modelName.includes("H2S")) return "H2S";
    return "UNKNOWN";
  },
};

// 센서 상태 열거형
const SensorStatus = {
  NORMAL: "normal",
  WARNING: "warning",
  DANGER: "danger",
  ERROR: "error",
};

// 센서 정보 클래스
class SensorInfo {
  constructor(
    portName,
    modelName,
    serialNumber,
    data = "--",
    lastUpdateTime = "--"
  ) {
    this.portName = portName;
    this.modelName = modelName;
    this.serialNumber = serialNumber;
    this.data = data;
    this.lastUpdateTime = lastUpdateTime;
    this.customName = null; // 사용자 지정 이름
  }

  static fromJson(json) {
    return new SensorInfo(
      json.portName || "",
      json.modelName || "",
      json.serialNumber || ""
    );
  }

  get topicPath() {
    return `/topic/sensor/${this.modelName}/${this.portName}/${this.serialNumber}`;
  }

  get displayName() {
    // 사용자 지정 이름이 있으면 우선 사용
    if (this.customName) {
      return this.customName;
    }
    return `${this.modelName} (${this.portName})`;
  }

  get gasType() {
    return GasThresholds.getGasType(this.modelName);
  }

  get thresholdInfo() {
    return GasThresholds.thresholds[this.gasType];
  }

  get status() {
    if (this.data === "--" || this.data === "") return SensorStatus.ERROR;

    const numValue = parseFloat(this.data);
    if (isNaN(numValue)) return SensorStatus.ERROR;

    const threshold = GasThresholds.thresholds[this.gasType];
    if (!threshold) return SensorStatus.ERROR;

    const normalMin = threshold.normal_min;
    const normalMax = threshold.normal_max;

    // 정상 범위 확인
    if (numValue >= normalMin && numValue <= normalMax) {
      return SensorStatus.NORMAL;
    }

    // O2는 특별한 처리 필요 (위/아래 둘 다 경고/위험 범위)
    if (this.gasType.toLowerCase() === "o2") {
      // 위험 범위: 23.5 초과 또는 19.5 미만
      if (numValue > 23.5 || numValue < 19.5) {
        return SensorStatus.DANGER;
      }
      // 경고 범위: 22~23.5 또는 19.5~20
      if (
        (numValue > 22 && numValue <= 23.5) ||
        (numValue >= 19.5 && numValue < 20)
      ) {
        return SensorStatus.WARNING;
      }
      return SensorStatus.NORMAL;
    }

    // 다른 가스들 (CO, H2S, CO2, LEL)
    const warningMin = threshold.warning_min;
    const warningMax = threshold.warning_max;
    const dangerMin = threshold.danger_min;

    // 위험 범위 확인
    if (dangerMin !== undefined && numValue > dangerMin) {
      return SensorStatus.DANGER;
    }

    // 경고 범위 확인
    if (
      warningMin !== undefined &&
      warningMax !== undefined &&
      numValue > warningMin &&
      numValue <= warningMax
    ) {
      return SensorStatus.WARNING;
    }

    // 정상 범위를 벗어났지만 경고/위험에 해당하지 않는 경우
    return SensorStatus.WARNING;
  }

  get statusColor() {
    switch (this.status) {
      case SensorStatus.NORMAL:
        return "#27ae60";
      case SensorStatus.WARNING:
        return "#f39c12";
      case SensorStatus.DANGER:
        return "#e74c3c";
      case SensorStatus.ERROR:
        return "#95a5a6";
      default:
        return "#95a5a6";
    }
  }

  get statusText() {
    switch (this.status) {
      case SensorStatus.NORMAL:
        return "정상";
      case SensorStatus.WARNING:
        return "경고";
      case SensorStatus.DANGER:
        return "위험";
      case SensorStatus.ERROR:
        return "오류";
      default:
        return "오류";
    }
  }

  get dataWithUnit() {
    if (this.data === "--" || this.data === "") return "--";
    const unit = this.thresholdInfo?.unit || "";
    return `${this.data} ${unit}`;
  }

  get normalRangeText() {
    const threshold = this.thresholdInfo;
    if (!threshold) return "";
    const unit = threshold.unit || "";
    return `정상: ${threshold.normal_min}~${threshold.normal_max} ${unit}`;
  }
}

// 가스 상태 계산 함수
function calculateGasStatus(gasType, gasValue, sensorThresholds = null) {
  const threshold = sensorThresholds || GasThresholds.thresholds[gasType];
  if (gasValue === "--" || gasValue === "" || !threshold) {
    return SensorStatus.ERROR;
  }

  const numValue = parseFloat(gasValue);
  if (isNaN(numValue)) return SensorStatus.ERROR;

  const normalMin = threshold.normal_min;
  const normalMax = threshold.normal_max;

  // 정상 범위 확인
  if (numValue >= normalMin && numValue <= normalMax) {
    return SensorStatus.NORMAL;
  }

  // O2는 특별한 처리 필요
  if (gasType.toLowerCase() === "o2") {
    if (numValue > 23.5 || numValue < 19.5) {
      return SensorStatus.DANGER;
    }
    if (
      (numValue > 22 && numValue <= 23.5) ||
      (numValue >= 19.5 && numValue < 20)
    ) {
      return SensorStatus.WARNING;
    }
    return SensorStatus.NORMAL;
  }

  // 다른 가스들
  const warningMin = threshold.warning_min;
  const warningMax = threshold.warning_max;
  const dangerMin = threshold.danger_min;

  // 위험 범위 확인
  if (dangerMin !== undefined && numValue > dangerMin) {
    return SensorStatus.DANGER;
  }

  // 경고 범위 확인
  if (
    warningMin !== undefined &&
    warningMax !== undefined &&
    numValue > warningMin &&
    numValue <= warningMax
  ) {
    return SensorStatus.WARNING;
  }

  return SensorStatus.WARNING;
}

// 가스 이름 표시용 포맷팅
function formatGasName(gasType) {
  switch (gasType.toLowerCase()) {
    case "co2":
      return "CO₂";
    case "h2s":
      return "H₂S";
    case "o2":
      return "O₂";
    case "co":
      return "CO";
    case "lel":
      return "LEL";
    default:
      return gasType;
  }
}

// 정상 범위 텍스트 생성
function getNormalRangeText(gasType, threshold) {
  if (!threshold) return "";

  const normalMin = threshold.normal_min;
  const normalMax = threshold.normal_max;
  const unit = threshold.unit || "";

  if (normalMin === undefined || normalMax === undefined) {
    return "";
  }

  // O2는 특별한 범위 표시
  if (gasType.toLowerCase() === "o2") {
    return `정상: ${normalMin}~${normalMax} ${unit}`;
  }

  return `정상: ${normalMin}~${normalMax} ${unit}`;
}
