import { Scheduler } from './core.js';

Object.assign(Scheduler.prototype, {

    // --- Context Menus ---
    openTaskMenu(e, pid, sid) {
        if (this.isProjectLocked) return;
        this.hideMenus();
        this.ctxState = { targetId: pid, targetSegId: sid, targetType: 'task', x: e.clientX };
        const menu = this.els.taskMenu;
        menu.style.display = 'block';
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
    },


    openSidebarMenu(e, pid) {
        if (this.isProjectLocked) return;
        this.hideMenus();
        this.ctxState = { targetId: pid, targetType: 'sidebar' };
        const menu = this.els.sidebarMenu;
        menu.style.display = 'block';
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
    },


    openHeaderMenu(e, dayIndex, date) {
        this.hideMenus();
        this.ctxState = { targetType: 'header', targetDay: dayIndex, targetDate: date };
        const menu = this.els.headerMenu;
        menu.style.display = 'block';
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;

        const key = this.getDateKey(date);
        const isHday = this.holidays.has(key);
        document.getElementById('ctxToggleHoliday').innerHTML = isHday ?
            '<span class="material-icons" style="font-size:16px; margin-right:8px; color:#ef4444;">undo</span>휴일 해제' :
            '<span class="material-icons" style="font-size:16px; margin-right:8px;">flag</span>휴일 지정';
    },


    hideMenus() {
        this.els.taskMenu.style.display = 'none';
        this.els.sidebarMenu.style.display = 'none';
        if (this.els.headerMenu) this.els.headerMenu.style.display = 'none';
    },

    toggleProjectLock() {
        this.isProjectLocked = !this.isProjectLocked;
        const lockBtn = document.getElementById('lockProjectBtn');
        const icon = lockBtn.querySelector('.material-icons');

        // Buttons to disable
        const btns = [
            document.getElementById('newBtn'),
            document.getElementById('renameProjectBtn'),
            document.getElementById('deleteProjectBtn'),
            document.getElementById('addProjectBtn'), // Also disable bottom add button
            document.getElementById('projectColorPicker') // Disable color picker trigger
        ];

        if (this.isProjectLocked) {
            icon.textContent = 'lock';
            lockBtn.classList.add('active');

            btns.forEach(btn => {
                if (btn) {
                    btn.classList.add('disabled');
                    // Ensure color picker is not clickable
                    if (btn.id === 'projectColorPicker') btn.style.pointerEvents = 'none';
                }
            });

            // Also disable all input fields in sidebar?
            // Maybe safer to just block saving/editing actions.

        } else {
            icon.textContent = 'lock_open';
            lockBtn.classList.remove('active');

            btns.forEach(btn => {
                if (btn) {
                    btn.classList.remove('disabled');
                    if (btn.id === 'projectColorPicker') btn.style.pointerEvents = '';
                }
            });
        }
    },

    openConfirmModal({ title, message, confirmText = '확인', onConfirm }) {
        if (!this.els.confirmModal) return;
        this.confirmAction = onConfirm;
        if (this.els.confirmTitle) this.els.confirmTitle.innerHTML = title;
        if (this.els.confirmMessage) this.els.confirmMessage.innerHTML = message;
        if (this.els.confirmOkBtn) this.els.confirmOkBtn.innerHTML = confirmText;
        this.els.confirmModal.classList.add('active');
    },

    closeConfirmModal() {
        if (!this.els.confirmModal) return;
        this.els.confirmModal.classList.remove('active');
        this.confirmAction = null;
    },


    setupContextMenus() {

        document.getElementById('ctxAddSubtask').onclick = () => {
            const node = this.findNode(this.ctxState.targetId);
            if (node) {
                if (!node.children) node.children = [];
                this.saveState();
                node.children.push({
                    id: Date.now(),
                    name: "New Subtask",
                    expanded: true,
                    color: node.color,
                    segments: [],
                    children: []
                });
                node.expanded = true;
                this.updateAncestorSchedules(node);
                this.renderTasks();
            }
        };

        document.getElementById('ctxDeleteRow').onclick = () => {
            const targetId = this.ctxState.targetId;
            if (!targetId) return;
            this.confirmDeleteTasks([targetId]);
        };


        // Add Event (1-day red block at click position)
        document.getElementById('ctxAddEvent').onclick = () => {
            const node = this.findNode(this.ctxState.targetId);
            if (node) {
                this.saveState();
                const rect = this.els.timelineBody.getBoundingClientRect();
                const timelineX = this.ctxState.x + this.els.timelineBody.scrollLeft - rect.left;
                const clickDay = Math.floor(timelineX / this.config.cellWidth);

                // Create event as a new segment with special properties
                node.segments.push({
                    id: `event-${Date.now()}`,
                    startOffset: clickDay,
                    duration: 1,
                    color: '#ef4444', // Red color
                    includeWeekends: true,
                    isEvent: true,
                    eventName: 'Event'
                });
                this.renderTasks();
            }
        };

        document.getElementById('ctxSplit').onclick = () => {
            const node = this.findNode(this.ctxState.targetId);
            const segIndex = node.segments.findIndex(s => s.id === this.ctxState.targetSegId);
            if (segIndex === -1) return;
            this.saveState();
            const seg = node.segments[segIndex];
            const rect = this.els.timelineBody.getBoundingClientRect();
            const timelineX = this.ctxState.x + this.els.timelineBody.scrollLeft - rect.left;
            const clickDay = Math.floor(timelineX / this.config.cellWidth);
            const relativeSplit = clickDay - seg.startOffset;
            if (relativeSplit > 0 && relativeSplit < seg.duration) {
                const seg1 = { ...seg, id: seg.id + '_1', duration: relativeSplit };
                const seg2 = { ...seg, id: seg.id + '_2', startOffset: seg.startOffset + relativeSplit, duration: seg.duration - relativeSplit };
                node.segments.splice(segIndex, 1, seg1, seg2);
                this.renderTasks();
            }
        };

        document.getElementById('ctxMerge').onclick = () => {
            const node = this.findNode(this.ctxState.targetId);
            this.saveState();
            this.mergeSegments(node);
            this.renderTasks();
        };


        document.getElementById('ctxToggleWeekend').onclick = () => {
            const node = this.findNode(this.ctxState.targetId);
            const seg = node.segments.find(s => s.id === this.ctxState.targetSegId);
            if (seg) {
                this.saveState();
                seg.includeWeekends = !seg.includeWeekends;
                this.renderTasks();
            }
        };

        document.getElementById('ctxToggleHoliday').onclick = () => {
            const date = this.ctxState.targetDate;
            const key = this.getDateKey(date);
            if (this.holidays.has(key)) {
                this.holidays.delete(key);
            } else {
                this.holidays.add(key);
            }
            this.renderTimelineStructure();
        };

        // Date Picker - Set Schedule Dates (Now opens unified Edit Modal)
        document.getElementById('ctxSetDates').onclick = () => {
            const node = this.findNode(this.ctxState.targetId);
            const segId = this.ctxState.targetSegId;
            this.openEditDialog(node.id, segId);
        };


        // Unified Edit Modal Date Previews
        const updateEditPreview = () => {
            const startVal = document.getElementById('editStartDateInput').value;
            const endVal = document.getElementById('editEndDateInput').value;
            const display = document.getElementById('editDurationDisplay');

            if (!startVal || !endVal) {
                display.textContent = '-';
                return;
            }

            const startDate = new Date(startVal);
            const endDate = new Date(endVal);
            const days = Math.floor((endDate - startDate) / (24 * 60 * 60 * 1000)) + 1;

            if (days < 1) {
                display.innerHTML = '<span class="material-icons" style="font-size:14px; vertical-align:middle; margin-right:4px; color:#ef4444;">error_outline</span>End date must be after start date';
                display.style.color = '#ef4444';
                document.getElementById('editSaveBtn').disabled = true;
            } else {
                // Calculate working days (excluding weekends) if weekends are excluded
                // For preview, we just show total days + date range
                const kStart = this.formatDateKorean(startDate);
                const kEnd = this.formatDateKorean(endDate);
                display.innerHTML = `<span class="material-icons" style="font-size:14px; vertical-align:middle; margin-right:4px; color:#5e6ad2;">event</span> ${days}일 (${kStart} ~ ${kEnd})`;
                display.style.color = '#666';

                document.getElementById('editDurationInput').value = days;
                document.getElementById('editSaveBtn').disabled = false;
            }
        };

        document.getElementById('editStartDateInput').onchange = updateEditPreview;
        document.getElementById('editEndDateInput').onchange = updateEditPreview;

        // Show calendar picker immediately when clicking on date inputs
        document.getElementById('editStartDateInput').onclick = function () { this.showPicker(); };
        document.getElementById('editEndDateInput').onclick = function () { this.showPicker(); };

        // Memo handlers - using right panel instead of modal
        document.getElementById('ctxMemo').onclick = () => {
            this.openMemoPanel();
        };

        document.getElementById('memoPanelClose').onclick = () => {
            this.closeMemoPanel();
        };

        document.getElementById('memoPanelSave').onclick = () => {
            this.saveMemoPanel();
        };

        if (this.els.confirmCancelBtn) {
            this.els.confirmCancelBtn.onclick = () => this.closeConfirmModal();
        }
        if (this.els.confirmCloseX) {
            this.els.confirmCloseX.onclick = () => this.closeConfirmModal();
        }
        if (this.els.confirmOkBtn) {
            this.els.confirmOkBtn.onclick = () => {
                const action = this.confirmAction;
                this.closeConfirmModal();
                if (action) action();
            };
        }

        // Edit Modal Handlers
        document.getElementById('editCancelBtn').onclick = () => {
            document.getElementById('editModal').style.display = 'none';
        };

        document.getElementById('editSaveBtn').onclick = () => {
            this.saveEditModal();
        };

        // Modal Close X
        document.getElementById('editCloseX').onclick = () => {
            document.getElementById('editModal').style.display = 'none';
            this.editTarget = null;
        };

        // Custom Color Button
        const customColorBtn = document.getElementById('editCustomColorBtn');
        const hiddenColorInput = document.getElementById('editColorInput');
        customColorBtn.onclick = () => hiddenColorInput.click();

        hiddenColorInput.onchange = (e) => {
            const newColor = e.target.value;
            if (!this.palette.includes(newColor)) {
                this.palette.push(newColor);
            }
            // Update visual feedback
            customColorBtn.style.background = newColor;
            customColorBtn.style.color = '#fff';
            customColorBtn.style.border = 'none';
            document.querySelectorAll('.color-option').forEach(el => el.classList.remove('selected'));
            this.renderPalette(newColor);
        };

        // Initialize palette display
        this.renderPalette();

        // ESC to close modal, Enter to save (but not when in memo textarea)
        window.addEventListener('keydown', (e) => {
            // Skip if focused on memo textarea (allow normal line breaks)
            if (document.activeElement &&
                (document.activeElement.id === 'memoTextarea' ||
                    document.activeElement.closest('#memoPanel'))) {
                return; // Let Enter work normally in memo
            }

            const modal = document.getElementById('editModal');
            // Only handle keys when modal is visible (display is 'flex' or 'block')
            if (modal.style.display === 'none' || modal.style.display === '') return;

            if (e.key === 'Escape') {
                modal.style.display = 'none';
                this.editTarget = null;
            } else if (e.key === 'Enter') {
                e.preventDefault(); // Prevent form submission or other enter actions
                e.stopPropagation(); // Stop event from reaching other handlers
                this.saveEditModal();
            }
        }, true); // capture phase to intercept before other handlers
    },


    openEditDialog(nodeId, segmentId, targetEl) {
        if (this.isProjectLocked) return; // Prevent editing when locked

        const node = this.findNode(nodeId);
        if (!node) return;

        const seg = segmentId ? node.segments.find(s => s.id === segmentId) : null;
        if (segmentId && !seg) return;

        this.editTarget = { nodeId, segmentId };

        const nameInput = document.getElementById('editNameInput');
        const colorInput = document.getElementById('editColorInput');
        const startDateInput = document.getElementById('editStartDateInput');
        const endDateInput = document.getElementById('editEndDateInput');
        const durationDisplay = document.getElementById('editDurationDisplay');
        const memoInput = document.getElementById('editMemoInput');

        let initialColor = '#5e6ad2';

        // Pre-fill values
        if (seg) {
            nameInput.value = seg.label || ''; // For events/segments, name = label
            initialColor = seg.color || node.color || '#5e6ad2';
            colorInput.value = initialColor;
            memoInput.value = seg.memo || '';

            // Date Calculation
            const startDate = new Date(this.config.startDate);
            startDate.setDate(startDate.getDate() + seg.startOffset);

            const endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + seg.duration - 1);

            startDateInput.value = this.formatDateForInput(startDate);
            endDateInput.value = this.formatDateForInput(endDate);

            // Trigger preview update
            startDateInput.dispatchEvent(new Event('change'));

        } else {
            nameInput.value = node.name;
            initialColor = node.color || '#ef4444';
            colorInput.value = initialColor;
            memoInput.value = seg ? (seg.memo || '') : '';

            // Default dates (today + 5 days)
            const now = new Date();
            startDateInput.value = this.formatDateForInput(now);
            const end = new Date(now);
            end.setDate(end.getDate() + 4);
            endDateInput.value = this.formatDateForInput(end);

            startDateInput.dispatchEvent(new Event('change'));

            if (!segmentId) {
                // Logic for project nodes if needed
            }
        }

        // Color selection UI update
        this.renderPalette(initialColor);

        // Handle custom color button state (if not in palette)
        const matched = this.palette.some(c => this.hexCompare(c, initialColor));
        const customColorBtn = document.getElementById('editCustomColorBtn');
        if (!matched) {
            customColorBtn.style.background = initialColor;
            customColorBtn.style.color = '#fff';
            customColorBtn.style.border = 'none';
        } else {
            customColorBtn.style.background = '#fff';
            customColorBtn.style.color = '#666';
            customColorBtn.style.border = '1px solid #ddd';
        }


        // Position Modal
        const modal = document.getElementById('editModal');
        modal.style.display = 'flex'; // Flex for centering or positioning

        if (targetEl) {
            const rect = targetEl.getBoundingClientRect();
            const modalRect = modal.querySelector('.modal-content').getBoundingClientRect();

            let top = rect.bottom + 10;
            let left = rect.left;

            // Boundary checks
            if (left + modalRect.width > window.innerWidth) {
                left = window.innerWidth - modalRect.width - 20;
            }
            if (top + modalRect.height > window.innerHeight) {
                top = rect.top - modalRect.height - 10;
            }

            modal.style.alignItems = 'unset';
            modal.style.justifyContent = 'unset';
            modal.querySelector('.modal-content').style.position = 'absolute';
            modal.querySelector('.modal-content').style.top = `${top}px`;
            modal.querySelector('.modal-content').style.left = `${left}px`;
            modal.querySelector('.modal-content').style.margin = '0';
        } else {
            // Fallback to center
            modal.style.alignItems = 'center';
            modal.style.justifyContent = 'center';
            modal.querySelector('.modal-content').style.position = 'relative';
            modal.querySelector('.modal-content').style.top = 'unset';
            modal.querySelector('.modal-content').style.left = 'unset';
        }

        nameInput.focus();
    },


    saveEditModal() {
        if (!this.editTarget) return;
        const { nodeId, segmentId } = this.editTarget;
        const node = this.findNode(nodeId);

        if (segmentId) {
            const seg = node?.segments.find(s => s.id === segmentId);
            if (seg) {
                this.saveState();
                seg.label = document.getElementById('editNameInput').value.trim();
                seg.color = document.getElementById('editColorInput').value;
                seg.memo = document.getElementById('editMemoInput').value.trim();

                // Update dates if valid
                const startVal = document.getElementById('editStartDateInput').value;
                const endVal = document.getElementById('editEndDateInput').value;

                if (startVal && endVal) {
                    const sDate = new Date(startVal);
                    const eDate = new Date(endVal);

                    if (eDate >= sDate) {
                        const baseDate = this.config.startDate;
                        const newStartOffset = Math.floor((sDate - baseDate) / (24 * 60 * 60 * 1000));
                        const newDuration = Math.floor((eDate - sDate) / (24 * 60 * 60 * 1000)) + 1;

                        seg.startOffset = newStartOffset;
                        seg.duration = Math.max(1, newDuration);
                    }
                }

                // Save Color for segments
                const colorVal = document.getElementById('editColorInput').value;
                if (colorVal) seg.color = colorVal;
            }
        } else {
            // Edit Node (Task/Project)
            if (node) {
                this.saveState();
                node.name = document.getElementById('editNameInput').value.trim();
                node.color = document.getElementById('editColorInput').value;
            }
        }

        this.renderTasks();
        document.getElementById('editModal').style.display = 'none';
        this.editTarget = null;
    },


    openMemoPanel() {
        const node = this.findNode(this.ctxState.targetId);
        const seg = node?.segments.find(s => s.id === this.ctxState.targetSegId);
        if (!seg) return;

        // Store current target for saving
        this.memoPanelTarget = { nodeId: this.ctxState.targetId, segId: this.ctxState.targetSegId };

        // Update panel content
        const displayName = seg.label || node.name;
        this.els.memoTaskName.innerHTML = '<span class="material-icons" style="font-size:18px; vertical-align:middle; margin-right:6px; color:#5e6ad2;">description</span>' + node.name;
        this.els.memoPanelInput.value = seg.memo || '';

        // Open panel
        this.els.memoPanel.classList.add('open');
        this.els.memoPanelInput.focus();
    },


    closeMemoPanel() {
        this.els.memoPanel.classList.remove('open');
        this.memoPanelTarget = null;
    },


    saveMemoPanel() {
        if (!this.memoPanelTarget) return;

        const node = this.findNode(this.memoPanelTarget.nodeId);
        const seg = node?.segments.find(s => s.id === this.memoPanelTarget.segId);
        if (!seg) return;

        this.saveState();
        seg.memo = this.els.memoPanelInput.value.trim();
        this.closeMemoPanel();
        this.renderTasks();
    },


    formatDateForInput(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    },


    formatDateKorean(date) {
        const m = date.getMonth() + 1;
        const d = date.getDate();
        return `${m}월 ${d}일`;
    },


    // Helper: Compare hex colors (normalize format)
    hexCompare(color1, color2) {
        const d1 = document.createElement('div'); d1.style.color = color1;
        const d2 = document.createElement('div'); d2.style.color = color2;
        return d1.style.color === d2.style.color;
    },

    // Render dynamic color palette in edit modal

    renderPalette(selectedColor = null) {
        const colorContainer = document.getElementById('editColorOptions');
        if (!colorContainer) return;
        colorContainer.innerHTML = '';

        this.palette.forEach(c => {
            const opt = document.createElement('div');
            opt.className = 'color-option';
            opt.style.background = c;

            // Delete Button (x)
            const delBtn = document.createElement('span');
            delBtn.className = 'delete-x';
            delBtn.innerHTML = '<span class="material-icons" style="font-size:14px;">close</span>';
            delBtn.title = 'Delete Color';
            delBtn.onclick = (e) => {
                e.stopPropagation();
                this.palette = this.palette.filter(p => p !== c);
                this.renderPalette(document.getElementById('editColorInput').value);
            };
            opt.appendChild(delBtn);

            opt.onclick = () => {
                document.querySelectorAll('.color-option').forEach(el => el.classList.remove('selected'));
                opt.classList.add('selected');
                document.getElementById('editCustomColorBtn').style.background = '#fff';
                document.getElementById('editCustomColorBtn').style.color = '#666';
                document.getElementById('editCustomColorBtn').style.border = '1px solid #ddd';
                document.getElementById('editColorInput').value = c;
            };

            if (selectedColor && this.hexCompare(c, selectedColor)) {
                opt.classList.add('selected');
            }

            colorContainer.appendChild(opt);
        });
    },


    // --- Settings Modal ---
    openSettings() {
        document.getElementById('settingsModal').style.display = 'flex';
        // Add tab logic here
        const tabs = document.querySelectorAll('.tab-btn');
        tabs.forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        // Default to general
        tabs[0].classList.add('active');
        document.getElementById('tab-general').classList.add('active');

        // Initialize buttons events
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

                btn.classList.add('active');
                document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
            };
        });

        document.getElementById('settingsCloseX').onclick = () => {
            document.getElementById('settingsModal').style.display = 'none';
        };

        // Wire up buttons
        const btnExportJson = document.getElementById('settingExportJson');
        if (btnExportJson) btnExportJson.onclick = () => this.exportSchedule();

        const btnImportJson = document.getElementById('settingImportJson');
        if (btnImportJson) {
            btnImportJson.onclick = () => document.getElementById('settingImportFile').click();
            document.getElementById('settingImportFile').onchange = (e) => this.importSchedule(e);
        }

        const btnExportGoogle = document.getElementById('settingExportGoogle');
        if (btnExportGoogle) btnExportGoogle.onclick = () => this.exportToICS();

        const btnShareScreen = document.getElementById('settingShareScreen');
        if (btnShareScreen) btnShareScreen.onclick = () => this.captureScreen();

        const btnFetchHolidays = document.getElementById('settingFetchHolidays');
        if (btnFetchHolidays) btnFetchHolidays.onclick = () => this.importHolidays();

        const toggleStartup = document.getElementById('settingRunOnStartup');
        if (toggleStartup) {
            // Load saved state (mock)
            const savedStartup = localStorage.getItem('runOnStartup') === 'true';
            toggleStartup.checked = savedStartup;

            toggleStartup.onchange = (e) => {
                localStorage.setItem('runOnStartup', e.target.checked);
                if (e.target.checked) {
                    this.downloadStartupScript();
                }
            };
        }

        const toggleDarkMode = document.getElementById('settingDarkMode');
        if (toggleDarkMode) {
            toggleDarkMode.checked = document.body.classList.contains('dark-theme');
            toggleDarkMode.onchange = (e) => {
                if (e.target.checked) {
                    document.body.classList.add('dark-theme');
                    localStorage.setItem('theme', 'dark');
                } else {
                    document.body.classList.remove('dark-theme');
                    localStorage.setItem('theme', 'light');
                }
            };
        }

        const btnDeleteAll = document.getElementById('settingDeleteAll');
        if (btnDeleteAll) {
            btnDeleteAll.onclick = () => {
                this.openConfirmModal({
                    title: '<span class="material-icons" style="vertical-align:middle; margin-right:8px; color:#ef4444;">warning</span>전체 데이터 삭제',
                    message: '정말로 모든 프로젝트와 설정을 삭제하시겠습니까?<br><strong style="color:#ef4444;">이 작업은 절대로 되돌릴 수 없습니다.</strong>',
                    confirmText: '모두 삭제',
                    onConfirm: async () => {
                        const success = await this.deleteAllData();
                        if (success) {
                            document.getElementById('settingsModal').style.display = 'none';
                            alert('모든 데이터가 삭제되었습니다.');
                        }
                    }
                });
            };
        }
    },

    importHolidays() {
        if (!confirm('2024년부터 2030년까지의 주요 한국 공휴일을 추가하시겠습니까?\n(이미 등록된 공휴일은 유지됩니다)')) return;

        // Major Korean Holidays (Fixed)
        const fixedHolidays = [
            { m: 1, d: 1, name: '신정' },
            { m: 3, d: 1, name: '삼일절' },
            { m: 5, d: 5, name: '어린이날' },
            { m: 6, d: 6, name: '현충일' },
            { m: 8, d: 15, name: '광복절' },
            { m: 10, d: 3, name: '개천절' },
            { m: 10, d: 9, name: '한글날' },
            { m: 12, d: 25, name: '성탄절' }
        ];

        // Specific Lunar/Variable Holidays (2024-2030)
        // Source: Standard KR Calendar
        const variableHolidays = [
            // 2024
            '2024-02-09', '2024-02-10', '2024-02-11', '2024-02-12', // Seollal + Alt
            '2024-04-10', // Election
            '2024-05-15', // Buddha
            '2024-09-16', '2024-09-17', '2024-09-18', // Chuseok
            // 2025
            '2025-01-28', '2025-01-29', '2025-01-30', // Seollal
            '2025-05-05', // Buddha (Same as Children's)
            '2025-10-05', '2025-10-06', '2025-10-07', // Chuseok
            // 2026
            '2026-02-16', '2026-02-17', '2026-02-18',
            '2026-05-24', // Buddha
            '2026-09-24', '2026-09-25', '2026-09-26',
            // 2027
            '2027-02-06', '2027-02-07', '2027-02-08',
            '2027-05-13',
            '2027-09-14', '2027-09-15', '2027-09-16',
            // 2028
            '2028-01-26', '2028-01-27', '2028-01-28',
            '2028-05-02',
            '2028-10-02', '2028-10-03', '2028-10-04',
            // 2029
            '2029-02-12', '2029-02-13', '2029-02-14',
            '2029-05-20',
            '2029-09-21', '2029-09-22', '2029-09-23',
            // 2030
            '2030-02-02', '2030-02-03', '2030-02-04',
            '2030-05-09',
            '2030-09-11', '2030-09-12', '2030-09-13'
        ];

        let addedCount = 0;

        // Add Fixed Holidays
        for (let year = 2024; year <= 2030; year++) {
            fixedHolidays.forEach(h => {
                const dateStr = `${year}-${String(h.m).padStart(2, '0')}-${String(h.d).padStart(2, '0')}`;
                if (!this.holidays.has(dateStr)) {
                    this.holidays.add(dateStr);
                    addedCount++;
                }
            });
        }

        // Add Variable Holidays
        variableHolidays.forEach(dateStr => {
            if (!this.holidays.has(dateStr)) {
                this.holidays.add(dateStr);
                addedCount++;
            }
        });

        if (addedCount > 0) {
            this.saveState();
            this.renderTimeline();

            // Visual Feedback on Button
            const btn = document.getElementById('settingFetchHolidays');
            if (btn) {
                const originalText = btn.innerHTML;
                btn.innerHTML = '<span class="material-icons">check</span> 완료!';
                btn.classList.add('btn-success'); // Assuming naive class or just visual
                setTimeout(() => {
                    btn.innerHTML = originalText;
                    btn.classList.remove('btn-success');
                }, 2000);
            }

            alert(`✅ ${addedCount}개의 주요 공휴일이 캘린더에 추가되었습니다!\n(타임라인에서 빨간색으로 표시됩니다)`);
        } else {
            alert('📅 이미 2024~2030년의 주요 공휴일이 모두 등록되어 있습니다.');
        }
    },

    exportToICS() {
        let icsContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Quantum Scheduler//KR\nCALSCALE:GREGORIAN\n";

        const processNode = (node) => {
            if (node.segments) {
                node.segments.forEach(seg => {
                    const start = new Date(this.config.startDate);
                    start.setDate(start.getDate() + seg.startOffset);
                    const end = new Date(start);
                    end.setDate(end.getDate() + seg.duration);

                    const formatDate = (date) => {
                        return date.toISOString().replace(/[-:]/g, '').split('T')[0];
                    };

                    icsContent += "BEGIN:VEVENT\n";
                    icsContent += `DTSTART;VALUE=DATE:${formatDate(start)}\n`;
                    icsContent += `DTEND;VALUE=DATE:${formatDate(end)}\n`;
                    icsContent += `SUMMARY:${node.text || 'Task'}\n`;
                    icsContent += `DESCRIPTION:${node.memo || ''}\n`;
                    icsContent += "END:VEVENT\n";
                });
            }
            if (node.children) {
                node.children.forEach(child => processNode(child));
            }
        };

        this.data.forEach(project => processNode(project));

        icsContent += "END:VCALENDAR";

        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `schedule_${new Date().toISOString().slice(0, 10)}.ics`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    async captureScreen() {
        if (!window.html2canvas) {
            // Dynamically load html2canvas
            const script = document.createElement('script');
            script.src = 'https://html2canvas.hertzen.com/dist/html2canvas.min.js';
            script.onload = () => this.captureScreen();
            script.onerror = () => alert('Failed to load screen capture library.');
            document.head.appendChild(script);
            return;
        }

        try {
            // Select the area to capture (app container)
            const target = document.querySelector('.app-container') || document.body;
            const canvas = await html2canvas(target, {
                scale: window.devicePixelRatio, // High resolution
                logging: false,
                useCORS: true
            });
            const link = document.createElement('a');
            link.download = `screenshot_${new Date().toISOString().slice(0, 19).replace(/[:]/g, '-')}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        } catch (err) {
            console.error(err);
            alert('Screen capture failed: ' + err.message);
        }
    },

    downloadStartupScript() {
        if (!confirm('윈도우 시작 시 "백그라운드 모드"로 자동 실행되도록 설정하시겠습니까?\n\n[장점]\n1. 부팅 시 서버가 자동으로 켜집니다.\n2. CMD 검은 창이 뜨지 않고 조용히 실행됩니다.\n\n다운로드된 "install_startup.bat" 파일을 한 번만 실행하시면 설정이 완료됩니다.')) {
            const checkbox = document.getElementById('settingRunOnStartup');
            if (checkbox) checkbox.checked = false;
            return;
        }

        const vbsContent = `Set WshShell = CreateObject("WScript.Shell")\nWshShell.Run "python server.py", 0, False`;

        const batContent = `@echo off
title Quantum Scheduler Startup Installer
echo.
echo [ 1/2 ] Creating Background Runner Script...
echo Set WshShell = CreateObject("WScript.Shell") > QuantumScheduler.vbs
echo WshShell.Run "python server.py", 0, False >> QuantumScheduler.vbs

echo [ 2/2 ] Registering to Windows Startup...
set "TARGET_DIR=%~dp0"
set "SHORTCUT_PATH=%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\QuantumLauncher.bat"

echo.
echo Target Directory: %TARGET_DIR%
echo.

:: Create a launcher bat in the Startup folder that points to THIS directory
echo @echo off > "%SHORTCUT_PATH%"
echo cd /d "%TARGET_DIR%" >> "%SHORTCUT_PATH%"
echo wscript.exe QuantumScheduler.vbs >> "%SHORTCUT_PATH%"

echo.
echo ========================================================
echo  Success! Quantum Scheduler is now registered.
echo  It will run silently in the background on next boot.
echo.
pause`;

        const blob = new Blob([batContent], { type: 'application/x-bat' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'install_startup.bat';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    ,

    editProjectName(id, el) {
        if (el.querySelector('input')) return;
        const currentName = el.innerText;
        el.innerHTML = '';
        const input = document.createElement('input');
        input.value = currentName;
        input.onclick = (e) => e.stopPropagation();
        const save = () => {
            const newName = input.value || "Untitled";
            const node = this.findNode(id);
            if (node) {
                this.saveState();
                node.name = newName;
            }
            this.renderTasks();
        };
        input.addEventListener('blur', save);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
        el.appendChild(input);
        input.focus();
    }

});
