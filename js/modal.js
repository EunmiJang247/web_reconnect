// ========================================
// 모달 및 설정 관리
// ========================================

// 이벤트 리스너 설정
function setupEventListeners() {
  document
    .getElementById("settingsBtn")
    .addEventListener("click", openSettingsModal);

  document
    .getElementById("reconnectBtn")
    .addEventListener("click", manualReconnect);

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

  document.getElementById("saveBtn").addEventListener("click", saveSettings);
  document
    .getElementById("saveThresholdBtn")
    .addEventListener("click", saveThresholds);

  elements.serverIpInput.addEventListener("input", updateUrlDisplay);
  elements.serverPortInput.addEventListener("input", updateUrlDisplay);

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

  // 모달 내부 컨텐츠 클릭 시 이벤트 전파 방지
  document
    .querySelector(".modal-content")
    .addEventListener("click", function (e) {
      e.stopPropagation();
    });

  const thresholdContent = document.querySelector(
    "#thresholdModal .modal-content"
  );
  if (thresholdContent) {
    thresholdContent.addEventListener("click", function (e) {
      e.stopPropagation();
    });
  }
}

// 설정 모달 열기
function openSettingsModal() {
  elements.serverIpInput.value = serverIp;
  elements.serverPortInput.value = serverPort;
  updateUrlDisplay();
  updateSensorList();
  elements.settingsModal.style.display = "block";
}

// 설정 모달 닫기
function closeSettingsModal() {
  elements.settingsModal.style.display = "none";
}

// URL 디스플레이 업데이트
function updateUrlDisplay() {
  const ip = elements.serverIpInput.value;
  const port = elements.serverPortInput.value;
  elements.apiUrl.textContent = `http://${ip}:${port}/api/sensor/mappings`;
  elements.wsUrl.textContent = `ws://${ip}:${port}/ws/sensor`;
}

// 센서 목록 업데이트
function updateSensorList() {
  elements.sensorCount.textContent = sensors.length;

  if (sensors.length === 0) {
    elements.sensorList.innerHTML = `
            <div class="no-sensors">
                <p>등록된 센서가 없습니다</p>
            </div>
        `;
  } else {
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

// 설정 저장
function saveSettings() {
  const newIp = elements.serverIpInput.value.trim();
  const newPort = elements.serverPortInput.value.trim();

  if (newIp !== serverIp || newPort !== serverPort) {
    serverIp = newIp;
    serverPort = newPort;

    wsClient.disconnect();

    sensorGroups.clear();
    lelSensors.clear();
    sensorGroupAlarms.clear();

    loadSensors();
  }

  closeSettingsModal();
}

// 센서 이름 편집
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

    if (titleElement) {
      titleElement.textContent = trimmedName;
    }

    console.log(`센서 이름 변경: ${currentName} → ${trimmedName}`);
  }
}
