#!/usr/bin/env python3
"""
Quantum Scheduler - System Tray Application
트레이 아이콘으로 서버 제어 및 빠른 접근 제공
"""

import sys
import os
import webbrowser
import subprocess
from threading import Thread
import pystray
from PIL import Image, ImageDraw
from pystray import MenuItem as item
import ctypes
from ctypes import wintypes

# 단일 실행을 위한 상수
ERROR_ALREADY_EXISTS = 183

def create_mutex(mutex_name):
    """Create a named mutex via ctypes to ensure single instance"""
    kernel32 = ctypes.windll.kernel32
    mutex = kernel32.CreateMutexW(None, True, mutex_name)
    last_error = kernel32.GetLastError()
    return mutex, last_error

# 서버 프로세스 관리
server_process = None
server_running = False

def create_tray_icon():
    """트레이 아이콘 이미지 생성"""
    # 간단한 아이콘 생성 (파란색 원)
    width = 64
    height = 64
    image = Image.new('RGB', (width, height), color='white')
    dc = ImageDraw.Draw(image)
    dc.ellipse([8, 8, 56, 56], fill='#5e6ad2', outline='#4a5ab8')
    return image

def get_local_ip():
    """로컬 네트워크 IP 주소 가져오기"""
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "127.0.0.1"

def get_data_dir():
    if getattr(sys, 'frozen', False):
        base_dir = os.path.dirname(sys.executable)
        return os.path.join(base_dir, 'server')
    else:
        return os.path.join(os.path.dirname(os.path.abspath(__file__)), 'server')

def get_active_port():
    """Read the active port from server_port.txt"""
    try:
        port_file = os.path.join(get_data_dir(), "server_port.txt")
        if os.path.exists(port_file):
            with open(port_file, "r") as f:
                return int(f.read().strip())
    except:
        pass
    return 8088

def start_server(icon, item):
    """서버 시작"""
    global server_process, server_running
    if not server_running:
        # 실행 모드 확인 (스크립트 vs Frozen)
        if getattr(sys, 'frozen', False):
            # Frozen 상태: 자기 자신을 --server 옵션으로 실행
            server_process = subprocess.Popen(
                [sys.executable, "--server"],
                creationflags=subprocess.CREATE_NO_WINDOW # 콘솔 창 숨기기
            )
        else:
            # 스크립트 상태: server.py 실행
            server_script = os.path.join(os.path.dirname(__file__), 'server', 'server.py')
            server_process = subprocess.Popen([sys.executable, server_script])
            
        server_running = True
        
        # Give server a moment to write the port file
        import time
        time.sleep(0.5) 
        
        local_ip = get_local_ip()
        port = get_active_port()
        icon.notify(
            f'서버가 시작되었습니다\n로컬: http://localhost:{port}\n네트워크: http://{local_ip}:{port}',
            'Quantum Scheduler'
        )

def stop_server(icon, item):
    """서버 중지"""
    global server_process, server_running
    if server_running and server_process:
        server_process.terminate()
        server_process = None
        server_running = False
        icon.notify('서버가 중지되었습니다', 'Quantum Scheduler')

def open_browser(icon, item):
    """브라우저에서 열기"""
    port = get_active_port()
    webbrowser.open(f'http://localhost:{port}')

def copy_network_address(icon, item):
    """네트워크 주소를 클립보드에 복사"""
    local_ip = get_local_ip()
    port = get_active_port()
    url = f"http://{local_ip}:{port}"
    try:
        # Windows 'clip' command to copy to clipboard without external deps
        subprocess.run('clip', input=url.strip().encode('utf-16le'), check=True)
        icon.notify(f'주소가 복사되었습니다.\n{url}', 'Quantum Scheduler')
    except Exception as e:
        icon.notify(f'복사 실패: {e}', '오류')

def show_network_info(icon, item):
    """네트워크 정보 표시"""
    local_ip = get_local_ip()
    port = get_active_port()
    icon.notify(
        f'로컬 접속: http://localhost:{port}\n네트워크 접속: http://{local_ip}:{port}',
        'Quantum Scheduler - 네트워크 정보'
    )

def quit_app(icon, item):
    """애플리케이션 종료"""
    global server_process, server_running
    if server_running and server_process:
        server_process.terminate()
    icon.stop()

def setup_tray():
    """트레이 아이콘 설정"""
    icon_image = create_tray_icon()
    
    menu = pystray.Menu(
        item('웹페이지 열기', open_browser),
        item('네트워크 주소 복사', copy_network_address),
        item('네트워크 정보', show_network_info),
        pystray.Menu.SEPARATOR,
        item('서버 시작', start_server),
        item('서버 중지', stop_server),
        pystray.Menu.SEPARATOR,
        item('종료', quit_app)
    )
    
    icon = pystray.Icon('quantum_scheduler', icon_image, 'Quantum Scheduler', menu)
    
    # 자동으로 서버 시작 및 브라우저 열기
    def auto_start():
        start_server(icon, None)
        # 서버가 뜰 때까지 약간 대기 후 브라우저 열기
        import time
        time.sleep(1.0)
        open_browser(icon, None)

    Thread(target=auto_start, daemon=True).start()
    
    icon.run()

if __name__ == '__main__':
    # 시스템 인자 확인: --server 플래그가 있으면 서버 실행
    if "--server" in sys.argv:
        # 디버그 로그 설정
        if getattr(sys, 'frozen', False):
            base_dir = os.path.dirname(sys.executable)
        else:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            
        log_file = os.path.join(base_dir, 'server_debug.log')
        
        try:
            with open(log_file, 'w') as f:
                f.write(f"Starting server... args: {sys.argv}\n")
                f.write(f"CWD: {os.getcwd()}\n")
                f.write(f"sys.path: {sys.path}\n")

            # server 모듈을 import 하여 실행
            try:
                from server import server
                with open(log_file, 'a') as f:
                    f.write("Imported server module successfully.\n")
                server.run()
            except ImportError as e:
                with open(log_file, 'a') as f:
                    f.write(f"ImportError: {e}\n")
                    # 경로 문제일 수 있으므로 시도
                    sys.path.append(os.path.join(base_dir, 'server'))
                    f.write(f"Updated sys.path: {sys.path}\n")
                
                try:
                    import server
                    server.run()
                except Exception as e2:
                    with open(log_file, 'a') as f:
                        f.write(f"Retry failed: {e2}\n")
                    ctypes.windll.user32.MessageBoxW(0, f"Server Start Failed: {e}", "Quantum Scheduler Error", 0x10)
                    sys.exit(1)
                    
        except Exception as e:
            # 파일 쓰기 실패 등 치명적 오류 시 메시지 박스
            # (로그 파일 자체를 못 쓰는 경우 등)
            import traceback
            err_msg = traceback.format_exc()
            try:
                with open(log_file, 'a') as f:
                    f.write(f"Critical Error: {err_msg}\n")
            except:
                pass
            ctypes.windll.user32.MessageBoxW(0, f"Critical Server Error:\n{err_msg}", "Quantum Scheduler Error", 0x10)
            sys.exit(1)
            
        sys.exit(0)

    # --- 트레이 앱 모드 (기본) ---
    # --- 트레이 앱 모드 (기본) ---
    # 단일 실행 보장 로직
    mutex_name = "QuantumScheduler_TrayApp_Mutex_7A5B1C3D"
    mutex, last_error = create_mutex(mutex_name)
    
    if last_error == ERROR_ALREADY_EXISTS:
        # 이미 실행 중이면 종료
        sys.exit(0)
    
    setup_tray()
