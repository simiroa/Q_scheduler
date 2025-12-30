# 📅 Quantum Scheduler (퀀텀 스케줄러)

![Version](https://img.shields.io/badge/Version-8.28-blue?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Stable-green?style=for-the-badge)
![Platform](https://img.shields.io/badge/Platform-Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white)

**퀀텀 스케줄러**는 로컬 네트워크를 기반으로 여러 기기(PC, 스마트폰, 태블릿)에서 실시간으로 협업할 수 있는 **강력한 일정 관리 솔루션**입니다.
복잡한 클라우드 설정 없이, 실행 즉시 나만의 로컬 서버가 시작됩니다.

---

## 📥 다운로드 및 설치 (Download)

이 프로젝트의 설치 파일(`.exe`)은 **GitHub Releases** 페이지에서 제공됩니다.

### 👉 [최신 버전 다운로드 하러 가기 (Click)](https://github.com/simiroa/Q_scheduler/releases)

1.  위 링크를 클릭하여 **Releases** 페이지로 이동합니다.
2.  가장 최신 버전(Latest)의 `Assets` 항목을 클릭합니다.
3.  **`QuantumScheduler_Setup.exe`** 파일을 다운로드하여 실행하세요.

---

## ✨ 주요 기능 (Key Features)

*   **⚡ 초간편 실행:** 설치 후 실행만 하면 자동으로 서버가 시작됩니다.
*   **🔗 멀티 디바이스 지원:** PC에서 켜두고, 침대에서 스마트폰으로 내일 일정을 확인하세요.
*   **🛡️ 자동 포트 감지:** `8088` 포트가 사용 중이라구요? 걱정 마세요. 알아서 빈 포트(`8089`~)를 찾아 실행합니다.
*   **💾 안전한 데이터:** 모든 데이터는 내 컴퓨터(`Documents`)에 안전하게 저장됩니다. 클라우드 해킹 걱정이 없습니다.
*   **🎨 직관적인 UI:** 드래그 앤 드롭으로 일정을 쉽게 수정하고 관리하세요.

---

## 🚀 사용 가이드 (User Guide)

### 1. 프로그램 실행 (Server)
*   프로그램을 실행하면 **시스템 트레이(우측 하단 시계 옆)**에 파란 아이콘이 나타납니다.
*   자동으로 웹 브라우저가 열리며 스케줄러가 시작됩니다.

### 2. 스마트폰/태블릿 연결 (Connect)
1.  트레이 아이콘을 **우클릭** 합니다.
2.  **`Copy Network Address`** 메뉴를 클릭합니다. (주소가 클립보드에 복사됩니다)
3.  카카오톡 등으로 주소를 내 폰에 보낸 뒤, 모바일 브라우저에서 접속합니다.
    *   *예시: `http://192.168.0.93:8088`*

---

## ⚠️ 접속 문제 해결 (Troubleshooting)

스마트폰에서 접속이 안 되나요? 99%는 **네트워크 설정** 문제입니다.

### ✅ 체크리스트 1: 같은 와이파이인가요?
*   서버 PC와 스마트폰은 **반드시 100% 같은 공유기(Wi-Fi)**에 연결되어 있어야 합니다.
*   (PC는 랜선, 폰은 와이파이라도 **같은 공유기**라면 OK!)
*   폰의 **LTE/5G 데이터를 잠시 끄고** 시도해 보세요.

### ✅ 체크리스트 2: 윈도우 방화벽 (★중요★)
윈도우가 현재 연결된 인터넷을 **'공용(Public)'**으로 착각하면 외부 접속을 막습니다.

1.  윈도우 `설정` > `네트워크 및 인터넷`으로 이동합니다.
2.  현재 연결된 네트워크(`이더넷` 또는 `Wi-Fi`) 속성을 클릭합니다.
3.  네트워크 프로필 유형을 **[개인 (Private)]**으로 변경하세요.

---

## 🛠️ 고급 정보

*   **데이터 저장 위치:** 설치 폴더 내 `server/list`
*   **포트 변경:** 자동으로 수행되나, `server/server_port.txt`에서 현재 포트를 확인할 수 있습니다.
*   **개발자 문의:** 이슈 탭을 이용해 주세요.

---
Copyright © 2024 Quantum Scheduler. All rights reserved.
