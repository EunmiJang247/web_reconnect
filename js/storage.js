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

// 배기팬 상태 저장
function saveFanStates() {
  try {
    const fanStates = {
      fan1: fan1State,
      fan2: fan2State,
    };
    localStorage.setItem("fanStates", JSON.stringify(fanStates));
    console.log("💾 배기팬 상태 저장:", fanStates);
  } catch (error) {
    console.error("배기팬 상태 저장 실패:", error);
  }
}

// 배기팬 상태 로드
let fanPollingInterval = null;

async function loadFanStates() {
  try {
    const apiUrl = `http://${serverIp}:${serverPort}/api/fan/health`;
    const healthResponse = await fetch(apiUrl);
    const healthData = await healthResponse.json();

    console.log("배기팬 상태 로드 응답 데이터:", healthData);

    if (healthData.code === 200 && healthData.data.bassoDevices.length > 0) {
      const deviceCount = healthData.data.bassoDevices.length;
      console.log("💾 배기팬 개수:", deviceCount);

      // 모든 포트 이름을 배열로 수집
      const portNames = healthData.data.bassoDevices.map(
        (device) => device.portName
      );
      console.log("💾 배기팬 포트 목록:", portNames);

      // 포트 이름들을 콤마로 구분하여 쿼리 파라미터로 전달
      const portNamesParam = portNames.join(",");
      const apiUrlFan = `http://${serverIp}:${serverPort}/api/fan/status?portNames=${encodeURIComponent(
        portNamesParam
      )}`;
      const statusResponse = await fetch(apiUrlFan);
      const statusData = await statusResponse.json();
      console.log("statusData 데이터:", statusData);

      if (statusData.code === 200 && statusData.data.ports.length > 0) {
        // 배기팬 표시 영역 업데이트
        updateFanDisplay(statusData.data.ports);

        // 각 배기팬 상태 업데이트
        statusData.data.ports.forEach((port, index) => {
          const fanNumber = index + 1;
          const isOn = port.fanStatus === "ON"; // UNKNOWN이면 OFF와 동일하게 처리

          // 배기팬 상태 업데이트
          if (fanNumber === 1) {
            fan1State = isOn;
          } else if (fanNumber === 2) {
            fan2State = isOn;
          }

          console.log(
            `💾 배기팬${fanNumber} 상태 로드: ${port.fanStatus} (${port.portName})`
          );

          // 배기팬 이미지 업데이트
          setTimeout(() => {
            updateFanImage(fanNumber, isOn);
          }, 100);
        });
      }
    } else {
      // 배기팬이 없는 경우 숨김
      updateFanDisplay([]);
      console.log("💾 배기팬이 연결되지 않았습니다.");
    }
  } catch (error) {
    console.error("배기팬 상태 로드 실패:", error);
    updateFanDisplay([]);
  }
}

// 배기팬 표시 영역 동적 생성
function updateFanDisplay(ports) {
  const fanDisplay = document.querySelector(".fan-display");
  if (!fanDisplay) return;

  // 기존 내용 삭제
  fanDisplay.innerHTML = "";

  // 배기팬이 없으면 숨김
  if (ports.length === 0) {
    fanDisplay.style.display = "none";
    return;
  }

  // 배기팬 표시
  fanDisplay.style.display = "block";

  // 각 배기팬 항목 생성
  ports.forEach((port, index) => {
    const fanNumber = index + 1;
    const isOn = port.fanStatus === "ON"; // UNKNOWN이면 OFF와 동일하게 처리
    const imageSrc = isOn ? "fan_on.webp" : "fan_off.webp";

    const fanItem = document.createElement("div");
    fanItem.className = "fan-item";
    fanItem.innerHTML = `
      <span class="fan-label">FAN ${fanNumber}:</span>
      <img
        id="fan${fanNumber}Image"
        src="${imageSrc}"
        alt="배기팬 ${fanNumber}"
        class="fan-icon"
      />
    `;

    fanDisplay.appendChild(fanItem);
  });

  console.log(`✅ 배기팬 ${ports.length}개 표시 완료`);
}

// 배기팬 상태 폴링 시작 (1초마다)
function startFanPolling() {
  // 기존 폴링이 있다면 정리
  if (fanPollingInterval) {
    clearInterval(fanPollingInterval);
  }

  // 1초마다 배기팬 상태 업데이트
  fanPollingInterval = setInterval(async () => {
    try {
      const apiUrl = `http://${serverIp}:${serverPort}/api/fan/health`;
      const healthResponse = await fetch(apiUrl);
      const healthData = await healthResponse.json();

      if (healthData.code === 200) {
        if (healthData.data.bassoDevices.length > 0) {
          // 팬이 연결되어 있음
          const portNames = healthData.data.bassoDevices.map(
            (device) => device.portName
          );
          const portNamesParam = portNames.join(",");
          const apiUrlFan = `http://${serverIp}:${serverPort}/api/fan/status?portNames=${encodeURIComponent(
            portNamesParam
          )}`;
          const statusResponse = await fetch(apiUrlFan);
          const statusData = await statusResponse.json();

          if (statusData.code === 200 && statusData.data.ports.length > 0) {
            // 배기팬 상태 업데이트
            statusData.data.ports.forEach((port, index) => {
              const fanNumber = index + 1;
              const isOn = port.fanStatus === "ON"; // UNKNOWN이면 OFF와 동일하게 처리

              // 상태가 변경되었을 때만 업데이트
              if (fanNumber === 1 && fan1State !== isOn) {
                fan1State = isOn;
                updateFanImage(fanNumber, isOn);
                console.log(
                  `🔄 배기팬${fanNumber} 상태 변경: ${port.fanStatus}`
                );
              } else if (fanNumber === 2 && fan2State !== isOn) {
                fan2State = isOn;
                updateFanImage(fanNumber, isOn);
                console.log(
                  `🔄 배기팬${fanNumber} 상태 변경: ${port.fanStatus}`
                );
              }
            });
          }
        } else {
          // 팬이 연결 해제됨 (bassoDevices가 빈 배열)
          console.log("🗑️ 모든 배기팬 연결 해제 감지");

          // 모든 팬 이미지 제거
          if (fan1State !== null) {
            removeFanImage(1);
            fan1State = null;
          }
          if (fan2State !== null) {
            removeFanImage(2);
            fan2State = null;
          }
        }
      }
    } catch (error) {
      console.error("배기팬 상태 폴링 오류:", error);
    }
  }, 1000); // 1초마다 실행

  console.log("✅ 배기팬 상태 폴링 시작 (1초 간격)");
}

// 배기팬 상태 폴링 중지
function stopFanPolling() {
  if (fanPollingInterval) {
    clearInterval(fanPollingInterval);
    fanPollingInterval = null;
    console.log("⏹️ 배기팬 상태 폴링 중지");
  }
}

// 배기팬 위치 저장
function saveFanPosition(position) {
  try {
    localStorage.setItem("fanPosition", position);
    console.log("💾 배기팬 위치 저장:", position);
  } catch (error) {
    console.error("배기팬 위치 저장 실패:", error);
  }
}

// 배기팬 위치 로드
function loadFanPosition() {
  try {
    const saved = localStorage.getItem("fanPosition");
    const position = saved || "top-right"; // 기본값: 우측 상단
    console.log("💾 배기팬 위치 로드:", position);

    // 위치 적용
    setTimeout(() => {
      changeFanPosition(position, false);
    }, 100);
  } catch (error) {
    console.error("배기팬 위치 로드 실패:", error);
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
