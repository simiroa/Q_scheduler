# Quantum Scheduler 설치 프로그램 빌드 가이드

## 📋 사전 준비

### Windows에서 빌드하는 경우 (권장)

1. **Python 3.7+** 설치
   - https://www.python.org/downloads/

2. **PyInstaller 및 런타임 의존성** 설치
   ```cmd
   pip install pyinstaller pystray pillow
   ```
   `tray_app.py`가 `pystray`와 `PIL`(pillow)을 import하므로, 두 패키지가 없으면 빌드된 EXE가 실행되지 않습니다.

3. **Inno Setup** 설치 (선택사항, 설치 프로그램 생성용)
   - https://jrsoftware.org/isdl.php
   - 기본 경로에 설치: `C:\Program Files (x86)\Inno Setup 6\`

### Linux/Mac에서 빌드하는 경우

- EXE 파일만 생성 가능 (설치 프로그램은 Windows 필요)
- PyInstaller만 설치하면 됨

## ⚠️ 먼저 알아둘 것: spec 파일은 저장소에 없습니다

`build_installer.py`는 `pyinstaller tray_app.spec --clean --noconfirm`을 실행하지만,
**`tray_app.spec`은 저장소에 포함되어 있지 않습니다.** `.gitignore`에 `*.spec`이 있어 추적되지
않기 때문입니다. 따라서 갓 clone한 상태에서 `python build_installer.py`를 바로 실행하면
spec 파일이 없어 실패합니다. 아래 A안(spec 생성) 또는 B안(spec 없이 직접 빌드) 중 하나를 먼저 하세요.

## 🚀 빌드 방법

### A안: spec 파일을 만든 뒤 자동 빌드

#### 1단계: `tray_app.spec` 최초 1회 생성
```cmd
pyinstaller --onefile --windowed --icon=icon.ico --add-data "server;server" tray_app.py
```
- 이 명령이 프로젝트 루트에 `tray_app.spec`을 생성합니다.
- `--add-data`의 구분자는 Windows에서 `;`, Linux/Mac에서는 `:`입니다.

#### 2단계: spec 다듬기 (필수)
1단계 결과물은 `dist/tray_app.exe`입니다. 하지만 `build_installer.py`와 `installer.iss`는
**`dist/QuantumScheduler.exe`**를 기대하므로, 생성된 `tray_app.spec`의 `EXE(...)` 블록에서
`name='tray_app'`을 `name='QuantumScheduler'`로 바꾸세요.

#### 3단계: 자동 빌드
```cmd
python build_installer.py
```

이 스크립트가:
1. 필수 도구 확인 (PyInstaller, `icon.ico`, `server/index.html`, Inno Setup)
2. `build/`, `dist/` 정리 후 `pyinstaller tray_app.spec --clean --noconfirm` 실행
3. Inno Setup이 있으면 `ISCC.exe installer.iss` 실행

### B안: spec 없이 한 번에 빌드

```cmd
pyinstaller --onefile --windowed --name QuantumScheduler --icon=icon.ico --add-data "server;server" tray_app.py
```

`dist/QuantumScheduler.exe`가 바로 나옵니다. 설치 프로그램은 별도로:

```cmd
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer.iss
```

(`--name QuantumScheduler`를 쓰면 생성되는 spec 파일명도 `QuantumScheduler.spec`이 되므로,
`build_installer.py`가 찾는 `tray_app.spec`과는 이름이 다릅니다. 자동 빌드를 쓰려면 A안을 따르세요.)

## 📦 생성되는 파일

### `dist/QuantumScheduler.exe`
- 독립 실행형 EXE (약 30-40MB)
- Python 런타임 포함
- 모든 정적 파일 번들링
- 더블클릭으로 즉시 실행 가능

### `dist/QuantumScheduler_Setup.exe`
- 전문적인 설치 프로그램 (약 35-45MB)
- 설치 마법사 UI
- 시작 메뉴 바로가기 생성
- 자동 시작 옵션
- 제거 프로그램 등록

## 🎯 배포 방법

### 옵션 1: 독립 실행형 (간단)
1. `QuantumScheduler.exe` 파일만 배포
2. 사용자가 원하는 위치에 복사
3. 더블클릭으로 실행 (트레이 아이콘 상주 + 서버 자동 시작 + 브라우저 자동 열림)
4. 수동 접속 시 `http://localhost:8088` — 8088이 사용 중이면 서버가 8089~8097 중 빈 포트로 뜨며,
   실제 포트는 `server/server_port.txt`에 기록되고 트레이 알림에도 표시됩니다.

### 옵션 2: 설치 프로그램 (권장)
1. `QuantumScheduler_Setup.exe` 배포
2. 사용자가 실행하여 설치
3. 시작 메뉴에서 실행
4. 자동으로 브라우저 열림

## 🔧 커스터마이징

### 앱 아이콘 변경
1. `icon.ico` 파일 준비 (256x256 권장)
2. 프로젝트 루트에 배치
3. 다시 빌드

### 버전 정보 수정
- `installer.iss` 파일에서 `MyAppVersion` 수정

### 설치 경로 변경
- `installer.iss` 파일에서 `DefaultDirName` 수정

## ⚠️ 문제 해결

### "PyInstaller를 찾을 수 없습니다"
```cmd
pip install --upgrade pyinstaller
```

### "tray_app.spec을 찾을 수 없습니다" / 자동 빌드가 바로 실패함
- spec 파일은 저장소에 없습니다 (`.gitignore`의 `*.spec`). 위 A안 1~2단계로 먼저 생성하세요.

### "정적 파일을 찾을 수 없습니다"
- `server/` 디렉토리가 올바른 위치에 있는지 확인
- `tray_app.spec`의 `datas` 항목에 `server` 폴더가 들어있는지 확인
  (spec 없이 빌드했다면 `--add-data "server;server"` 누락 여부 확인)

### "Inno Setup을 찾을 수 없습니다"
- Inno Setup 설치 경로 확인
- `build_installer.py`의 `inno_path` 수정

### 실행 시 포트 충돌
- `server.py`는 `PORT` 환경 변수(기본 `8088`)부터 시작해 `PORT+9`까지 순차적으로 시도하므로
  8088이 막혀 있어도 대개 알아서 뜹니다.
- 시작 포트 자체를 바꾸려면 환경 변수 `PORT`를 설정하세요.
- 실제로 바인딩된 포트는 `server/server_port.txt`에서 확인할 수 있습니다.
- 참고: `installer.iss`의 방화벽 규칙은 8088 고정이므로, 다른 포트로 뜨면 외부 접속이 막힐 수 있습니다.

## 📝 참고사항

- **첫 실행 시간**: EXE 압축 해제로 인해 첫 실행이 느릴 수 있음
- **콘솔 창 없이 실행**: PyInstaller `--windowed`로 빌드하고, 트레이 앱이 서버 프로세스를
  `CREATE_NO_WINDOW`로 띄우기 때문입니다.
  (설정 모달에서 받을 수 있는 `install_startup.bat`은 별개로 VBScript 방식의 시작프로그램 등록 스크립트입니다.)
- **데이터 저장**: `server/list/` 폴더에 JSON 파일로 저장
- **로그**: 서버 표준출력은 EXE(또는 프로젝트 루트) 옆의 `server_debug.log`에 기록됨
- **업데이트**: 새 버전 설치 시 기존 데이터 유지됨

## 🎓 고급 옵션

아래 항목은 A안으로 만든 `tray_app.spec`을 편집해 조정합니다.

### UPX 압축 비활성화 (빠른 시작)
`tray_app.spec`에서 `upx=False` 설정

### 콘솔 창 표시 (디버깅용)
`tray_app.spec`에서 `console=True` 설정

### 단일 폴더 모드
`tray_app.spec`에서 `EXE(...)`/`COLLECT(...)` 구성을 onedir로 바꾸거나,
`--onefile` 대신 `--onedir`로 spec을 다시 생성
