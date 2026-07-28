#!/usr/bin/env python3
"""
Quantum Scheduler - Shared Network Server
중앙 서버PC에서 실행하여 데이터를 공유하는 역할을 합니다.
"""

import http.server
import json
import os
import re
import sys
from urllib.parse import urlparse, unquote
from datetime import datetime

def safe_filename(name):
    """Sanitize filename while preserving Korean and common characters"""
    # Remove only truly dangerous filesystem characters
    cleaned = re.sub(r'[<>:"/\\|?*]', '', name)
    cleaned = cleaned.strip()
    return cleaned if cleaned else "untitled"


PORT = int(os.environ.get("PORT", 8088))

# Fix for PyInstaller (Frozen) Environment
if getattr(sys, 'frozen', False):
    # If frozen, sys.executable is the exe path.
    # We want data to be in the folder where the exe is installed + /server
    # e.g., C:\Program Files\Quantum Scheduler\server
    BASE_DIR = os.path.dirname(sys.executable)
    DATA_DIR = os.path.join(BASE_DIR, 'server')
else:
    # If running as script, use the script's directory
    DATA_DIR = os.path.dirname(os.path.abspath(__file__))

# Ensure DATA_DIR exists
if not os.path.exists(DATA_DIR):
    try:
        os.makedirs(DATA_DIR)
    except OSError:
        pass 

# Static files live next to the data (standard deployment)
STATIC_DIR = None
possible_paths = [DATA_DIR]

# If frozen, we might have bundled static files in temp (MEI) but we want to serve them.
if getattr(sys, 'frozen', False):
    # PyInstaller temp folder for bundled resources
    try:
        BUNDLE_DIR = sys._MEIPASS
        possible_paths.append(os.path.join(BUNDLE_DIR, 'server'))
    except AttributeError:
        pass

for path in possible_paths:
    if os.path.exists(os.path.join(path, "index.html")):
        STATIC_DIR = os.path.abspath(path)
        break

if STATIC_DIR is None:
    print("[ERROR] Cannot find index.html!")
    print("Please place index.html, script.js, style.css in the server folder.")
    STATIC_DIR = DATA_DIR  # Fallback

SCHEDULE_FILE = os.path.join(DATA_DIR, "schedule.json")

# Project JSON files are stored in "list" subfolder
LIST_DIR = os.path.join(DATA_DIR, "list")
if not os.path.exists(LIST_DIR):
    try:
        os.makedirs(LIST_DIR)
    except OSError:
        pass


class SchedulerHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)
    
    def do_GET(self):
        parsed = urlparse(self.path)
        
        # API: List all projects
        if parsed.path == "/api/projects":
            self.list_projects()
            return
            
        # API: Load specific project
        if parsed.path.startswith("/api/project/"):
            project_name = unquote(parsed.path.replace("/api/project/", ""))
            self.load_project(project_name)
            return

        # Redirect root to index.html
        if parsed.path == "/" or parsed.path == "":
            self.path = "/index.html"
        
        # Serve static files from scheduler directory
        return super().do_GET()
    
    def do_POST(self):
        parsed = urlparse(self.path)
        
        # API: Save specific project
        if parsed.path.startswith("/api/project/"):
            project_name = unquote(parsed.path.replace("/api/project/", ""))
            self.save_project(project_name)
            return

        self.send_error(404, "Not Found")

    def do_DELETE(self):
        parsed = urlparse(self.path)
        
        # API: Delete project
        if parsed.path.startswith("/api/project/"):
            project_name = unquote(parsed.path.replace("/api/project/", ""))
            self.delete_project(project_name)
            return

        # API: Delete all projects
        if parsed.path == "/api/projects":
            self.delete_all_projects()
            return
        
        self.send_error(404, "Not Found")

    def do_PUT(self):
        parsed = urlparse(self.path)
        
        # API: Rename project
        if parsed.path.startswith("/api/project/"):
            project_name = unquote(parsed.path.replace("/api/project/", ""))
            self.rename_project(project_name)
            return
        
        self.send_error(404, "Not Found")

    def send_json(self, data):
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode("utf-8"))

    def list_projects(self):
        """List all project files in the data directory"""
        try:
            projects = []
            if os.path.exists(LIST_DIR):
                for file in os.listdir(LIST_DIR):
                    if file.endswith(".json") and file != "schedule.json":
                        filepath = os.path.join(LIST_DIR, file)
                        stat = os.stat(filepath)
                        projects.append({
                            "name": file.replace(".json", ""),
                            "filename": file,
                            "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                            "size": stat.st_size
                        })
            # Sort by modification time (newest first)
            projects.sort(key=lambda x: x["modified"], reverse=True)
            self.send_json({"projects": projects})
        except Exception as e:
            self.send_error(500, str(e))

    def load_project(self, project_name):
        """Load a specific project file"""
        try:
            safe_name = safe_filename(project_name)
            filepath = os.path.join(LIST_DIR, f"{safe_name}.json")

            
            if os.path.exists(filepath):
                with open(filepath, "r", encoding="utf-8") as f:
                    data = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(data.encode("utf-8"))
            else:
                self.send_json({"error": "Project not found", "name": project_name})
        except Exception as e:
            self.send_error(500, str(e))

    def save_project(self, project_name):
        """Save to a specific project file"""
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            incoming_data = json.loads(body.decode("utf-8"))
            
            # Sanitize filename (preserves Korean)
            safe_name = safe_filename(project_name)
            filepath = os.path.join(LIST_DIR, f"{safe_name}.json")
            
            # Write new data
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(incoming_data, f, ensure_ascii=False, indent=2)
            
            save_time = incoming_data.get("saveDate") or datetime.now().isoformat()
            
            self.send_json({"success": True, "saved": save_time, "filename": f"{safe_name}.json"})
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Project '{safe_name}' saved.")
            
        except Exception as e:
            print(f"Error saving project: {e}")
            self.send_error(500, str(e))

    def delete_project(self, project_name):
        """Delete a project file"""
        try:
            safe_name = safe_filename(project_name)
            filepath = os.path.join(LIST_DIR, f"{safe_name}.json")
            
            if os.path.exists(filepath):
                os.remove(filepath)
                self.send_json({"success": True, "deleted": project_name})
                print(f"[{datetime.now().strftime('%H:%M:%S')}] Project '{safe_name}' deleted.")
            else:
                self.send_json({"success": False, "error": "Project not found"})
        except Exception as e:
            print(f"Error deleting project: {e}")
            self.send_error(500, str(e))

    def rename_project(self, project_name):
        """Rename a project file"""
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode("utf-8"))
            new_name = data.get("newName", "").strip()
            
            if not new_name:
                self.send_json({"success": False, "error": "New name required"})
                return
            
            safe_old = safe_filename(project_name)
            safe_new = safe_filename(new_name)
            
            old_path = os.path.join(LIST_DIR, f"{safe_old}.json")
            new_path = os.path.join(LIST_DIR, f"{safe_new}.json")
            
            if os.path.exists(old_path):
                os.rename(old_path, new_path)
                self.send_json({"success": True, "oldName": safe_old, "newName": safe_new})
                print(f"[{datetime.now().strftime('%H:%M:%S')}] Project renamed: '{safe_old}' -> '{safe_new}'")
            else:
                self.send_json({"success": False, "error": "Project not found"})
        except Exception as e:
            print(f"Error renaming project: {e}")
            self.send_error(500, str(e))

    def delete_all_projects(self):
        """Delete all project files in the list directory"""
        try:
            count = 0
            # Remove all files in the LIST_DIR
            if os.path.exists(LIST_DIR):
                for file in os.listdir(LIST_DIR):
                    if file.endswith(".json"):
                        os.remove(os.path.join(LIST_DIR, file))
                        count += 1
            
            # Also reset default schedule if it exists
            if os.path.exists(SCHEDULE_FILE):
                os.remove(SCHEDULE_FILE)
                count += 1
            
            self.send_json({"success": True, "deleted_count": count})
            print(f"[{datetime.now().strftime('%H:%M:%S')}] All {count} projects/data deleted.")
        except Exception as e:
            print(f"Error deleting all projects: {e}")
            self.send_error(500, str(e))



def get_local_ip():
    """Get local IP address for network access"""
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "127.0.0.1"

def setup_logging():
    """Redirect stdout/stderr to a log file when frozen (no console attached)."""
    # Running as a script keeps the terminal output — redirecting it only hurts development.
    if getattr(sys, 'frozen', False):
        log_path = os.path.join(os.path.dirname(sys.executable), 'server_debug.log')
        sys.stdout = sys.stderr = open(log_path, 'a', encoding='utf-8', buffering=1)
    print(f"[{datetime.now()}] Server Process Started")
    print(f"[{datetime.now()}] Python: {sys.version}")

setup_logging()


def run():
    try:
        # Ensure we are in the script's directory (or DATA_DIR)
        print(f"[{datetime.now()}] run() called")
        print(f"[{datetime.now()}] DATA_DIR: {DATA_DIR}")
        print(f"[{datetime.now()}] STATIC_DIR: {STATIC_DIR}")
        
        if os.path.exists(DATA_DIR):
            os.chdir(DATA_DIR)
            print(f"[{datetime.now()}] Changed CWD to: {os.getcwd()}")
        
        # Handler wrapping to catch request errors
        class LoggingHandler(SchedulerHandler):
            def log_message(self, format, *args):
                print(f"[{datetime.now()}] {format % args}")
            
            def log_error(self, format, *args):
                print(f"[{datetime.now()}] ERROR: {format % args}")

        # Try to find an available port
        httpd = None
        bound_port = None
        
        # Try ports from PORT to PORT+10
        for try_port in range(PORT, PORT + 10):
            try:
                print(f"[{datetime.now()}] Attempting to bind to port {try_port}...")
                server_instance = http.server.ThreadingHTTPServer(("", try_port), LoggingHandler)
                httpd = server_instance
                bound_port = try_port
                break
            except OSError as e:
                print(f"[{datetime.now()}] Port {try_port} is busy ({e}). Trying next...")
        
        if not httpd:
            raise Exception(f"Could not find an available port in range {PORT}-{PORT+9}")

        # Save the actual port to a file for tray app to read
        port_file = os.path.join(DATA_DIR, "server_port.txt")
        try:
            with open(port_file, "w") as f:
                f.write(str(bound_port))
        except Exception as e:
            print(f"[{datetime.now()}] Warning: Could not write port file: {e}")

        with httpd:
            local_ip = get_local_ip()
            print("=" * 60)
            print("  Quantum Scheduler - Shared Network Server")
            print("=" * 60)
            print(f"\n  * Local Access:   http://localhost:{bound_port}")
            print(f"  * Network Access: http://{local_ip}:{bound_port}")
            print(f"\n  Data Directory:   {DATA_DIR}")
            print(f"  Schedule File:    {SCHEDULE_FILE}")
            print("\n  [SERVER STATUS: RUNNING]")
            print("  Press Ctrl+C to stop the server.")
            print("=" * 60)
            
            httpd.serve_forever()
            
    except Exception as e:
        print(f"[{datetime.now()}] FATAL CRASH: {e}")
        import traceback
        traceback.print_exc()
        raise

if __name__ == "__main__":
    run()
