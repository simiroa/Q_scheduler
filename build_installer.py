#!/usr/bin/env python3
"""
Quantum Scheduler 설치 프로그램 빌드 스크립트

이 스크립트는 다음 작업을 자동화합니다:
1. PyInstaller로 EXE 생성
2. Inno Setup으로 설치 프로그램 생성
"""

import os
import sys
import subprocess
import shutil

def check_requirements():
    """필수 도구 확인"""
    print("🔍 필수 도구 확인 중...")
    
    # PyInstaller 확인 (명령줄로 확인)
    try:
        result = subprocess.run(['pyinstaller', '--version'], 
                              capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            print(f"✅ PyInstaller 설치됨 (v{result.stdout.strip()})")
        else:
            raise Exception("PyInstaller not found")
    except:
        print("❌ PyInstaller가 설치되지 않았습니다.")
        print("   설치: pip install pyinstaller")
        return False
    
    # 아이콘 파일 확인
    if not os.path.exists('icon.ico'):
        print("⚠️  icon.ico 파일이 없습니다.")
        print("   기본 아이콘이 사용됩니다.")
    else:
        print("✅ 아이콘 파일 발견")
    
    # 정적 파일 확인
    if not os.path.exists('server/index.html'):
        print("❌ server/index.html을 찾을 수 없습니다.")
        return False
    else:
        print("✅ 정적 파일 확인됨")
    
    # Inno Setup 확인 (Windows만)
    if sys.platform == 'win32':
        inno_path = r"C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
        if not os.path.exists(inno_path):
            print("⚠️  Inno Setup이 설치되지 않았습니다.")
            print("   다운로드: https://jrsoftware.org/isdl.php")
            print("   (선택사항: EXE만 생성하려면 계속 진행 가능)")
        else:
            print("✅ Inno Setup 설치됨")
    
    return True

def build_exe():
    """PyInstaller로 EXE 빌드"""
    print("\n📦 EXE 파일 생성 중...")
    
    # 이전 빌드 정리
    if os.path.exists('build'):
        shutil.rmtree('build')
    if os.path.exists('dist'):
        shutil.rmtree('dist')
    
    # PyInstaller 실행 (트레이 앱 사용)
    cmd = ['pyinstaller', 'tray_app.spec', '--clean', '--noconfirm']
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode == 0:
        print("✅ EXE 생성 완료: dist/QuantumScheduler.exe")
        print("   (시스템 트레이 아이콘 기능 포함)")
        return True
    else:
        print("❌ EXE 생성 실패:")
        print(result.stderr)
        return False

def build_installer():
    """Inno Setup으로 설치 프로그램 생성"""
    print("\n🎁 설치 프로그램 생성 중...")
    
    if sys.platform != 'win32':
        print("⚠️  Inno Setup은 Windows에서만 실행 가능합니다.")
        print("   Linux/Mac에서는 EXE 파일만 생성됩니다.")
        return False
    
    inno_path = r"C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
    if not os.path.exists(inno_path):
        print("⚠️  Inno Setup이 설치되지 않았습니다.")
        return False
    
    # Inno Setup 실행
    cmd = [inno_path, 'installer.iss']
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode == 0:
        print("✅ 설치 프로그램 생성 완료: dist/QuantumScheduler_Setup.exe")
        return True
    else:
        print("❌ 설치 프로그램 생성 실패:")
        print(result.stderr)
        return False

def main():
    print("=" * 60)
    print("  Quantum Scheduler 설치 프로그램 빌더")
    print("=" * 60)
    
    # 필수 도구 확인
    if not check_requirements():
        sys.exit(1)
    
    # EXE 빌드
    if not build_exe():
        print("\n❌ 빌드 실패")
        sys.exit(1)
    
    # 설치 프로그램 빌드
    build_installer()
    
    print("\n" + "=" * 60)
    print("  빌드 완료!")
    print("=" * 60)
    print("\n📁 생성된 파일:")
    print("   - dist/QuantumScheduler.exe (독립 실행형)")
    if os.path.exists('dist/QuantumScheduler_Setup.exe'):
        print("   - dist/QuantumScheduler_Setup.exe (설치 프로그램)")
    print("\n💡 사용 방법:")
    print("   1. QuantumScheduler.exe: 직접 실행")
    print("   2. QuantumScheduler_Setup.exe: 설치 후 사용")
    print("\n🌐 네트워크 기능:")
    print("   - 시스템 트레이에서 네트워크 정보 확인")
    print("   - 방화벽 규칙 자동 설정 (설치 시)")
    print("   - 다른 컴퓨터에서 접속 가능")

if __name__ == '__main__':
    main()
