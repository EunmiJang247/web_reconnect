// ========================================
// UI 렌더링 (센서 카드, 상태 배너)
// ========================================

// 센서 카드 렌더링
function renderSensorCards() {
  if (sensors.length === 0) {
    showNoSensorsState();
    return;
  }

  const grid = elements.sensorGrid;
  grid.innerHTML = "";

  const sortedSensors = [...sensors].sort((a, b) => {
    const nameA = a.displayName.toLowerCase();
    const nameB = b.displayName.toLowerCase();
    return nameA.localeCompare(nameB);
  });

  const maxSensors = 4;
  const sensorsToShow = sortedSensors.slice(0, maxSensors);

  sensorsToShow.forEach((sensor) => {
    const sensorId = `${sensor.modelName}_${sensor.portName}`;
    let cardElement;

    if (sensor.gasType === "LEL") {
      cardElement = createLelSensorCard(sensorId, sensor);
    } else {
      cardElement = createSensorGroupCard(sensorId, sensor);
    }

    grid.appendChild(cardElement);
  });

  updateSystemStatusBanner();
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

  let lelValue = lelData.lel || "--";

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

  if (alarmLevel === "danger") {
    status = SensorStatus.DANGER;
  } else if (alarmLevel === "warning" && status === SensorStatus.NORMAL) {
    status = SensorStatus.WARNING;
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

  if (alarmLevel === "danger") {
    hasError = true;
  } else if (alarmLevel === "warning") {
    hasWarning = true;
  }

  const groupStatus = hasError
    ? SensorStatus.DANGER
    : hasWarning
    ? SensorStatus.WARNING
    : SensorStatus.NORMAL;
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

// 시스템 상태 배너 업데이트
function updateSystemStatusBanner() {
  const safetyStatus = checkOverallSafetyStatus();

  const existingBanner = document.querySelector(".system-status-card");
  if (existingBanner) {
    existingBanner.remove();
  }

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
    handleSafeState();
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

  const mainContent = document.querySelector(".main-content");
  if (mainContent) {
    mainContent.insertBefore(bannerEl, mainContent.firstChild);
  }
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

// 가스 ID를 가스명으로 변환
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
