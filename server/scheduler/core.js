export class Scheduler {
    constructor() {
        this.config = {
            baseCellWidth: 60,
            cellWidth: 60,
            rowHeight: 44,
            taskBarHeight: 32,
            startDate: new Date(),
            daysView: 365,
            zoomLevel: 1.0,
            minZoom: 0.15,
            maxZoom: 3.0
        };

        this.config.startDate.setHours(0, 0, 0, 0);
        this.config.startDate.setDate(this.config.startDate.getDate() - 30);

        this.holidays = new Set();
        this.selectedSegments = new Set(); // Multi-selection
        this.lastSelectedSeg = null;
        this.isProjectLocked = false; // Lock state

        // Load Theme
        if (localStorage.getItem('theme') === 'dark') {
            document.body.classList.add('dark-theme');
        }


        // Data starts empty - will be loaded from server
        this.data = [];


        this.els = {
            sidebarList: document.getElementById('sidebarList'),
            sidebarScrollArea: document.getElementById('sidebarScrollArea'),
            headerScrollContent: document.getElementById('headerScrollContent'),
            timelineBody: document.getElementById('timelineBody'),
            timelineHeader: document.getElementById('timelineHeader'),
            gridLines: document.getElementById('gridLines'),
            timelineRows: document.getElementById('timelineRows'),
            taskLayer: document.getElementById('taskLayer'),
            eventLayer: document.getElementById('eventLayer'),
            nowMarker: document.getElementById('nowMarker'),
            timelineGrid: document.getElementById('timelineGrid'),
            addBtn: document.getElementById('addProjectBtn'),
            todayBtn: document.getElementById('todayBtn'),
            undoBtn: document.getElementById('undoBtn'),
            redoBtn: document.getElementById('redoBtn'),
            taskMenu: document.getElementById('taskContextMenu'),
            sidebarMenu: document.getElementById('sidebarContextMenu'),
            headerMenu: document.getElementById('headerContextMenu'),
            colorPicker: document.getElementById('colorPicker'),
            projectColorPicker: document.getElementById('projectColorPicker'),
            selectionBox: document.getElementById('selectionBox'),
            snapGuideLine: document.getElementById('snapGuideLine'),
            memoModal: document.getElementById('memoModal'),
            memoInput: document.getElementById('memoInput'),
            memoPanel: document.getElementById('memoPanel'),
            memoPanelInput: document.getElementById('memoPanelInput'),
            memoTaskName: document.getElementById('memoTaskName'),
            confirmModal: document.getElementById('confirmModal'),
            confirmTitle: document.getElementById('confirmTitle'),
            confirmMessage: document.getElementById('confirmMessage'),
            confirmCancelBtn: document.getElementById('confirmCancelBtn'),
            confirmOkBtn: document.getElementById('confirmOkBtn'),
            confirmCloseX: document.getElementById('confirmCloseX')
        };

        if (this.els.sidebarScrollArea) {
            const sidebarGhost = document.createElement('div');
            sidebarGhost.id = 'sidebarDropGhost';
            sidebarGhost.className = 'drop-ghost sidebar-drop-ghost';
            this.els.sidebarScrollArea.appendChild(sidebarGhost);
            this.els.sidebarDropGhost = sidebarGhost;
        }

        if (this.els.timelineGrid) {
            const timelineGhost = document.createElement('div');
            timelineGhost.id = 'timelineDropGhost';
            timelineGhost.className = 'timeline-drop-ghost';
            this.els.timelineGrid.appendChild(timelineGhost);
            this.els.timelineDropGhost = timelineGhost;

            const mouseGuide = document.createElement('div');
            mouseGuide.id = 'mouseGuideLine';
            mouseGuide.className = 'mouse-guide-line';
            this.els.timelineGrid.appendChild(mouseGuide);
            this.els.mouseGuideLine = mouseGuide;
        }

        this.ctxState = { targetId: null, targetSegId: null, targetType: null, x: 0, targetDay: null };
        this.dragState = { isDragging: false, el: null };
        this.panState = { isPanning: false, startX: 0, startScrollLeft: 0 };
        this.selectState = { isSelecting: false, startX: 0, startY: 0 };

        // Selection State (Multi-Select)
        this.selectedTaskId = null; // Legacy support (points to last selected)
        this.selectedTaskIds = new Set();
        this.lastSelectedTaskId = null; // Anchor for Shift+Click

        // Undo/Redo history
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistory = 50;

        // Color Palette
        this.palette = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7'];

        this.init();
    }


    init() {
        this.renderTimelineStructure();
        this.renderTasks();
        this.setupScrollSync();
        this.startRealTimeUpdates();
        this.setupContextMenus();
        this.setupPanning();
        this.setupZoom();

        // Prevent browser's default right-click menu on the app
        // Using capture: true to intercept before anything else, but NOT stopping propagation
        // so that the app's internal context menu logic can still work.
        window.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        }, { capture: true });

        // Prevent native drag behaviors (text selection, image dragging)
        window.addEventListener('dragstart', (e) => {
            if (e.target.closest('.task-row-label')) return;
            e.preventDefault();
        }, { capture: true });

        // Register document-level event listeners for drag/resize
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        document.addEventListener('mouseup', (e) => this.onMouseUp(e));

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.context-menu')) this.hideMenus();

            // Deselect all segments when clicking on empty space
            if (!e.target.closest('.task-bar') && !e.target.closest('.event-marker') &&
                !e.target.closest('.context-menu') && !e.target.closest('.memo-panel') &&
                !e.target.closest('.modal-overlay') && e.target.closest('.timeline-body')) {
                this.selectedSegments.clear();
                this.closeMemoPanel();
                this.renderTasks();
            }
        });
        this.els.timelineBody.addEventListener('scroll', () => {
            this.hideMenus();
            this.updateFloatingLabels();
            this.hideMouseGuideLine();
        });

        if (this.els.todayBtn) {
            this.els.todayBtn.addEventListener('click', () => this.scrollToToday());
        }

        if (this.els.undoBtn) {
            this.els.undoBtn.addEventListener('click', () => this.undo());
        }
        if (this.els.redoBtn) {
            this.els.redoBtn.addEventListener('click', () => this.redo());
        }
        if (this.updateUndoRedoButtons) {
            this.updateUndoRedoButtons();
        }

        if (this.els.sidebarScrollArea) {
            this.els.sidebarScrollArea.addEventListener('dragover', (e) => this.handleListDragOver(e));
            this.els.sidebarScrollArea.addEventListener('drop', (e) => this.handleListDrop(e));
        }

        if (this.els.timelineBody && this.els.mouseGuideLine) {
            this.els.timelineBody.addEventListener('mousemove', (e) => this.updateMouseGuideLine(e));
            this.els.timelineBody.addEventListener('mouseleave', () => this.hideMouseGuideLine());
        }

        // Add Project button - requires active project
        if (this.els.addBtn) {
            this.els.addBtn.addEventListener('click', () => {
                if (this.isProjectLocked) return;
                // Force new project creation if no project is active
                if (!this.currentProjectName) {
                    alert('먼저 프로젝트를 만들어야 합니다.');
                    this.createNewProject();
                    return;
                }

                const colors = ['#5e6ad2', '#26b5ce', '#46c28e', '#f59e0b', '#ef4444', '#8b5cf6'];
                const randColor = colors[Math.floor(Math.random() * colors.length)];
                this.saveState();
                this.data.push({
                    id: Date.now(), name: "New Project", expanded: true, color: randColor,
                    segments: [{ id: `s${Date.now()}`, startOffset: 30, duration: 5, includeWeekends: true }],
                    children: []
                });
                this.renderTasks();
            });
        }

        // Initialize project state
        this.currentProjectName = null;
        this.autoSaveTimeout = null;
        this.autoSaveDelay = 3000; // 3 seconds debounce
        this.isProjectLocked = false; // Add lock state

        // New project button
        const newBtn = document.getElementById('newBtn');
        if (newBtn) {
            newBtn.addEventListener('click', () => {
                if (this.isProjectLocked) return;
                this.createNewProject();
            });
        }

        // Settings Button
        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => this.openSettings());
        }

        // Context Menu Items - Today
        const ctxToday = document.getElementById('ctxToday');
        if (ctxToday) {
            ctxToday.addEventListener('click', () => {
                this.scrollToToday();
                this.hideMenus();
            });
        }
        const ctxHeaderToday = document.getElementById('ctxHeaderToday');
        if (ctxHeaderToday) {
            ctxHeaderToday.addEventListener('click', () => {
                this.scrollToToday();
                this.hideMenus();
            });
        }


        // Project select dropdown - save pending before switching
        const projectSelect = document.getElementById('projectSelect');
        if (projectSelect) {
            projectSelect.addEventListener('change', async (e) => {
                // Save pending changes before switching
                if (this.currentProjectName && this.autoSaveTimeout) {
                    await this.saveNow();
                }
                if (e.target.value) {
                    this.loadProject(e.target.value);
                }
            });
        }


        // Rename project button
        const renameBtn = document.getElementById('renameProjectBtn');
        if (renameBtn) {
            renameBtn.addEventListener('click', () => {
                if (this.isProjectLocked) return;
                this.renameCurrentProject();
            });
        }

        // Delete project button
        const deleteBtn = document.getElementById('deleteProjectBtn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                if (this.isProjectLocked) return;
                this.deleteCurrentProject();
            });
        }

        // Lock button
        const lockBtn = document.getElementById('lockProjectBtn');
        if (lockBtn) {
            lockBtn.addEventListener('click', () => this.toggleProjectLock());
        }

        // Load project list and restore last project
        this.initializeProjects();

        // Save on page close/hide
        window.addEventListener('beforeunload', () => {
            if (this.currentProjectName && this.autoSaveTimeout) {
                clearTimeout(this.autoSaveTimeout);
                // Synchronous save attempt using sendBeacon
                const saveData = {
                    version: '1.0',
                    saveDate: new Date().toISOString(),
                    startDate: this.config.startDate.toISOString(),
                    holidays: Array.from(this.holidays),
                    data: this.data
                };
                navigator.sendBeacon(
                    `/api/project/${encodeURIComponent(this.currentProjectName)}`,
                    new Blob([JSON.stringify(saveData)], { type: 'application/json' })
                );
            }
        });

        // Also save when tab becomes hidden
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.currentProjectName) {
                this.saveCurrentProject();
            }
        });


        // Keyboard shortcuts
        this.setupKeyboardHandlers();

        // Timeline row double-click to add segment (for subtasks and any task without graph)
        this.els.timelineRows.addEventListener('dblclick', (e) => {
            if (this.isProjectLocked) return;
            if (e.target.classList.contains('timeline-row')) {
                const rect = this.els.timelineBody.getBoundingClientRect();
                const clickX = e.clientX + this.els.timelineBody.scrollLeft - rect.left;
                const dayIndex = Math.floor(clickX / this.config.cellWidth);
                const projId = e.target.dataset.id;
                const node = this.findNode(projId);
                if (node) {
                    this.saveState();
                    node.segments.push({
                        id: `s${projId}-${Date.now()}`,
                        startOffset: dayIndex,
                        duration: 3,
                        includeWeekends: true
                    });
                    this.mergeSegments(node);
                    this.renderTasks();
                }
            }
        });

        setTimeout(() => this.scrollToToday(), 100);
    }

}

if (typeof window !== 'undefined') {
    window.Scheduler = Scheduler;
}
