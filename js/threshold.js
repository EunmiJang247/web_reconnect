// ========================================
// 임계치 설정 관리
// ========================================

// 임계치 모달 열기
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

  // 에러 메시지 영역 추가
  const errorDiv = document.createElement("div");
  errorDiv.id = "thresholdErrorMessage";
  errorDiv.style.color = "red";
  errorDiv.style.marginTop = "1rem";
  errorDiv.style.fontSize = "0.9rem";
  errorDiv.style.display = "none";
  content.appendChild(errorDiv);

  elements.thresholdModal.style.display = "block";
}

// 임계치 모달 닫기
function closeThresholdModal() {
  elements.thresholdModal.style.display = "none";
  currentThresholdSensorId = null;
  currentThresholdSensorType = null;
}

// 임계치 섹션 생성
function createThresholdSection(sensorId, gasType) {
  const threshold = getSensorThreshold(sensorId, gasType);
  const unit = threshold?.unit || "";

  // O2 센서의 경우 특수한 경고 범위 처리
  let warningMin, warningMax, dangerLabel, dangerValue;
  if (gasType === "O2") {
    warningMin = threshold?.warning_min_low || threshold?.danger_min || 19.5;
    warningMax = threshold?.warning_max_high || threshold?.danger_max || 23.5;
    dangerLabel = `위험 범위 (${unit}) - 이 값 미만 또는 초과시 위험`;
    dangerValue = `${threshold?.danger_min || 19.5} 미만 / ${
      threshold?.danger_max || 23.5
    } 초과`;
  } else {
    warningMin = threshold?.warning_min || 0;
    warningMax = threshold?.warning_max || 100;
    dangerLabel = `위험 최소값 (${unit})`;
    dangerValue = threshold?.danger_min || 0;
  }

  const section = document.createElement("div");
  section.className = "threshold-section";

  // O2는 읽기 전용 정보로 표시
  if (gasType === "O2") {
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
                <label>경고 하한 (${unit})</label>
                <input type="number" id="warning_min_${gasType}" value="${warningMin}" step="0.1">
            </div>
            <div class="threshold-field">
                <label>경고 상한 (${unit})</label>
                <input type="number" id="warning_max_${gasType}" value="${warningMax}" step="0.1">
            </div>
            <div class="threshold-field" style="grid-column: 1 / -1;">
                <label>${dangerLabel}</label>
                <input type="text" value="${dangerValue}" readonly style="background: #f5f5f5;">
            </div>
        </div>
        <p style="color: #666; font-size: 0.9rem; margin-top: 0.5rem;">
          ※ O2는 ${threshold?.danger_min || 19.5}% 미만 또는 ${
      threshold?.danger_max || 23.5
    }% 초과시 위험으로 판정됩니다.
        </p>
    `;
  } else {
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
                <input type="number" id="warning_min_${gasType}" value="${warningMin}" step="0.1">
            </div>
            <div class="threshold-field">
                <label>경고 최대값 (${unit})</label>
                <input type="number" id="warning_max_${gasType}" value="${warningMax}" step="0.1">
            </div>
            <div class="threshold-field">
                <label>${dangerLabel}</label>
                <input type="number" id="danger_min_${gasType}" value="${dangerValue}" step="0.1">
            </div>
        </div>
    `;
  }

  return section;
}

// 임계치 저장
function saveThresholds() {
  if (!currentThresholdSensorId || !currentThresholdSensorType) return;

  let gasTypes = [];
  if (currentThresholdSensorType === "composite") {
    gasTypes = ["CO", "O2", "H2S", "CO2"];
  } else if (currentThresholdSensorType === "lel") {
    gasTypes = ["LEL"];
  }

  if (!sensorThresholds.has(currentThresholdSensorId)) {
    sensorThresholds.set(currentThresholdSensorId, {});
  }

  const sensorThreshold = sensorThresholds.get(currentThresholdSensorId);

  // 🔥 유효성 검사
  let errorMessages = [];

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

    // O2는 danger_min 입력 필드가 없으므로 건너뜀
    let dangerMin;
    const dangerMinElement = document.getElementById(`danger_min_${gasType}`);
    if (dangerMinElement && dangerMinElement.type !== "text") {
      dangerMin = parseFloat(dangerMinElement.value);
    }

    // 유효성 검사
    if (normalMin >= normalMax) {
      errorMessages.push(
        `${formatGasName(gasType)}: 정상 최소값은 최대값보다 작아야 합니다.`
      );
    }

    // O2는 특별한 유효성 검사 (양방향)
    if (gasType === "O2") {
      if (warningMin >= normalMin) {
        errorMessages.push(
          `${formatGasName(
            gasType
          )}: 경고 하한은 정상 최소값보다 작아야 합니다.`
        );
      }
      if (warningMax <= normalMax) {
        errorMessages.push(
          `${formatGasName(gasType)}: 경고 상한은 정상 최대값보다 커야 합니다.`
        );
      }
    } else {
      // 일반 가스 유효성 검사
      if (warningMin >= warningMax) {
        errorMessages.push(
          `${formatGasName(gasType)}: 경고 최소값은 최대값보다 작아야 합니다.`
        );
      }
      if (normalMax > warningMin) {
        errorMessages.push(
          `${formatGasName(
            gasType
          )}: 경고 최소값은 정상 최대값보다 커야 합니다.`
        );
      }
      if (dangerMin !== undefined && warningMax > dangerMin) {
        errorMessages.push(
          `${formatGasName(
            gasType
          )}: 위험 최소값은 경고 최대값보다 커야 합니다.`
        );
      }
    }
  });

  // 오류가 있으면 저장하지 않고 에러 메시지 표시
  const errorDiv = document.getElementById("thresholdErrorMessage");
  if (errorMessages.length > 0) {
    errorDiv.innerHTML = errorMessages.join("<br>");
    errorDiv.style.display = "block";
    return;
  }

  // 에러가 없으면 저장
  errorDiv.style.display = "none";
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

    const threshold = getSensorThreshold(currentThresholdSensorId, gasType);

    // O2는 특수한 구조로 저장
    if (gasType === "O2") {
      sensorThreshold[gasType] = {
        ...threshold,
        normal_min: normalMin,
        normal_max: normalMax,
        warning_min_low: warningMin,
        warning_max_low: normalMin,
        warning_min_high: normalMax,
        warning_max_high: warningMax,
        danger_min: warningMin,
        danger_max: warningMax,
      };
    } else {
      const dangerMin = parseFloat(
        document.getElementById(`danger_min_${gasType}`).value
      );

      sensorThreshold[gasType] = {
        ...threshold,
        normal_min: normalMin,
        normal_max: normalMax,
        warning_min: warningMin,
        warning_max: warningMax,
        danger_min: dangerMin,
      };
    }
  });

  console.log(`센서 ${currentThresholdSensorId}의 임계치 저장 완료`);

  // localStorage에 저장
  saveSensorThresholds();

  renderSensorCards();
  closeThresholdModal();
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

// 알람 메시지 레벨 결정
function getAlarmMessageLevel(alarmMessage) {
  if (!alarmMessage || alarmMessage.trim() === "") {
    return "normal";
  }

  const concentrationLevel = analyzeAlarmConcentration(alarmMessage);
  if (concentrationLevel !== "normal") {
    return concentrationLevel;
  }

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
    return "warning";
  }
}

// 알람 메시지에서 농도값 분석
function analyzeAlarmConcentration(alarmMessage) {
  if (!alarmMessage) return "normal";

  const ppmPatterns = [
    /(\d+(?:\.\d+)?)\s*ppm/i,
    /농도.*?(\d+(?:\.\d+)?)/,
    /(\d+(?:\.\d+)?)\s*%/i,
  ];

  let gasType = null;
  let concentration = null;

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

  for (const pattern of ppmPatterns) {
    const match = alarmMessage.match(pattern);
    if (match) {
      concentration = parseFloat(match[1]);
      break;
    }
  }

  if (gasType && concentration !== null && !isNaN(concentration)) {
    const gasStatus = calculateGasStatus(gasType, concentration.toString());
    return gasStatus;
  }

  return "normal";
}
