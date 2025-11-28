# 가스 모니터링 시스템 - 코드 구조

## 📁 파일 구조

```
web_reconnect/
├── index.html              # 메인 HTML 파일
├── styles.css              # 스타일시트
├── fontawesome.css         # 아이콘 라이브러리
├── sensor-info.js          # 센서 정보 유틸리티
├── websocket-client.js     # WebSocket 클라이언트
│
├── js/                     # 모듈화된 JavaScript 파일들
│   ├── config.js           # 전역 변수 및 설정
│   ├── main.js             # 메인 초기화 및 실행
│   ├── utils.js            # 유틸리티 함수
│   ├── storage.js          # 로컬 스토리지 관리
│   ├── ui-state.js         # UI 상태 관리
│   ├── ui-render.js        # UI 렌더링
│   ├── modal.js            # 모달 및 설정 관리
│   ├── threshold.js        # 임계치 설정 관리
│   ├── sensor-data.js      # 센서 데이터 업데이트
│   ├── sensor-health.js    # 센서 헬스 체크
│   ├── websocket.js        # WebSocket 관리
│   └── alarm.js            # 알람 시스템 (경광등)
```

## 📚 모듈 설명

### 1. **config.js** - 전역 변수 및 설정

- 센서 데이터 저장 변수 (sensors, sensorGroups, lelSensors 등)
- 서버 설정 (serverIp, serverPort)
- 알람 상태 관리 변수
- DOM 요소 참조

### 2. **main.js** - 메인 초기화

- 페이지 로드 시 초기화 함수 실행
- 페이지 종료 시 정리 작업

### 3. **utils.js** - 유틸리티 함수

- 로그 출력 함수
- 공통 헬퍼 함수

### 4. **storage.js** - 로컬 스토리지 관리

- 센서 이름 저장/로드
- 임계치 설정 저장/로드
- 알람 마스터 설정 저장/로드

### 5. **ui-state.js** - UI 상태 관리

- DOM 요소 초기화
- 로딩/에러/그리드 상태 전환
- 연결 상태 업데이트

### 6. **ui-render.js** - UI 렌더링

- 센서 카드 렌더링
- LEL 센서 카드 생성
- 복합가스 센서 카드 생성
- 시스템 상태 배너 업데이트

### 7. **modal.js** - 모달 관리

- 설정 모달 열기/닫기
- 이벤트 리스너 설정
- 센서 이름 편집

### 8. **threshold.js** - 임계치 관리

- 임계치 모달 열기/닫기
- 임계치 저장/로드
- 알람 메시지 레벨 분석

### 9. **sensor-data.js** - 센서 데이터

- 센서 데이터 업데이트
- 센서 정보 로딩
- 센서 목록 리셋

### 10. **sensor-health.js** - 센서 헬스 체크

- 센서 응답 모니터링
- 센서 목록 변경 감지
- 비정상 센서 정리

### 11. **websocket.js** - WebSocket 관리

- WebSocket 연결/재연결
- 센서 구독 관리
- 자동 재연결 로직

### 12. **alarm.js** - 알람 시스템

- 위험 상태 감지 및 처리
- 경광등 API 호출 (3회 연속)
- 알람 마스터 스위치 제어
- 전체 안전 상태 확인

## 🔄 데이터 흐름

```
1. 초기화 (main.js)
   ↓
2. 센서 정보 로딩 (sensor-data.js)
   ↓
3. WebSocket 연결 (websocket.js)
   ↓
4. 센서 구독 시작
   ↓
5. 데이터 수신 → 업데이트 (sensor-data.js)
   ↓
6. UI 렌더링 (ui-render.js)
   ↓
7. 안전 상태 확인 (alarm.js)
   ↓
8. 필요시 경광등 제어
```

## 🎯 주요 기능 흐름

### 센서 데이터 업데이트

1. WebSocket에서 데이터 수신 (`websocket.js`)
2. JSON 파싱 및 처리 (`sensor-data.js`)
3. 알람 메시지 생성 (임계치 기반)
4. UI 카드 렌더링 (`ui-render.js`)
5. 시스템 상태 배너 업데이트

### 알람 제어

1. 센서 데이터로 안전 상태 확인 (`alarm.js`)
2. 위험 감지 → `handleDangerousState()`
3. 경광등 API 호출 3회
4. 안전 복귀 → `handleSafeState()`

### 임계치 설정

1. 임계치 모달 열기 (`threshold.js`)
2. 사용자 입력
3. localStorage에 저장 (`storage.js`)
4. 즉시 UI 반영

## 🚀 개선 사항

### 기존 문제점

- 2040줄의 단일 파일 (app.js)
- 가독성 저하
- 유지보수 어려움

### 해결 방법

- **12개 모듈**로 분리
- **기능별 명확한 역할** 분담
- **의존성 순서** 명확화
- **코드 재사용성** 향상

## 📝 주의사항

1. **스크립트 로딩 순서가 중요합니다!**

   - `index.html`의 스크립트 순서를 변경하지 마세요
   - 의존성 순서: config → utils → storage → ... → main

2. **전역 변수 접근**

   - 모든 모듈이 `config.js`의 전역 변수에 접근 가능

3. **localStorage 키**
   - `sensorCustomNames`: 센서 이름
   - `sensorThresholds`: 임계치 설정
   - `alarmMasterEnabled`: 알람 마스터 스위치

## 🔧 유지보수 가이드

### 새로운 기능 추가 시

1. 적절한 모듈 파일 선택 (또는 새로 생성)
2. 필요한 전역 변수는 `config.js`에 추가
3. `index.html`에 스크립트 추가 (순서 주의)

### 버그 수정 시

1. 문제 발생 모듈 파악
2. 해당 모듈만 수정
3. 다른 모듈에 영향 확인
