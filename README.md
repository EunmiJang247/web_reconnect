# 가스 모니터링 시스템 (Gas Monitoring System)

순수 HTML, CSS, JavaScript로 구현된 실시간 가스 모니터링 대시보드입니다. 인터넷 연결 없이도 사용할 수 있도록 설계되었습니다.

![Gas Monitoring System](preview.png)

## 🚀 주요 기능

### 📊 실시간 모니터링

- **복합가스센서**: CO, O₂, H₂S, CO₂ 동시 모니터링
- **LEL센서**: 폭발성 가스 농도 및 온습도 모니터링
- **실시간 데이터**: WebSocket을 통한 실시간 데이터 스트리밍
- **상태 표시**: 정상/경고/위험 상태를 색상으로 구분

### ⚙️ 설정 및 관리

- **서버 설정**: IP/Port 설정 가능
- **임계치 설정**: 센서별 개별 임계치 설정
- **자동 재연결**: 연결 끊김 시 자동 재연결
- **에러 필터링**: 오류 센서 자동 제외

### 🎨 사용자 인터페이스

- **반응형 디자인**: 데스크톱/모바일 모두 지원
- **직관적 UI**: 카드 기반 레이아웃
- **한글 폰트**: Noto Sans KR, Roboto 폰트 적용
- **오프라인 지원**: 인터넷 없이도 완전 동작

## 📁 파일 구조

```
gasmonitoring_vanilla/
├── index.html              # 메인 HTML 파일
├── styles.css              # 스타일시트
├── app.js                  # 메인 애플리케이션 로직
├── sensor-info.js          # 센서 정보 및 임계치 관리
├── websocket-client.js     # WebSocket 클라이언트
├── fontawesome.css         # 아이콘 스타일 (오프라인)
├── NotoSansKR-Regular.ttf  # 한글 폰트 (Regular)
├── NotoSansKR-Bold.ttf     # 한글 폰트 (Bold)
├── Roboto-Regular.ttf      # 영문 폰트 (Regular)
├── Roboto-Bold.ttf         # 영문 폰트 (Bold)
└── README.md               # 문서
```

## 🛠️ 설치 및 실행

### 방법 1: 직접 파일 열기

1. `index.html` 파일을 브라우저로 드래그앤드롭
2. 또는 브라우저에서 `파일 > 열기`로 index.html 선택

### 방법 2: 로컬 서버 사용

```bash
# Python이 설치된 경우
python -m http.server 3000

# Node.js가 설치된 경우
npx serve .

# VS Code Live Server 확장 사용
# 우클릭 > "Open with Live Server"
```

### 방법 3: 웹 서버에 배포

모든 파일을 웹 서버 디렉토리에 복사

## ⚡ 사용 방법

### 1. 서버 설정

1. 우측 상단의 ⚙️ **설정** 버튼 클릭
2. 서버 IP와 Port 입력 (예: `192.168.0.224:8081`)
3. **저장** 클릭

### 2. 센서 모니터링

- 각 센서 카드에서 실시간 가스 농도 확인
- 상태 색상으로 위험도 파악:
  - 🟢 **정상**: 안전 범위
  - 🟡 **경고**: 주의 필요
  - 🔴 **위험**: 즉시 조치 필요

### 3. 임계치 설정

1. 센서 카드의 🎛️ 버튼 클릭
2. 가스별 임계치 값 설정
3. **저장** 클릭

## 🔧 서버 API 요구사항

### 센서 목록 API

```
GET /api/sensor/mappings
Response: {
  code: 200,
  message: "성공",
  data: {
    sensors: [
      {
        portName: "COM13",
        modelName: "UA58-KFG-U",
        serialNumber: "25090200"
      }
    ]
  }
}
```

### WebSocket 연결

```
ws://서버IP:포트/ws/sensor

구독 토픽: /topic/sensor/{modelName}/{portName}/{serialNumber}

데이터 형식:
{
  "co": "5",
  "o2": "20.35",
  "h2s": "0",
  "co2": "1116",
  "alarmResult": {
    "alarmLevel": "NORMAL",
    "messages": []
  }
}
```

## 🎯 지원 센서 타입

### 복합가스센서

- **CO (일산화탄소)**: 0~30 ppm (정상)
- **O₂ (산소)**: 20~22% (정상)
- **H₂S (황화수소)**: 0~5 ppm (정상)
- **CO₂ (이산화탄소)**: 0~1500 ppm (정상)

### LEL센서

- **LEL (폭발한계)**: 0~10% (정상)
- **온도**: 환경 온도
- **습도**: 환경 습도

## 🌐 브라우저 호환성

- ✅ Chrome 80+
- ✅ Firefox 75+
- ✅ Safari 13+
- ✅ Edge 80+

## 📝 주요 특징

### 오프라인 지원

- 외부 CDN 의존성 제거
- 로컬 폰트 파일 사용
- 인터넷 없는 환경에서도 완전 동작

### 에러 처리

- 네트워크 연결 오류 자동 감지
- 센서 오류 자동 필터링
- 재연결 및 재구독 메커니즘

### 성능 최적화

- 효율적인 WebSocket 관리
- 메모리 누수 방지
- 반응형 레이아웃

## 🔄 업데이트 내역

### v1.0.0 (2025-10-22)

- ✨ 초기 릴리스
- 🚀 실시간 가스 모니터링 기능
- ⚙️ 센서별 임계치 설정
- 🎨 반응형 UI 디자인
- 📱 오프라인 지원

## 📞 문의사항

프로젝트 관련 문의사항이 있으시면 이슈를 등록해 주세요.

---

**⚠️ 주의사항**: 실제 산업 환경에서 사용시 센서 교정 및 안전 기준을 반드시 확인하시기 바랍니다.
