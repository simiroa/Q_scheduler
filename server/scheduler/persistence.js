import { Scheduler } from './core.js';

Object.assign(Scheduler.prototype, {

    // Save current state to undo stack AND trigger auto-save
    saveState() {
        const state = JSON.stringify(this.data);
        const lastState = this.undoStack[this.undoStack.length - 1];
        if (lastState === state) {
            this.updateUndoRedoButtons();
            return;
        }
        this.undoStack.push(state);
        if (this.undoStack.length > this.maxHistory) {
            this.undoStack.shift();
        }
        this.redoStack = []; // Clear redo on new action

        // Trigger auto-save after every data change
        this.triggerAutoSave();
        this.updateUndoRedoButtons();
    },


    // Undo last action


    undo() {
        if (this.undoStack.length === 0) {
            this.updateUndoRedoButtons();
            return;
        }
        const currentState = JSON.stringify(this.data);
        this.redoStack.push(currentState);
        const prevState = this.undoStack.pop();
        this.data = JSON.parse(prevState);
        this.renderTasks();
        this.updateUndoRedoButtons();
    },

    // Redo last undone action

    redo() {
        if (this.redoStack.length === 0) {
            this.updateUndoRedoButtons();
            return;
        }
        const currentState = JSON.stringify(this.data);
        this.undoStack.push(currentState);
        const nextState = this.redoStack.pop();
        this.data = JSON.parse(nextState);
        this.renderTasks();
        this.updateUndoRedoButtons();
    },

    updateUndoRedoButtons() {
        if (!this.els?.undoBtn || !this.els?.redoBtn) return;
        this.els.undoBtn.disabled = this.undoStack.length === 0;
        this.els.redoBtn.disabled = this.redoStack.length === 0;
    },

    // Export schedule to JSON file with path selection

    async exportSchedule() {
        const exportData = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            startDate: this.config.startDate.toISOString(),
            holidays: Array.from(this.holidays),
            data: this.data
        };

        const json = JSON.stringify(exportData, null, 2);

        // Try File System Access API for path selection
        if ('showSaveFilePicker' in window) {
            try {
                const date = new Date().toISOString().split('T')[0];
                const fileHandle = await window.showSaveFilePicker({
                    suggestedName: `schedule_${date}.json`,
                    types: [{
                        description: 'JSON Files',
                        accept: { 'application/json': ['.json'] }
                    }]
                });

                const writable = await fileHandle.createWritable();
                await writable.write(json);
                await writable.close();

                // Remember this file for future saves
                this.currentFileHandle = fileHandle;
                this.updateCurrentFileInfo(fileHandle.name);

                alert('파일이 저장되었습니다: ' + fileHandle.name);
                return;
            } catch (err) {
                if (err.name === 'AbortError') return; // User cancelled
                console.log('File picker failed, using download fallback');
            }
        }

        // Fallback: download method
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const date = new Date().toISOString().split('T')[0];
        a.download = `schedule_${date}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    // Import schedule from JSON file and remember for future saves

    async importSchedule(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const importData = JSON.parse(event.target.result);

                // Validate data structure
                if (!importData.data || !Array.isArray(importData.data)) {
                    alert('유효하지 않은 스케줄 파일입니다.');
                    return;
                }

                this.saveState();

                // Load data
                this.data = importData.data;

                // Load holidays if present
                if (importData.holidays && Array.isArray(importData.holidays)) {
                    this.holidays = new Set(importData.holidays);
                }

                // Load start date if present
                if (importData.startDate) {
                    const startDate = new Date(importData.startDate);
                    if (!isNaN(startDate.getTime())) {
                        this.config.startDate = startDate;
                        this.renderTimelineStructure();
                    }
                }

                this.renderTasks();

                // Remember file name for display
                this.currentFileName = file.name;
                this.updateCurrentFileInfo(file.name);

                alert('스케줄을 성공적으로 가져왔습니다!\n저장 버튼을 누르면 이 파일에 저장됩니다.');

            } catch (err) {
                alert('파일을 읽는 중 오류가 발생했습니다:\n' + err.message);
            }
        };
        reader.readAsText(file);

        // Reset file input for re-import
        e.target.value = '';
    },

    // Create new project with name prompt

    async createNewProject() {
        const projectName = prompt('새 프로젝트 이름을 입력하세요:');
        if (!projectName || !projectName.trim()) {
            return;
        }

        if (this.data.length > 0 && !confirm('현재 스케줄을 지우고 새 프로젝트를 시작하시겠습니까?')) {
            return;
        }

        this.saveState();
        this.data = [];
        this.holidays = new Set();
        this.currentProjectName = projectName.trim();
        this.renderTasks();
        this.renderTimelineStructure();

        // Save the new project to server and update list
        await this.saveCurrentProject();
        await this.refreshProjectList();
        this.saveLastProject();
    },

    // Initialize: load project list and restore last project

    async initializeProjects() {
        await this.refreshProjectList();

        // Restore last project
        const lastProject = localStorage.getItem('lastProject');
        if (lastProject) {
            await this.loadProject(lastProject);
        }

        this.updateConnectionStatus(true);
    },

    // Refresh project dropdown list

    async refreshProjectList() {
        try {
            const res = await fetch('/api/projects');
            const data = await res.json();

            const select = document.getElementById('projectSelect');
            if (!select) return;

            // Clear existing options
            select.innerHTML = '<option value="">-- 선택하세요 --</option>';

            if (data.projects && data.projects.length > 0) {
                data.projects.forEach(p => {
                    const option = document.createElement('option');
                    option.value = p.name;
                    option.textContent = p.name;
                    if (p.name === this.currentProjectName) {
                        option.selected = true;
                    }
                    select.appendChild(option);
                });
            }

            this.updateConnectionStatus(true);
        } catch (err) {
            console.log('Failed to refresh project list:', err);
            this.updateConnectionStatus(false);
        }
    },

    // Save current project to server (called by auto-save)

    async saveCurrentProject() {
        if (!this.currentProjectName) {
            return; // No project to save
        }

        const saveData = {
            version: '1.0',
            saveDate: new Date().toISOString(),
            startDate: this.config.startDate.toISOString(),
            holidays: Array.from(this.holidays),
            data: this.data
        };

        this.updateAutoSaveStatus('saving');

        try {
            const res = await fetch(`/api/project/${encodeURIComponent(this.currentProjectName)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(saveData)
            });
            const result = await res.json();

            if (result.success) {
                this.updateAutoSaveStatus('saved');
                this.updateConnectionStatus(true);
            }
        } catch (err) {
            this.updateAutoSaveStatus('error');
            this.updateConnectionStatus(false);
        }
    },

    // Trigger auto-save with debounce

    triggerAutoSave() {
        if (!this.currentProjectName) return;

        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
        }

        this.updateAutoSaveStatus('pending');

        this.autoSaveTimeout = setTimeout(() => {
            this.saveCurrentProject();
        }, this.autoSaveDelay);
    },

    // Immediate save (clears pending timeout)

    async saveNow() {
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
            this.autoSaveTimeout = null;
        }
        await this.saveCurrentProject();
    },

    // Update save status indicator

    updateAutoSaveStatus(status) {
        const dot = document.getElementById('statusDot');
        if (!dot) return;

        dot.classList.remove('pending', 'saving', 'saved');
        dot.classList.add(status);

        switch (status) {
            case 'pending':
                dot.title = '저장 대기 중...';
                break;
            case 'saving':
                dot.title = '저장 중...';
                break;
            case 'saved':
                dot.title = '저장됨';
                break;
            case 'error':
                dot.title = '저장 실패';
                break;
        }
    },


    // Update project title display


    updateProjectTitle() {
        const titleEl = document.getElementById('projectTitle');
        if (titleEl) {
            titleEl.textContent = this.currentProjectName || '프로젝트 없음';
        }
    },


    // Load a specific project from server


    async loadProject(projectName) {
        try {
            const res = await fetch(`/api/project/${encodeURIComponent(projectName)}`);
            const data = await res.json();

            if (data.error) {
                console.log('Project not found:', projectName);
                return;
            }

            this.saveState();
            this.applyLoadedData(data);
            this.currentProjectName = projectName;
            this.saveLastProject();

            // Update dropdown selection
            const select = document.getElementById('projectSelect');
            if (select) select.value = projectName;

            this.updateConnectionStatus(true);

        } catch (err) {
            console.log('Failed to load project:', err);
            this.updateConnectionStatus(false);
        }
    },

    // Save last project name for restore

    saveLastProject() {
        if (this.currentProjectName) {
            localStorage.setItem('lastProject', this.currentProjectName);
            this.updateTitle();
            this.updateProjectTitle();
        }
    },


    // Update browser title with current project name


    updateTitle() {
        if (this.currentProjectName) {
            document.title = `${this.currentProjectName} - Quantum Scheduler`;
        } else {
            document.title = 'Quantum Scheduler';
        }
    },


    // Rename current project


    async renameCurrentProject() {
        if (!this.currentProjectName) {
            alert('먼저 프로젝트를 선택하세요.');
            return;
        }

        const newName = prompt('새 프로젝트 이름:', this.currentProjectName);
        if (!newName || !newName.trim() || newName.trim() === this.currentProjectName) {
            return;
        }

        try {
            const res = await fetch(`/api/project/${encodeURIComponent(this.currentProjectName)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newName: newName.trim() })
            });
            const result = await res.json();

            if (result.success) {
                this.currentProjectName = result.newName;
                this.saveLastProject();
                await this.refreshProjectList();
            } else {
                alert('이름 변경 실패: ' + (result.error || '알 수 없는 오류'));
            }
        } catch (err) {
            alert('서버 연결 실패: ' + err.message);
        }
    },

    // Delete current project

    async deleteCurrentProject() {
        if (!this.currentProjectName) {
            alert('먼저 프로젝트를 선택하세요.');
            return;
        }

        this.openConfirmModal({
            title: '프로젝트 삭제',
            message: `"${this.currentProjectName}" 프로젝트를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`,
            confirmText: '삭제',
            onConfirm: async () => {
                try {
                    const res = await fetch(`/api/project/${encodeURIComponent(this.currentProjectName)}`, {
                        method: 'DELETE'
                    });
                    const result = await res.json();

                    if (result.success) {
                        this.currentProjectName = null;
                        this.data = [];
                        localStorage.removeItem('lastProject');
                        this.renderTasks();
                        this.updateUndoRedoButtons();
                        await this.refreshProjectList();

                        // Reset dropdown
                        const select = document.getElementById('projectSelect');
                        if (select) select.value = '';
                    } else {
                        alert('삭제 실패: ' + (result.error || '알 수 없는 오류'));
                    }
                } catch (err) {
                    alert('서버 연결 실패: ' + err.message);
                }
            }
        });
    },

    // ========== File System Access API ==========
    // IndexedDB helpers for storing directory handle
    async openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('QuantumScheduler', 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('handles')) {
                    db.createObjectStore('handles');
                }
            };
        });
    },


    async saveDirectoryHandle(handle) {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('handles', 'readwrite');
            tx.objectStore('handles').put(handle, 'directoryHandle');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },


    async loadDirectoryHandle() {
        try {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction('handles', 'readonly');
                const request = tx.objectStore('handles').get('directoryHandle');
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        } catch (err) {
            return null;
        }
    },

    // Try to restore previously selected folder on startup

    async restoreSavedFolder() {
        try {
            const handle = await this.loadDirectoryHandle();
            if (!handle) return false;

            // Verify permission
            const permission = await handle.queryPermission({ mode: 'readwrite' });
            if (permission === 'granted') {
                this.directoryHandle = handle;
                this.updateFolderButton(handle.name);
                await this.loadFromFile();
                return true;
            }

            // Request permission if not granted
            const newPermission = await handle.requestPermission({ mode: 'readwrite' });
            if (newPermission === 'granted') {
                this.directoryHandle = handle;
                this.updateFolderButton(handle.name);
                await this.loadFromFile();
                return true;
            }
        } catch (err) {
            console.log('Could not restore folder:', err.message);
        }
        return false;
    },


    updateFolderButton(name) {
        const folderBtn = document.getElementById('folderBtn');
        if (folderBtn) {
            folderBtn.textContent = `📁 ${name}`;
            folderBtn.classList.add('selected');
        }
    },

    // Pick a folder to save/load schedule.json

    async pickFolder() {
        try {
            // Check if API is supported
            if (!('showDirectoryPicker' in window)) {
                alert('이 브라우저는 폴더 선택을 지원하지 않습니다.\nChrome 또는 Edge를 사용해주세요.');
                return;
            }

            this.directoryHandle = await window.showDirectoryPicker({
                mode: 'readwrite'
            });

            this.updateFolderButton(this.directoryHandle.name);

            // Save handle to IndexedDB for next session
            await this.saveDirectoryHandle(this.directoryHandle);

            console.log('Folder selected and saved:', this.directoryHandle.name);

            // Try to load existing schedule.json from selected folder
            this.loadFromFile();

        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Folder selection failed:', err);
            }
        }
    },

    // Save schedule to selected folder as schedule.json

    async saveToFile() {
        const saveData = {
            version: '1.0',
            saveDate: new Date().toISOString(),
            startDate: this.config.startDate.toISOString(),
            holidays: Array.from(this.holidays),
            data: this.data
        };

        const saveBtn = document.getElementById('saveBtn');
        const originalText = saveBtn ? saveBtn.innerHTML : '<span class="material-icons">save</span> 저장';

        // If no folder selected, try to pick one
        if (!this.directoryHandle) {
            // Fallback to localStorage
            try {
                localStorage.setItem('quantumScheduler', JSON.stringify(saveData));
                this.showSaveSuccess(saveBtn, originalText, '✅ 로컬 저장됨');
                console.log('Saved to localStorage (no folder selected)');
            } catch (e) {
                alert('저장 실패: ' + e.message);
            }
            return;
        }

        try {
            // Get file handle (create if not exists)
            const fileHandle = await this.directoryHandle.getFileHandle('schedule.json', { create: true });

            // Write to file
            const writable = await fileHandle.createWritable();
            await writable.write(JSON.stringify(saveData, null, 2));
            await writable.close();

            this.showSaveSuccess(saveBtn, originalText, '✅ 파일 저장됨');
            console.log('Saved to schedule.json in:', this.directoryHandle.name);

        } catch (err) {
            console.error('File save failed:', err);
            // Fallback to localStorage
            try {
                localStorage.setItem('quantumScheduler', JSON.stringify(saveData));
                this.showSaveSuccess(saveBtn, originalText, '✅ 로컬 저장됨');
            } catch (e) {
                alert('저장 실패: ' + err.message);
            }
        }
    },

    // Load schedule from selected folder's schedule.json

    async loadFromFile() {
        if (!this.directoryHandle) {
            console.log('No folder selected, trying localStorage');
            this.loadFromLocalStorage();
            return;
        }

        try {
            const fileHandle = await this.directoryHandle.getFileHandle('schedule.json');
            const file = await fileHandle.getFile();
            const text = await file.text();
            const saveData = JSON.parse(text);

            if (saveData.data && Array.isArray(saveData.data)) {
                this.applyLoadedData(saveData);
                console.log('Loaded from schedule.json in:', this.directoryHandle.name);

                const loadBtn = document.getElementById('loadBtn');
                if (loadBtn) {
                    const originalText = loadBtn.textContent;
                    loadBtn.textContent = '✅ 불러옴';
                    setTimeout(() => { loadBtn.textContent = originalText; }, 1500);
                }
            }

        } catch (err) {
            if (err.name === 'NotFoundError') {
                console.log('No schedule.json found in folder');
            } else {
                console.error('File load failed:', err);
            }
            // Fallback to localStorage
            this.loadFromLocalStorage();
        }
    },

    // Save schedule to server (or localStorage as fallback)

    async saveToLocal() {
        const saveData = {
            version: '1.0',
            saveDate: new Date().toISOString(),
            startDate: this.config.startDate.toISOString(),
            holidays: Array.from(this.holidays),
            data: this.data
        };

        const saveBtn = document.getElementById('saveBtn');
        const originalText = saveBtn ? saveBtn.textContent : '';

        // Conflict check: fetch server data first
        try {
            const serverRes = await fetch('/api/schedule');
            const serverData = await serverRes.json();

            if (serverData.saveDate && this.lastServerSaveDate && serverData.saveDate > this.lastServerSaveDate) {
                if (!confirm('서버에 더 최신 데이터가 있습니다. 덮어쓰시겠습니까?\n(취소를 누르면 서버 데이터를 불러오는 것을 권장합니다)')) {
                    return;
                }
            }
        } catch (e) {
            console.log('Server unreachable for conflict check, continuing...');
        }

        fetch('/api/schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(saveData)
        })
            .then(res => res.json())
            .then(result => {
                if (result.success) {
                    this.lastServerSaveDate = saveData.saveDate;
                    this.showSaveSuccess(saveBtn, originalText, '✅ 서버 저장됨');
                    this.updateConnectionStatus(true);
                }
            })
            .catch(err => {
                // Fallback to localStorage
                try {
                    localStorage.setItem('quantumScheduler', JSON.stringify(saveData));
                    this.showSaveSuccess(saveBtn, originalText, '✅ 로컬 저장됨');
                    this.updateConnectionStatus(false);
                } catch (e) {
                    alert('저장 실패: ' + e.message);
                }
            });
    },


    // Load schedule from server (or localStorage as fallback)
    loadFromLocal() {
        fetch('/api/schedule')
            .then(res => res.json())
            .then(saveData => {
                if (saveData.data && Array.isArray(saveData.data)) {
                    this.applyLoadedData(saveData);
                    this.lastServerSaveDate = saveData.saveDate;
                    this.updateConnectionStatus(true);
                    console.log('Schedule loaded from server');
                } else {
                    this.loadFromLocalStorage();
                }
            })
            .catch(err => {
                console.log('Server unavailable, trying localStorage');
                this.loadFromLocalStorage();
                this.updateConnectionStatus(false);
            });
    },

    // Auto-sync function

    async syncWithServer() {
        try {
            const res = await fetch('/api/schedule');
            const serverData = await res.json();

            if (serverData.saveDate && (!this.lastServerSaveDate || serverData.saveDate > this.lastServerSaveDate)) {
                console.log('New data found on server, auto-updating...');
                this.applyLoadedData(serverData);
                this.lastServerSaveDate = serverData.saveDate;
                this.showSyncFlash();
            }
            this.updateConnectionStatus(true);
        } catch (e) {
            this.updateConnectionStatus(false);
        }
    },


    updateConnectionStatus(connected) {
        const dot = document.getElementById('connectionDot');
        if (dot) {
            dot.classList.remove('connected', 'disconnected');
            dot.classList.add(connected ? 'connected' : 'disconnected');
            dot.title = connected ? '서버 연결됨' : '오프라인';
        }
    },


    showSyncFlash() {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
            sidebar.classList.add('sync-flash');
            setTimeout(() => sidebar.classList.remove('sync-flash'), 1000);
        }
    },


    loadFromLocalStorage() {
        try {
            const saved = localStorage.getItem('quantumScheduler');
            if (!saved) return;

            const saveData = JSON.parse(saved);
            if (saveData.data && Array.isArray(saveData.data)) {
                this.applyLoadedData(saveData);
                console.log('Schedule loaded from localStorage');
            }
        } catch (err) {
            console.warn('Failed to load from localStorage:', err.message);
        }
    },


    applyLoadedData(saveData) {
        this.data = saveData.data;

        if (saveData.holidays && Array.isArray(saveData.holidays)) {
            this.holidays = new Set(saveData.holidays);
        }

        if (saveData.startDate) {
            const startDate = new Date(saveData.startDate);
            if (!isNaN(startDate.getTime())) {
                this.config.startDate = startDate;
                this.renderTimelineStructure();
            }
        }

        this.renderTasks();
        this.updateUndoRedoButtons();
    },


    showSaveSuccess(btn, originalText, message) {
        if (!btn) return;
        // Check if message is the default emoji version, if so replace with icon
        const displayMsg = message.includes('✅') ?
            `<span class="material-icons" style="font-size:16px; vertical-align:middle; margin-right:4px;">check_circle</span> ${message.replace('✅ ', '')}` : message;

        btn.innerHTML = displayMsg;
        btn.style.background = 'rgba(70, 194, 142, 0.5)';
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.background = '';
        }, 1500);
    },

    async deleteAllData() {
        try {
            const res = await fetch('/api/projects', { method: 'DELETE' });
            if (!res.ok) throw new Error('서버 데이터 삭제 실패');

            // Reset local state
            this.data = [];
            this.currentProjectName = null;
            this.holidays = new Set();
            this.undoStack = [];
            this.redoStack = [];

            // Re-initialize UI
            await this.initializeProjects();
            this.renderTimelineStructure();
            this.renderTasks();

            return true;
        } catch (err) {
            console.error('Delete All failed:', err);
            alert('전체 삭제 실패: ' + err.message);
            return false;
        }
    }

});
