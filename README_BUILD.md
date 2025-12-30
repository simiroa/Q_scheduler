# Quantum Scheduler 설치 프로그램 빌드 가이드

## 📋 사전 준비

### Windows에서 빌드하는 경우 (권장)

1. **Python 3.7+** 설치
   - https://www.python.org/downloads/

2. **PyInstaller** 설치
   ```cmd
   pip install pyinstaller
   ```

3. **Inno Setup** 설치 (선택사항, 설치 프로그램 생성용)
   - https://jrsoftware.org/isdl.php
   - 기본 경로에 설치: `C:\Program Files (x86)\Inno Setup 6\`

### Linux/Mac에서 빌드하는 경우

- EXE 파일만 생성 가능 (설치 프로그램은 Windows 필요)
- PyInstaller만 설치하면 됨

## 🚀 빌드 방법

### 자동 빌드 (권장)

```cmd
python build_installer.py
```

이 스크립트가 자동으로:
1. 필수 도구 확인
2. EXE 파일 생성
3. 설치 프로그램 생성 (Windows + Inno Setup 있는 경우)

### 수동 빌드

#### 1단계: EXE 생성
```cmd
pyinstaller server.spec --clean
```

#### 2단계: 설치 프로그램 생성 (Windows만)
```cmd
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer.iss
```

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
3. 더블클릭으로 실행
4. 브라우저에서 `http://localhost:8088` 접속

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

### "정적 파일을 찾을 수 없습니다"
- `server/` 디렉토리가 올바른 위치에 있는지 확인
- `server.spec` 파일의 경로 확인

### "Inno Setup을 찾을 수 없습니다"
- Inno Setup 설치 경로 확인
- `build_installer.py`의 `inno_path` 수정

### 실행 시 "포트가 이미 사용 중입니다"
- 다른 프로그램이 8088 포트 사용 중
- `server.py`에서 포트 변경 또는
- 환경 변수 `PORT` 설정

## 📝 참고사항

- **첫 실행 시간**: EXE 압축 해제로 인해 첫 실행이 느릴 수 있음
- **백그라운드 실행**: VBScript 방식으로 CMD 창 없이 실행
- **데이터 저장**: `server/list/` 폴더에 JSON 파일로 저장
- **업데이트**: 새 버전 설치 시 기존 데이터 유지됨

## 🎓 고급 옵션

### UPX 압축 비활성화 (빠른 시작)
`server.spec`에서 `upx=False` 설정

### 콘솔 창 표시 (디버깅용)
`server.spec`에서 `console=True` 설정

### 단일 폴더 모드
`server.spec`에서 `--onefile` 대신 `--onedir` 사용
