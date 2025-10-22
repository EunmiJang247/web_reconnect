// WebSocket 클라이언트 관리 클래스
class WebSocketClient {
  constructor() {
    this.ws = null;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 3000; // 3초
    this.heartbeatInterval = 15000; // 15초
    this.subscriptions = new Map(); // 토픽별 콜백 저장
    this.lastDataReceived = new Map(); // 센서별 마지막 데이터 수신 시간
    this.subscriptionHealthTimer = null;

    // 이벤트 콜백
    this.onConnect = null;
    this.onDisconnect = null;
    this.onError = null;
    this.onMessage = null;
  }

  // WebSocket 연결
  connect(url) {
    if (
      this.isConnecting ||
      (this.ws && this.ws.readyState === WebSocket.CONNECTING)
    ) {
      console.log("이미 연결 시도 중입니다.");
      return;
    }

    this.isConnecting = true;
    this.wsUrl = url;

    try {
      this.ws = new WebSocket(url, ["v12.stomp"]);
      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = this.handleError.bind(this);
    } catch (error) {
      console.error("WebSocket 연결 오류:", error);
      this.isConnecting = false;
      if (this.onError) {
        this.onError(error);
      }
      this.scheduleReconnect();
    }
  }

  // 연결 성공 처리
  handleOpen(event) {
    console.log("=== WebSocket 연결 성공 ===");
    this.isConnecting = false;
    this.reconnectAttempts = 0;

    // STOMP CONNECT 프레임 전송
    this.sendStompFrame("CONNECT", {
      "accept-version": "1.2",
      host: "/",
      "heart-beat": "10000,10000",
    });
  }

  // 메시지 수신 처리
  handleMessage(event) {
    try {
      const frame = this.parseStompFrame(event.data);

      if (frame.command === "CONNECTED") {
        console.log("STOMP 연결 완료");
        if (this.onConnect) {
          this.onConnect();
        }
        this.startHeartbeat();
        this.startSubscriptionHealthCheck();
      } else if (frame.command === "MESSAGE") {
        const destination = frame.headers["destination"];
        const body = frame.body;

        // 구독 콜백 실행
        if (this.subscriptions.has(destination)) {
          const callback = this.subscriptions.get(destination);
          callback(body, frame.headers);
        }

        // 전역 메시지 콜백
        if (this.onMessage) {
          this.onMessage(destination, body, frame.headers);
        }

        // 데이터 수신 시간 기록
        this.lastDataReceived.set(destination, new Date());
      } else if (frame.command === "ERROR") {
        console.error("STOMP 오류:", frame.body);
        if (this.onError) {
          this.onError(new Error(`STOMP Error: ${frame.body}`));
        }
      }
    } catch (error) {
      console.error("메시지 파싱 오류:", error);
    }
  }

  // 연결 종료 처리
  handleClose(event) {
    console.log("WebSocket 연결 종료:", event.code, event.reason);
    this.isConnecting = false;
    this.cleanup();

    if (this.onDisconnect) {
      this.onDisconnect(event);
    }

    // 정상 종료가 아닌 경우 재연결 시도
    if (event.code !== 1000) {
      this.scheduleReconnect();
    }
  }

  // 오류 처리
  handleError(event) {
    console.error("WebSocket 오류:", event);
    this.isConnecting = false;

    if (this.onError) {
      this.onError(event);
    }
  }

  // STOMP 프레임 파싱
  parseStompFrame(data) {
    const lines = data.split("\n");
    const command = lines[0];
    const headers = {};
    let bodyStart = -1;

    // 헤더 파싱
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === "") {
        bodyStart = i + 1;
        break;
      }
      const [key, value] = lines[i].split(":");
      if (key && value !== undefined) {
        headers[key] = value;
      }
    }

    // 바디 추출
    let body = "";
    if (bodyStart !== -1) {
      body = lines.slice(bodyStart).join("\n");
      // 마지막 null 문자 제거
      if (body.endsWith("\0")) {
        body = body.slice(0, -1);
      }
    }

    return { command, headers, body };
  }

  // STOMP 프레임 전송
  sendStompFrame(command, headers = {}, body = "") {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("WebSocket이 연결되지 않음");
      return false;
    }

    let frame = command + "\n";

    // 헤더 추가
    for (const [key, value] of Object.entries(headers)) {
      frame += `${key}:${value}\n`;
    }

    frame += "\n" + body + "\0";

    try {
      this.ws.send(frame);
      return true;
    } catch (error) {
      console.error("프레임 전송 오류:", error);
      return false;
    }
  }

  // 토픽 구독
  subscribe(destination, callback) {
    const subscriptionId = `sub-${Date.now()}-${Math.random()}`;

    const success = this.sendStompFrame("SUBSCRIBE", {
      id: subscriptionId,
      destination: destination,
      ack: "auto",
    });

    if (success) {
      this.subscriptions.set(destination, callback);
      console.log(`구독 성공: ${destination}`);
      return subscriptionId;
    } else {
      console.error(`구독 실패: ${destination}`);
      return null;
    }
  }

  // 구독 해제
  unsubscribe(destination) {
    // 구독 ID 찾기 (실제로는 더 정교한 관리가 필요)
    const subscriptionId = `sub-${destination}`;

    this.sendStompFrame("UNSUBSCRIBE", {
      id: subscriptionId,
    });

    this.subscriptions.delete(destination);
    this.lastDataReceived.delete(destination);
    console.log(`구독 해제: ${destination}`);
  }

  // 하트비트 시작
  startHeartbeat() {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        console.log(
          `[${new Date().toLocaleTimeString()}] 하트비트: WebSocket 연결 유지 중`
        );
        // 하트비트 프레임 전송 (빈 프레임)
        try {
          this.ws.send("\n");
        } catch (error) {
          console.error("하트비트 전송 실패:", error);
        }
      }
    }, this.heartbeatInterval);
  }

  // 하트비트 중지
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // 구독 상태 헬스체크 시작
  startSubscriptionHealthCheck() {
    this.stopSubscriptionHealthCheck();

    this.subscriptionHealthTimer = setInterval(() => {
      this.checkSubscriptionHealth();
    }, 30000); // 30초 간격

    console.log("구독 헬스체크 시작 (30초 간격)");
  }

  // 구독 상태 헬스체크 중지
  stopSubscriptionHealthCheck() {
    if (this.subscriptionHealthTimer) {
      clearInterval(this.subscriptionHealthTimer);
      this.subscriptionHealthTimer = null;
    }
  }

  // 구독 헬스체크 수행
  checkSubscriptionHealth() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const now = new Date();
    const problemTopics = [];

    for (const [destination, lastReceived] of this.lastDataReceived.entries()) {
      const timeSinceLastData = now - lastReceived;
      if (timeSinceLastData > 30000) {
        // 30초 이상 데이터 없음
        problemTopics.push(destination);
      }
    }

    if (problemTopics.length > 0) {
      console.warn(`데이터 수신 안됨 (30초 이상): ${problemTopics.join(", ")}`);

      // 문제가 있는 토픽들을 재구독
      problemTopics.forEach((destination) => {
        if (this.subscriptions.has(destination)) {
          const callback = this.subscriptions.get(destination);
          console.log(`재구독 시도: ${destination}`);
          this.subscribe(destination, callback);
        }
      });
    }
  }

  // 재연결 스케줄링
  scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(
        `최대 재연결 시도 횟수 초과 (${this.maxReconnectAttempts}회)`
      );
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // 지수 백오프

    console.log(
      `${delay / 1000}초 후 재연결 시도 (${this.reconnectAttempts}/${
        this.maxReconnectAttempts
      })`
    );

    this.reconnectTimer = setTimeout(() => {
      if (this.wsUrl) {
        this.connect(this.wsUrl);
      }
    }, delay);
  }

  // 수동 재연결
  reconnect() {
    this.cleanup();
    this.reconnectAttempts = 0;
    if (this.wsUrl) {
      this.connect(this.wsUrl);
    }
  }

  // 연결 상태 확인
  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  // 정리 작업
  cleanup() {
    this.stopHeartbeat();
    this.stopSubscriptionHealthCheck();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // 연결 종료
  disconnect() {
    this.cleanup();

    if (this.ws) {
      // STOMP DISCONNECT 프레임 전송
      this.sendStompFrame("DISCONNECT", {});

      // WebSocket 연결 종료
      this.ws.close(1000, "정상 종료");
      this.ws = null;
    }

    this.subscriptions.clear();
    this.lastDataReceived.clear();
    this.reconnectAttempts = 0;
  }
}

// 전역 WebSocket 클라이언트 인스턴스
const wsClient = new WebSocketClient();
