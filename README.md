# PC방 모니터 - React Native 앱

## 설치 및 실행

### 1. 필수 설치
```bash
# Node.js 설치 후
npm install -g expo-cli

# 패키지 설치
npm install
```

### 2. 앱 실행
```bash
# 개발 서버 시작
npx expo start

# Android 에뮬레이터
npx expo start --android

# iOS 시뮬레이터 (Mac 전용)
npx expo start --ios
```

### 3. 실제 기기 테스트
- 스마트폰에 **Expo Go** 앱 설치
- `npx expo start` 후 QR코드 스캔

### 4. APK 빌드 (Android)
```bash
# EAS CLI 설치
npm install -g eas-cli

# EAS 로그인
eas login

# 빌드 설정
eas build:configure

# APK 빌드
eas build --platform android --profile preview
```

### 5. iOS 빌드
```bash
eas build --platform ios
```

## 서버 URL 변경
`src/context/AuthContext.js` 파일에서:
```js
const API_URL = 'https://your-server-url.cloudtype.app';
```

## 기능 목록
- ✅ 로그인 / 회원가입
- ✅ 모니터 탭 (실시간 IP 핑 체크)
- ✅ 통계 탭 (일별/시간대별/월별/연별)
- ✅ 지도 탭 (업체 핀 찍기)
- ✅ 설정 탭 (업체/IP 관리)
- ✅ 구독 탭 (플랜 안내)
- ✅ 관리자 탭 (회원 관리)
