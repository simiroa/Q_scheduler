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

        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `schedule_${this.getDateKey(new Date())}.json`;
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

        dot.title = { pending: '저장 대기 중...', saving: '저장 중...', saved: '저장됨', error: '저장 실패' }[status] || '';
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

    updateConnectionStatus(connected) {
        const dot = document.getElementById('connectionDot');
        if (dot) {
            dot.classList.remove('connected', 'disconnected');
            dot.classList.add(connected ? 'connected' : 'disconnected');
            dot.title = connected ? '서버 연결됨' : '오프라인';
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
