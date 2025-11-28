// ========================================
// 센서 데이터 업데이트 및 처리
// ========================================

// 센서 데이터 업데이트
function updateSensor(sensorIndex, body) {
  if (!body || body.trim() === "" || sensorIndex >= sensors.length) return;

  const now = new Date();
  const nowStr = now.toLocaleTimeString();
  const sensor = sensors[sensorIndex];
  const sensorId = `${sensor.modelName}_${sensor.portName}`;

  updateSensorHealth(sensor.topicPath);

  try {
    const data = JSON.parse(body);

    if (sensor.gasType === "LEL") {
      // LEL 센서 데이터 처리
      const lelData = {
        lel: data.lel || "--",
        temperature: data.temperature || "--",
        humidity: data.humidity || "--",
        gasId: data.gasId || "--",
      };
      lelSensors.set(sensorId, lelData);
      console.log("LEL 센서 데이터:", lelData);
      console.log("현재 LEL 임계치 설정:", getSensorThreshold(sensorId, "LEL"));

      // LEL 센서의 실제 농도값 기반 알람 메시지 생성
      const lelValue = lelData.lel;
      if (lelValue !== "--") {
        const lelStatus = calculateSensorGasStatus(sensorId, "LEL", lelValue);
        if (lelStatus === "danger") {
          const customAlarm = `DANGER: LEL 위험 농도 감지 (${lelValue}%)`;
          sensorGroupAlarms.set(sensorId, customAlarm);
        } else if (lelStatus === "warning") {
          const customAlarm = `WARNING: LEL 경고 농도 감지 (${lelValue}%)`;
          sensorGroupAlarms.set(sensorId, customAlarm);
        } else {
          sensorGroupAlarms.delete(sensorId);
        }
      }

      console.log("----------------------------");
    } else {
      // 복합가스센서 데이터 처리
      const gasData = {
        CO: data.co || data.CO || "--",
        O2: data.o2 || data.O2 || "--",
        H2S: data.h2s || data.H2S || "--",
        CO2: data.co2 || data.CO2 || "--",
      };
      sensorGroups.set(sensorId, gasData);
      console.log("복합가스센서 데이터:", gasData);

      // 각 가스의 실제 농도값 기반 알람 메시지 생성
      let dangerGases = [];
      let warningGases = [];

      ["CO", "O2", "H2S", "CO2"].forEach((gasType) => {
        const gasValue = gasData[gasType];
        if (gasValue !== "--") {
          const gasStatus = calculateSensorGasStatus(
            sensorId,
            gasType,
            gasValue
          );
          if (gasStatus === "danger") {
            dangerGases.push(
              `${formatGasName(gasType)} 위험 (${gasValue}${
                getSensorThreshold(sensorId, gasType)?.unit || ""
              })`
            );
          } else if (gasStatus === "warning") {
            warningGases.push(
              `${formatGasName(gasType)} 경고 (${gasValue}${
                getSensorThreshold(sensorId, gasType)?.unit || ""
              })`
            );
          }
        }
      });

      if (dangerGases.length > 0) {
        const customAlarm = `DANGER: ${dangerGases.join(", ")}`;
        sensorGroupAlarms.set(sensorId, customAlarm);
      } else if (warningGases.length > 0) {
        const customAlarm = `WARNING: ${warningGases.join(", ")}`;
        sensorGroupAlarms.set(sensorId, customAlarm);
      } else {
        sensorGroupAlarms.delete(sensorId);
      }
    }

    // 서버에서 온 알람 메시지 (참고용)
    let serverAlarmMessage = "";
    if (data.alarmResult) {
      const alarmResult = data.alarmResult;
      if (alarmResult.alarmLevel && alarmResult.alarmLevel !== "NORMAL") {
        serverAlarmMessage = `${alarmResult.alarmLevel}`;
        if (alarmResult.messages && alarmResult.messages.length > 0) {
          serverAlarmMessage += `: ${alarmResult.messages.join(", ")}`;
        }
        console.log("서버 알람 메시지 (참고용):", serverAlarmMessage);
      }
    } else if (data.alarm && data.alarm.trim() !== "") {
      serverAlarmMessage = data.alarm;
      console.log("서버 알람 메시지 (참고용):", serverAlarmMessage);
    }

    elements.lastUpdateTime.textContent = nowStr;

    const currentAlarm = sensorGroupAlarms.get(sensorId);
    if (currentAlarm) {
      console.log("🚨 사용자 설정 기반 알람:", currentAlarm);
    }

    renderSensorCards();
  } catch (error) {
    console.error("데이터 파싱 실패:", error);
    console.error("원본 데이터:", body);
  }
}

// 센서 정보 로딩
async function loadSensors() {
  if (isLoadingSensors) return;

  isLoadingSensors = true;
  showLoadingState();
  updateConnectionStatus("loading", "센서 정보 로딩중...");

  try {
    const apiUrl = `http://${serverIp}:${serverPort}/api/sensor/mappings`;
    console.log("=== 센서 정보 로딩 시작 ===");
    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.status === 200) {
      const responseData = await response.json();
      console.log("HTTP 응답 데이터:", responseData);

      let sensorData = [];
      if (responseData.data && responseData.data.sensors) {
        sensorData = responseData.data.sensors;
      } else if (Array.isArray(responseData.data)) {
        sensorData = responseData.data;
      } else if (Array.isArray(responseData)) {
        sensorData = responseData;
      } else {
        throw new Error("예상하지 못한 응답 형식입니다.");
      }

      const validSensorData = sensorData.filter((item) => {
        const isValid =
          !item.modelName || !item.modelName.toLowerCase().includes("error");
        return isValid;
      });

      sensors = validSensorData.map((item, index) => {
        const sensor = SensorInfo.fromJson(item);
        sensor.customName = generateSensorName(sensor.serialNumber, index);
        return sensor;
      });
      console.log(`센서 ${sensors.length}개 로드 완료`);

      updateTotalSensorsCount();
      showSensorGrid();
      renderSensorCards();
      connectWebSocket();
    } else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  } catch (error) {
    console.error("센서 로딩 실패:", error);
    showErrorState(error.message);
    updateConnectionStatus("disconnected", "센서 로딩 실패");
  } finally {
    isLoadingSensors = false;
  }
}

// 센서 목록 리셋 및 다시 로딩
function resetAndReloadSensors() {
  console.log("=========================");
  console.log("전체 시스템 리셋 시작");
  console.log("=========================");

  wsClient.disconnect();
  stopSensorHealthCheck();
  stopSensorListMonitoring();
  clearTimeout(reconnectTimer);

  sensors = [];
  sensorGroups.clear();
  lelSensors.clear();
  sensorGroupAlarms.clear();
  sensorHealthCheck.clear();
  sensorThresholds.clear();
  reconnectAttempts = 0;

  console.log(
    "사용자 지정 센서 이름 보존:",
    Object.fromEntries(sensorCustomNames)
  );

  updateTotalSensorsCount();
  showLoadingState();

  setTimeout(() => {
    console.log("센서 목록 재로딩 시작...");
    loadSensors();
  }, 3000);
}
