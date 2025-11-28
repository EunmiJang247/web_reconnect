// ========================================
// 로컬 스토리지 관리 (센서 이름, 임계치, 알람 설정 저장/로드)
// ========================================

// 센서 사용자 지정 이름 로드
function loadSensorCustomNames() {
  try {
    const savedNames = localStorage.getItem("sensorCustomNames");
    if (savedNames) {
      const namesObj = JSON.parse(savedNames);
      sensorCustomNames = new Map(Object.entries(namesObj));
      console.log("저장된 센서 이름 로드:", sensorCustomNames);
    }
  } catch (error) {
    console.error("센서 이름 로드 실패:", error);
    sensorCustomNames = new Map();
  }
}

// 센서 사용자 지정 이름 저장
function saveSensorCustomNames() {
  try {
    const namesObj = Object.fromEntries(sensorCustomNames);
    localStorage.setItem("sensorCustomNames", JSON.stringify(namesObj));
    console.log("센서 이름 저장 완료:", namesObj);
  } catch (error) {
    console.error("센서 이름 저장 실패:", error);
  }
}

// 센서 임계치 로드
function loadSensorThresholds() {
  try {
    const savedThresholds = localStorage.getItem("sensorThresholds");
    if (savedThresholds) {
      const thresholdsObj = JSON.parse(savedThresholds);
      sensorThresholds = new Map(
        Object.entries(thresholdsObj).map(([key, value]) => [key, value])
      );
      console.log("저장된 센서 임계치 로드:", sensorThresholds);
    }
  } catch (error) {
    console.error("센서 임계치 로드 실패:", error);
    sensorThresholds = new Map();
  }
}

// 센서 임계치 저장
function saveSensorThresholds() {
  try {
    const thresholdsObj = Object.fromEntries(sensorThresholds);
    localStorage.setItem("sensorThresholds", JSON.stringify(thresholdsObj));
    console.log("센서 임계치 저장 완료:", thresholdsObj);
  } catch (error) {
    console.error("센서 임계치 저장 실패:", error);
  }
}

// 알람 마스터 설정 로드
function loadAlarmMasterSetting() {
  try {
    const saved = localStorage.getItem("alarmMasterEnabled");
    if (saved !== null) {
      isAlarmMasterEnabled = saved === "true";
      console.log(
        `💾 저장된 알람 마스터 설정 로드: ${
          isAlarmMasterEnabled ? "ON" : "OFF"
        }`
      );
    } else {
      isAlarmMasterEnabled = true;
      localStorage.setItem("alarmMasterEnabled", "true");
      console.log("🔧 알람 마스터 설정 초기화: ON (기본값)");
    }

    // HTML 스위치 상태 동기화
    setTimeout(() => {
      const toggleElement = document.getElementById("beaconToggle");
      if (toggleElement) {
        toggleElement.checked = isAlarmMasterEnabled;
        console.log(
          `✅ HTML 토글 스위치 동기화: ${isAlarmMasterEnabled ? "ON" : "OFF"}`
        );

        if (!toggleElement.hasAttribute("data-listener-added")) {
          toggleElement.addEventListener("change", function () {
            toggleAlarmMaster(this.checked);
          });
          toggleElement.setAttribute("data-listener-added", "true");
          console.log("🔗 토글 스위치 이벤트 리스너 추가됨");
        }
      } else {
        console.warn(
          "⚠️ beaconToggle 요소를 찾을 수 없습니다. HTML을 확인하세요."
        );
      }
    }, 100);
  } catch (error) {
    console.error("알람 마스터 설정 로드 중 오류:", error);
    isAlarmMasterEnabled = true;
    localStorage.setItem("alarmMasterEnabled", "true");
  }
}

// 센서 이름 생성 (기존 이름 우선 적용)
function generateSensorName(serialNumber, existingCount) {
  if (sensorCustomNames.has(serialNumber)) {
    return sensorCustomNames.get(serialNumber);
  }

  const newName = `센서${existingCount + 1}`;
  sensorCustomNames.set(serialNumber, newName);
  saveSensorCustomNames();
  return newName;
}

// 센서 이름 업데이트
function updateSensorCustomName(serialNumber, newName) {
  sensorCustomNames.set(serialNumber, newName);
  saveSensorCustomNames();

  const sensor = sensors.find((s) => s.serialNumber === serialNumber);
  if (sensor) {
    sensor.customName = newName;
    renderSensorCards();
  }
}
