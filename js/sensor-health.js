// ========================================
// 센서 헬스 체크 및 모니터링
// ========================================

// 센서 헬스 체크 시작
function startSensorHealthCheck() {
  stopSensorHealthCheck();

  sensors.forEach((sensor) => {
    const sensorId = `${sensor.modelName}_${sensor.portName}`;
    sensorHealthCheck.set(sensorId, Date.now());
  });

  healthCheckInterval = setInterval(checkSensorHealth, 30000);
  console.log("센서 헬스 체크 시작 (30초 간격)");
}

// 센서 헬스 체크 중지
function stopSensorHealthCheck() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
    console.log("센서 헬스 체크 중지");
  }
}

// 센서 헬스 상태 업데이트
function updateSensorHealth(destination) {
  const sensor = sensors.find((s) => s.topicPath === destination);
  if (sensor) {
    const sensorId = `${sensor.modelName}_${sensor.portName}`;
    sensorHealthCheck.set(sensorId, Date.now());
  }
}

// 센서 헬스 체크 실행
function checkSensorHealth() {
  console.log("🔍 센서 헬스 체크 시작...");

  const now = Date.now();
  const timeoutThreshold = 60000;
  let unhealthySensors = [];
  let activeSensors = 0;

  for (const [sensorId, lastSeen] of sensorHealthCheck.entries()) {
    activeSensors++;
    const timeSinceLastSeen = now - lastSeen;

    if (timeSinceLastSeen > timeoutThreshold) {
      const sensor = sensors.find(
        (s) => `${s.modelName}_${s.portName}` === sensorId
      );
      if (sensor) {
        unhealthySensors.push({
          id: sensorId,
          name: sensor.displayName,
          lastSeen: Math.floor(timeSinceLastSeen / 1000),
        });
      }
    }
  }

  console.log(
    `📊 헬스 체크 결과: ${activeSensors}개 센서 중 ${unhealthySensors.length}개 응답 없음`
  );

  if (unhealthySensors.length > 0) {
    console.warn("❌ 응답하지 않는 센서들:");
    unhealthySensors.forEach((sensor) => {
      console.warn(
        `  - ${sensor.name} (${sensor.id}): ${sensor.lastSeen}초 전 마지막 수신`
      );
    });

    if (
      activeSensors === 0 ||
      (activeSensors > 0 && unhealthySensors.length >= activeSensors * 0.7)
    ) {
      console.error(
        "🚨 대부분의 센서가 응답하지 않음. 전체 시스템 리셋 시작..."
      );
      resetAndReloadSensors();
      return;
    }

    if (unhealthySensors.length >= activeSensors * 0.5) {
      console.warn("⚠️ 다수의 센서가 응답하지 않음. WebSocket 재연결 시도...");
      wsClient.disconnect();
    }
  } else {
    console.log("✅ 모든 센서가 정상 응답 중");
  }
}

// 센서 목록 주기적 모니터링 시작
function startSensorListMonitoring() {
  stopSensorListMonitoring();

  sensorListUpdateInterval = setInterval(async () => {
    console.log("🔄 센서 목록 업데이트 확인 중...");

    try {
      const response = await fetch(
        `http://${serverIp}:${serverPort}/api/sensor/mappings`
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const responseData = await response.json();

      let newSensorData = [];
      if (responseData.data && responseData.data.sensors) {
        newSensorData = responseData.data.sensors;
      } else if (Array.isArray(responseData.data)) {
        newSensorData = responseData.data;
      } else if (Array.isArray(responseData)) {
        newSensorData = responseData;
      } else {
        throw new Error("예상하지 못한 응답 형식입니다.");
      }

      const validSensorData = newSensorData.filter((item) => {
        return (
          !item.modelName || !item.modelName.toLowerCase().includes("error")
        );
      });

      const newSensors = validSensorData.map((item, index) => {
        const sensor = SensorInfo.fromJson(item);
        sensor.customName = generateSensorName(
          sensor.serialNumber,
          sensors.length + index
        );
        return sensor;
      });

      if (hasSensorListChanged(sensors, newSensors)) {
        console.log(
          `📊 센서 목록 변경 감지: ${sensors.length} → ${newSensors.length}`
        );

        cleanupRemovedSensors(sensors, newSensors);

        const oldSensorCount = sensors.length;
        sensors = newSensors;

        subscribeToAllSensors();
        updateHealthCheckForNewSensors();
        updateTotalSensorsCount();
        renderSensorCards();
        updateConnectionStatusWithSensorCount();

        console.log(
          `센서 목록 업데이트 완료: ${oldSensorCount} → ${sensors.length}개`
        );

        if (sensors.length === 0) {
          console.warn("⚠️ 모든 센서가 제거되었습니다.");
          showNoSensorsState();
        }
      }
    } catch (error) {
      console.warn("센서 목록 업데이트 실패:", error.message);
    }
  }, 60000);
}

// 센서 목록 모니터링 중지
function stopSensorListMonitoring() {
  if (sensorListUpdateInterval) {
    clearInterval(sensorListUpdateInterval);
    sensorListUpdateInterval = null;
    console.log("센서 목록 모니터링 중지");
  }
}

// 센서 목록 변경 확인
function hasSensorListChanged(oldSensors, newSensors) {
  if (oldSensors.length !== newSensors.length) {
    return true;
  }

  const oldSensorIds = new Set(
    oldSensors.map((s) => `${s.modelName}_${s.portName}`)
  );
  const newSensorIds = new Set(
    newSensors.map((s) => `${s.modelName}_${s.portName}`)
  );

  for (const oldId of oldSensorIds) {
    if (!newSensorIds.has(oldId)) {
      return true;
    }
  }

  for (const newId of newSensorIds) {
    if (!oldSensorIds.has(newId)) {
      return true;
    }
  }

  return false;
}

// 새로운 센서 목록에 맞게 헬스체크 업데이트
function updateHealthCheckForNewSensors() {
  const currentTime = Date.now();
  const newHealthCheck = new Map();

  sensors.forEach((sensor) => {
    const sensorId = `${sensor.modelName}_${sensor.portName}`;
    const lastSeen = sensorHealthCheck.get(sensorId) || currentTime;
    newHealthCheck.set(sensorId, lastSeen);
  });

  sensorHealthCheck = newHealthCheck;
  console.log(`헬스체크 업데이트 완료: ${sensorHealthCheck.size}개 센서`);
}

// 제거된 센서들 정리
function cleanupRemovedSensors(oldSensors, newSensors) {
  const newSensorIds = new Set(
    newSensors.map((s) => `${s.modelName}_${s.portName}`)
  );

  oldSensors.forEach((oldSensor) => {
    const oldSensorId = `${oldSensor.modelName}_${oldSensor.portName}`;

    if (!newSensorIds.has(oldSensorId)) {
      console.log(`센서 제거됨: ${oldSensorId} (${oldSensor.displayName})`);

      if (wsClient.isConnected()) {
        wsClient.unsubscribe(oldSensor.topicPath);
      }

      sensorGroups.delete(oldSensorId);
      lelSensors.delete(oldSensorId);
      sensorGroupAlarms.delete(oldSensorId);
      sensorHealthCheck.delete(oldSensorId);
      sensorThresholds.delete(oldSensorId);

      console.log(`센서 ${oldSensorId} 데이터 완전 정리 완료`);
    }
  });
}
