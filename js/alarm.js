// ========================================
// 알람 시스템 (경광등 및 배기팬 제어)
// ========================================

// 배기팬 상태 저장
let fan1State = false;
let fan2State = false;

// 위험 상태 처리
const handleDangerousState = () => {
  if (lampOn) return;

  if (!isAlarmMasterEnabled) {
    console.log(
      "⚠️ 전체 알람 시스템이 OFF 상태입니다. 설정에서 알람 스위치를 켜주세요."
    );
    return;
  }

  if (isManuallyTurnOFF) {
    console.log(
      "수동으로 알람이 비활성화된 상태입니다. 마스터 스위치를 다시 조작하거나 켜기 버튼을 눌러주세요."
    );
    return;
  }

  console.warn("위험 상태 감지됨! 즉시 조치가 필요합니다.");
  lampOn = true;
  callAlertAPI(true);
};

// 안전 상태 처리
const handleSafeState = () => {
  if (isManuallyTurnON && lampOn === true) {
    console.log("수동으로 켠 상태이므로 자동으로 끄지 않습니다.");
    return;
  }

  if (!lampOn) return;
  console.log("안전 상태로 복귀됨. 알람을 자동으로 끕니다.");
  lampOn = false;
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

// 알람 API 호출 (3회 연속 호출)
async function callAlertAPI(turnOn, isManual = false) {
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

  let successCount = 0;
  for (let i = 1; i <= 3; i++) {
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
        successCount++;
        console.log(
          `🚨 알람 ${action} API 호출 성공 [${i}/3] (포트: ${portNames})`
        );
      } else {
        console.error(
          `알람 ${action} API 호출 실패 [${i}/3]:`,
          response.status,
          response.statusText
        );
      }
    } catch (error) {
      console.error(`알람 ${action} API 호출 중 오류 발생 [${i}/3]:`, error);
    }

    if (i < 3) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  console.log(
    `✅ 알람 ${action} API 총 3회 호출 완료 (성공: ${successCount}/3)`
  );

  // 수동 조작인 경우 상태 업데이트
  if (isManual) {
    if (turnOn) {
      lampOn = true;
      isManuallyTurnOFF = false;
      isManuallyTurnON = true;
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
      isManuallyTurnOFF = true;
      isManuallyTurnON = false;
      isAlarmMasterEnabled = false;
      const toggleElement = document.getElementById("beaconToggle");
      if (toggleElement) {
        toggleElement.checked = false;
      }
      localStorage.setItem("alarmMasterEnabled", "false");
      console.log(
        "⛔ 수동으로 알람을 껐습니다. 전체 알람 시스템이 비활성화되었습니다."
      );
      alert(
        "🚨 알람이 수동으로 꺼졌습니다!\n\n조치를 취한 후 설정에서 알람 스위치를 다시 켜주세요."
      );
    }
  }
}

// 알람 마스터 스위치 토글
function toggleAlarmMaster(enabled) {
  isAlarmMasterEnabled = enabled;
  console.log(`🔔 알람 마스터 스위치: ${enabled ? "ON" : "OFF"}`);

  localStorage.setItem("alarmMasterEnabled", enabled.toString());

  if (enabled) {
    isManuallyTurnOFF = false;
    console.log(
      "✅ 알람 시스템이 활성화되었습니다. 수동 비활성화 상태가 해제되고, 위험 감지 시 자동으로 알람이 울립니다."
    );
  } else {
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

// 전체 안전 상태 확인
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

// ========================================
// 배기팬 제어 함수
// ========================================

// 배기팬 이미지 업데이트
function updateFanImage(fanNumber, isOn) {
  console.log("###??? 배기팬 이미지 업데이트:", fanNumber, isOn);
  const fanImage = document.getElementById(`fan${fanNumber}Image`);
  const fanSettingImage = document.getElementById(
    `fan${fanNumber}SettingImage`
  );
  const imageSrc = isOn ? "fan_on.webp" : "fan_off.webp";

  if (fanImage) {
    fanImage.src = imageSrc;
    fanImage.style.display = "block";
  }
  if (fanSettingImage) {
    fanSettingImage.src = imageSrc;
    fanSettingImage.style.display = "block";
  }
}

// 배기팬 이미지 제거 (연결 해제 시)
function removeFanImage(fanNumber) {
  console.log(`🗑️ 배기팬${fanNumber} 이미지 제거 (연결 해제됨)`);
  const fanImage = document.getElementById(`fan${fanNumber}Image`);
  const fanSettingImage = document.getElementById(
    `fan${fanNumber}SettingImage`
  );

  if (fanImage) {
    fanImage.style.display = "none";
  }
  if (fanSettingImage) {
    fanSettingImage.style.display = "none";
  }
}

// ========================================
// 배기팬 위치 제어 함수
// ========================================

// 배기팬 위치 변경
function changeFanPosition(position, save = true) {
  const fanDisplay = document.querySelector(".fan-display");
  const positionText = document.getElementById("currentFanPosition");

  if (!fanDisplay) {
    console.error("배기팬 표시 요소를 찾을 수 없습니다.");
    return;
  }

  // 모든 위치 클래스 제거
  fanDisplay.classList.remove(
    "position-top-left",
    "position-top-right",
    "position-bottom-left",
    "position-bottom-right"
  );

  // 새 위치 클래스 추가
  fanDisplay.classList.add(`position-${position}`);

  // 위치 텍스트 업데이트
  const positionNames = {
    "top-left": "왼쪽 상단",
    "top-right": "우측 상단",
    "bottom-left": "왼쪽 하단",
    "bottom-right": "우측 하단",
  };

  if (positionText) {
    positionText.textContent = positionNames[position] || position;
  }

  // localStorage에 저장
  if (save) {
    saveFanPosition(position);
  }

  console.log(`✅ 배기팬 위치 변경: ${positionNames[position]}`);
}
