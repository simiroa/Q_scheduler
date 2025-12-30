import { Scheduler } from './core.js';

Object.assign(Scheduler.prototype, {

    setupKeyboardHandlers() {
        document.addEventListener('keydown', (e) => {
            // Undo: Ctrl+Z
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                this.undo();
                return;
            }
            // Redo: Ctrl+Y or Ctrl+Shift+Z
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                e.preventDefault();
                this.redo();
                return;
            }
            // Delete selected segments
            if (e.key === 'Delete') {
                if (this.selectedSegments.size > 0) {
                    this.confirmDeleteSegments();
                } else if (this.selectedTaskIds.size > 0) {
                    // Batch delete selected tasks
                    this.confirmDeleteTasks();
                }
            }

            // Enter: Create new task (but skip if in memo or edit modal)
            if (e.key === 'Enter') {
                // Skip if memo panel is focused
                if (document.activeElement &&
                    (document.activeElement.id === 'memoTextarea' ||
                        document.activeElement.closest('#memoPanel'))) {
                    return; // Let Enter work as line break in memo
                }

                // Skip if edit modal is open
                const editModal = document.getElementById('editModal');
                if (editModal && editModal.style.display !== 'none' && editModal.style.display !== '') {
                    return; // Handled by modal's own Enter handler
                }

                e.preventDefault();
                if (!this.currentProjectName) {
                    alert('먼저 프로젝트를 생성하거나 선택하세요.');
                    return;
                }

                this.saveState();

                const newId = Date.now();
                const colors = ['#5e6ad2', '#26b5ce', '#46c28e', '#f59e0b', '#ef4444', '#8b5cf6'];
                const randColor = colors[Math.floor(Math.random() * colors.length)];

                const newTask = {
                    id: newId,
                    name: "New Task",
                    expanded: true,
                    color: randColor,
                    segments: [{ id: `s${newId}`, startOffset: 0, duration: 3, includeWeekends: true }],
                    children: []
                };

                // Use lastSelectedTaskId as anchor
                const anchorId = this.lastSelectedTaskId || this.selectedTaskId;

                if (e.shiftKey && anchorId) { // Shift + Enter: Add Child
                    const parent = this.findNode(anchorId);
                    if (parent) {
                        if (!parent.children) parent.children = [];
                        this.applyInheritedColor(newTask, parent.color);
                        parent.children.unshift(newTask); // Add to top of children
                        parent.expanded = true;
                        this.updateAncestorSchedules(parent);
                        this.selectTask(newId);
                    }
                }
                // Enter: Add Sibling
                else if (anchorId) {
                    const { parent, index } = this.findNodeParent(anchorId);
                    if (parent) {
                        parent.children.splice(index + 1, 0, newTask);
                    } else {
                        // Root level
                        const index = this.data.findIndex(t => t.id == anchorId);
                        if (index !== -1) {
                            this.data.splice(index + 1, 0, newTask);
                        } else {
                            this.data.push(newTask);
                        }
                    }
                    this.selectTask(newId);
                } else { // No selection: Add to bottom
                    this.data.push(newTask);
                    this.selectTask(newId);
                }

                this.renderTasks();
            }
        });
    },

    confirmDeleteTasks(taskIds = null) {
        const ids = taskIds && taskIds.length ? taskIds : Array.from(this.selectedTaskIds);
        if (ids.length === 0) return;

        const singleName = ids.length === 1 ? (this.findNode(ids[0])?.name || '작업') : null;
        const message = ids.length === 1
            ? `"${singleName}" 작업을 삭제하시겠습니까?\n하위 작업도 함께 삭제됩니다.`
            : `선택한 ${ids.length}개 작업을 삭제하시겠습니까?\n하위 작업도 함께 삭제됩니다.`;

        this.openConfirmModal({
            title: '<span class="material-icons" style="vertical-align:middle; margin-right:8px; color:#ef4444;">delete</span>작업 삭제',
            message,
            confirmText: '삭제',
            onConfirm: () => {
                this.saveState();
                this.selectedTaskIds = new Set(ids);
                this.deleteSelectedTasks();
            }
        });
    },

    confirmDeleteSegments(segmentIds = null) {
        const ids = segmentIds && segmentIds.length ? segmentIds : Array.from(this.selectedSegments);
        if (ids.length === 0) return;

        const message = ids.length === 1
            ? '선택한 일정 1개를 삭제하시겠습니까?'
            : `선택한 일정 ${ids.length}개를 삭제하시겠습니까?`;

        this.openConfirmModal({
            title: '<span class="material-icons" style="vertical-align:middle; margin-right:8px; color:#ef4444;">delete</span>일정 삭제',
            message,
            confirmText: '삭제',
            onConfirm: () => {
                this.saveState();
                this.selectedSegments = new Set(ids);
                this.deleteSelectedSegments();
            }
        });
    },

    // --- Sidebar Drag & Drop ---

    handleDragStart(e, nodeId) {
        this.dragSourceId = nodeId;
        e.dataTransfer.effectAllowed = 'move';
        // Set drag image or data if needed
        e.dataTransfer.setData('text/plain', String(nodeId));

        // Add dragging class for visual feedback
        requestAnimationFrame(() => {
            const targetEl = e.target.closest('.task-row-label');
            if (targetEl) targetEl.classList.add('dragging');
        });
    },

    handleDragEnd(e) {
        // Clean up: remove dragging class from all items
        document.querySelectorAll('.task-row-label.dragging').forEach(el => {
            el.classList.remove('dragging');
        });
        document.querySelectorAll('.drag-over-top, .drag-over-center, .drag-over-bottom').forEach(el => {
            el.classList.remove('drag-over-top', 'drag-over-center', 'drag-over-bottom');
        });
        if (this.els?.sidebarDropGhost) {
            this.els.sidebarDropGhost.style.display = 'none';
        }
        this.dragSourceId = null;
        this.dropPosition = null;
        this.dropTargetId = null;
    },

    handleDragOver(e, targetNodeId) {
        e.preventDefault(); // Necessary to allow dropping
        e.dataTransfer.dropEffect = 'move';

        const targetEl = e.currentTarget; // The .task-row-label

        // Remove existing classes first
        targetEl.classList.remove('drag-over-top', 'drag-over-center', 'drag-over-bottom');

        if (this.dragSourceId == targetNodeId) return;
        this.dropTargetId = targetNodeId;

        // Calculate drop position
        const rect = targetEl.getBoundingClientRect();
        const offsetY = e.clientY - rect.top;
        const height = rect.height;

        const zoneHeight = height / 3;

        if (offsetY < zoneHeight) {
            targetEl.classList.add('drag-over-top');
            this.dropPosition = 'before';
            this.showSidebarDropGhost(targetEl, 'before');
        } else if (offsetY > height - zoneHeight) {
            targetEl.classList.add('drag-over-bottom');
            this.dropPosition = 'after';
            this.showSidebarDropGhost(targetEl, 'after');
        } else {
            targetEl.classList.add('drag-over-center');
            this.dropPosition = 'child';
            this.showSidebarDropGhost(targetEl, 'child');
        }
    },

    handleDragLeave(e) {
        e.currentTarget.classList.remove('drag-over-top', 'drag-over-center', 'drag-over-bottom');
        if (this.els?.sidebarDropGhost) {
            this.els.sidebarDropGhost.style.display = 'none';
        }
    },

    handleDrop(e, targetNodeId) {
        e.preventDefault();
        e.stopPropagation();

        const targetEl = e.currentTarget;
        targetEl.classList.remove('drag-over-top', 'drag-over-center', 'drag-over-bottom');
        if (this.els?.sidebarDropGhost) {
            this.els.sidebarDropGhost.style.display = 'none';
        }

        // Find the drag source element and remove dragging class
        const sourceEl = document.querySelector('.task-row-label.dragging');
        if (sourceEl) sourceEl.classList.remove('dragging');

        if (this.dragSourceId && this.dragSourceId != targetNodeId) {
            this.moveNode(this.dragSourceId, targetNodeId, this.dropPosition);
        }

        this.dragSourceId = null;
        this.dropPosition = null;
        this.dropTargetId = null;
    },

    moveNode(sourceId, targetId, position, options = {}) {
        const shouldSave = options.save !== false;
        const shouldRender = options.render !== false;

        // 1. Find source and remove it from its current location
        const sourceInfo = this.findNodeParent(sourceId);
        if (!sourceInfo) return; // Should not happen

        const { parent: oldParent, index: oldIndex } = sourceInfo;
        const sourceNode = oldParent ? oldParent.children[oldIndex] : this.data[oldIndex];
        let newParent = null;

        // 2. Check for circular dependency (cannot move parent into its own child)
        if (this.isDescendant(sourceNode, targetId)) {
            alert('Cannot move a folder into its own sub-folder.');
            return;
        }

        // Remove from old location
        if (oldParent) {
            oldParent.children.splice(oldIndex, 1);
            // If parent has no more children, we might want to update its expanded state or UI? 
            // Optional: if (oldParent.children.length === 0) oldParent.expanded = false; 
        } else {
            this.data.splice(oldIndex, 1);
        }

        // 3. Insert into new location
        if (position === 'child') {
            const targetNode = this.findNode(targetId);
            if (targetNode) {
                if (!targetNode.children) targetNode.children = [];
                this.applyInheritedColor(sourceNode, targetNode.color);
                targetNode.children.push(sourceNode);
                targetNode.expanded = true; // Auto-expand to show dropped item
                newParent = targetNode;
            }
        } else {
            // Sibling (before or after)
            const targetInfo = this.findNodeParent(targetId);
            if (targetInfo) {
                // Adjust index if we removed from the same array before the target
                // Actually, since we already removed it, we just insert at targetIndex (before) or targetIndex+1 (after)
                // BUT: We need to be careful if old and new parent are the same.
                // If same parent:
                //   If oldIndex < targetIndex: removal shifted target down by 1. 
                //   So targetIndex is now actually targetIndex - 1.
                // Converting logic:

                // Simpler approach: Determine insert index based on CURRENT state (after removal)
                // But wait, findNodeParent(targetId) might return stale index if we used cached data? 
                // No, we modify references.

                // Let's re-find target index just to be safe after modification
                const freshTargetInfo = this.findNodeParent(targetId);
                const freshIndex = freshTargetInfo.index;
                const freshParent = freshTargetInfo.parent;
                const freshArray = freshParent ? freshParent.children : this.data;

                const insertIndex = position === 'before' ? freshIndex : freshIndex + 1;
                freshArray.splice(insertIndex, 0, sourceNode);
                newParent = freshParent;
            }
        }

        if (newParent) {
            this.applyInheritedColor(sourceNode, newParent.color);
        }
        if (oldParent) {
            this.updateAncestorSchedules(oldParent);
        }
        if (newParent && newParent !== oldParent) {
            this.updateAncestorSchedules(newParent);
        }

        if (shouldSave) this.saveState();
        if (shouldRender) this.renderTasks();
    },

    isDescendant(parent, childId) {
        if (!parent.children) return false;
        for (let child of parent.children) {
            if (child.id == childId) return true;
            if (this.isDescendant(child, childId)) return true;
        }
        return false;
    },

    getVisibleRowIndexById(taskId) {
        if (!this.visibleRows) return -1;
        return this.visibleRows.findIndex(row => row.id == taskId);
    },

    findSegmentOwner(segId, nodes = this.data) {
        for (const node of nodes) {
            if (node.segments) {
                const seg = node.segments.find(s => s.id === segId);
                if (seg) return { node, seg };
            }
            if (node.children) {
                const found = this.findSegmentOwner(segId, node.children);
                if (found) return found;
            }
        }
        return null;
    },

    getMultiDragSegments(activeSegId) {
        if (!this.selectedSegments || this.selectedSegments.size <= 1) return null;
        if (!this.selectedSegments.has(activeSegId)) return null;
        const segments = [];
        this.selectedSegments.forEach((segId) => {
            const match = this.findSegmentOwner(segId);
            if (!match) return;
            segments.push({
                nodeId: match.node.id,
                segmentId: match.seg.id,
                startOffset: match.seg.startOffset,
                duration: match.seg.duration,
                isEvent: !!match.seg.isEvent
            });
        });
        return segments.length > 1 ? segments : null;
    },

    createMultiDragGhosts(segments, excludeId) {
        if (!segments || segments.length === 0) return [];
        const ghosts = [];
        segments.forEach((info) => {
            if (info.segmentId === excludeId) return;
            const el = this.els.timelineGrid?.querySelector(`[data-sid="${info.segmentId}"]`);
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const ghost = el.cloneNode(true);
            ghost.classList.add('drag-ghost', 'multi-drag-ghost');
            ghost.style.position = 'fixed';
            ghost.style.left = `${rect.left}px`;
            ghost.style.top = `${rect.top}px`;
            ghost.style.width = `${rect.width}px`;
            ghost.style.height = `${rect.height}px`;
            ghost.style.opacity = '0.6';
            ghost.style.pointerEvents = 'none';
            ghost.style.zIndex = '9999';
            if (ghost.classList.contains('event-marker')) {
                ghost.style.transform = 'none';
            }
            document.body.appendChild(ghost);
            ghosts.push({ el: ghost, initialLeft: rect.left });
        });
        return ghosts;
    },

    createMultiResizeGhosts(multiSegments, excludeSid) {
        const ghosts = [];
        multiSegments.forEach(info => {
            if (info.segmentId === excludeSid) return;
            const owner = this.findSegmentOwner(info.segmentId);
            if (!owner) return;

            // Find the actual DOM element for this segment
            // (We iterate visible rows or look up by data attributes)
            const bar = this.els.taskLayer.querySelector(`.task-bar[data-sid="${info.segmentId}"]`);
            if (!bar) return; // Might be off-screen or filtered

            const rect = bar.getBoundingClientRect();
            const ghost = bar.cloneNode(true);
            ghost.classList.add('resize-ghost', 'multi-drag-ghost');
            ghost.style.position = 'fixed';
            ghost.style.left = `${rect.left}px`;
            ghost.style.top = `${rect.top}px`;
            ghost.style.width = `${rect.width}px`;
            ghost.style.height = `${rect.height}px`;
            ghost.style.zIndex = '9999';
            document.body.appendChild(ghost);

            ghosts.push({
                el: ghost,
                initialLeft: rect.left,
                initialWidth: rect.width,
                segmentId: info.segmentId
            });

            // Dim original
            bar.style.opacity = '0.3';
        });
        return ghosts;
    },

    cleanupMultiGhosts() {
        if (!this.dragState?.multiGhosts) return;
        this.dragState.multiGhosts.forEach((ghost) => {
            if (ghost.el && ghost.el.parentNode) {
                ghost.el.parentNode.removeChild(ghost.el);
            }
        });
        this.dragState.multiGhosts = null;
    },

    getResizeDeltaBounds(segments, dir) {
        if (!segments || segments.length === 0) {
            return { min: 0, max: 0 };
        }
        let min = -Infinity;
        let max = Infinity;
        if (dir === 'right') {
            segments.forEach(({ duration }) => {
                if (typeof duration !== 'number') return;
                const lower = 1 - duration;
                if (lower > min) min = lower;
            });
        } else {
            segments.forEach(({ startOffset, duration }) => {
                if (typeof startOffset !== 'number' || typeof duration !== 'number') return;
                const lower = -startOffset;
                const upper = duration - 1;
                if (lower > min) min = lower;
                if (upper < max) max = upper;
            });
        }
        if (!isFinite(min)) min = 0;
        if (!isFinite(max)) max = dir === 'right' ? Infinity : 0;
        return { min, max };
    },

    clearTimelineDropTarget() {
        if (this.dragState?.hierarchyRowEl) {
            this.dragState.hierarchyRowEl.classList.remove('drag-over-top', 'drag-over-center', 'drag-over-bottom');
        }
        if (this.els?.timelineDropGhost) {
            this.els.timelineDropGhost.style.display = 'none';
        }
        if (this.dragState) {
            this.dragState.hierarchyRowEl = null;
            this.dragState.hierarchyTargetId = null;
            this.dragState.hierarchyPosition = null;
        }
    },

    clearSidebarDropTarget() {
        document.querySelectorAll('.drag-over-top, .drag-over-center, .drag-over-bottom').forEach(el => {
            el.classList.remove('drag-over-top', 'drag-over-center', 'drag-over-bottom');
        });
        if (this.els?.sidebarDropGhost) {
            this.els.sidebarDropGhost.style.display = 'none';
        }
        this.dropTargetId = null;
    },

    showSidebarDropGhost(targetEl, position) {
        if (!this.els?.sidebarDropGhost || !this.els?.sidebarScrollArea) return;
        if (position === 'child') {
            this.els.sidebarDropGhost.style.display = 'none';
            return;
        }
        const targetRect = targetEl.getBoundingClientRect();
        const containerRect = this.els.sidebarScrollArea.getBoundingClientRect();
        const top = (position === 'before' ? targetRect.top : targetRect.bottom) - containerRect.top + this.els.sidebarScrollArea.scrollTop;
        this.els.sidebarDropGhost.style.top = `${top}px`;
        this.els.sidebarDropGhost.style.display = 'block';
    },

    showTimelineDropGhost(top) {
        if (!this.els?.timelineDropGhost) return;
        this.els.timelineDropGhost.style.top = `${top}px`;
        this.els.timelineDropGhost.style.display = 'block';
    },

    updateMouseGuideLine(e) {
        if (!this.els?.mouseGuideLine || !this.els?.timelineBody) return;
        const rect = this.els.timelineBody.getBoundingClientRect();
        const x = e.clientX - rect.left + this.els.timelineBody.scrollLeft;
        const snapped = Math.max(0, Math.floor(x / this.config.cellWidth) * this.config.cellWidth);
        this.els.mouseGuideLine.style.left = `${snapped}px`;
        this.els.mouseGuideLine.style.height = `${this.els.timelineGrid.scrollHeight}px`;
        this.els.mouseGuideLine.style.display = 'block';
    },

    hideMouseGuideLine() {
        if (this.els?.mouseGuideLine) {
            this.els.mouseGuideLine.style.display = 'none';
        }
    },

    handleListDragOver(e) {
        if (!this.dragSourceId) return;
        if (e.target.closest('.task-row-label')) return;
        e.preventDefault();

        const rows = this.visibleRows || this.getVisibleRows();
        if (!rows.length) return;
        const lastRowEl = this.els.sidebarList.lastElementChild;
        if (!lastRowEl) return;

        const lastRect = lastRowEl.getBoundingClientRect();
        if (e.clientY >= lastRect.bottom) {
            this.clearSidebarDropTarget();
            lastRowEl.classList.add('drag-over-bottom');
            this.dropPosition = 'after';
            this.dropTargetId = rows[rows.length - 1].id;
            this.showSidebarDropGhost(lastRowEl, 'after');
        }
    },

    handleListDrop(e) {
        if (!this.dragSourceId || e.target.closest('.task-row-label')) return;
        e.preventDefault();
        const targetId = this.dropTargetId;
        if (this.dragSourceId && targetId && this.dragSourceId != targetId) {
            this.moveNode(this.dragSourceId, targetId, this.dropPosition);
        }
        this.clearSidebarDropTarget();
        this.dragSourceId = null;
        this.dropPosition = null;
    },

    updateTimelineDropTarget(e) {
        const bodyRect = this.els.timelineBody.getBoundingClientRect();
        if (e.clientX < bodyRect.left || e.clientX > bodyRect.right ||
            e.clientY < bodyRect.top || e.clientY > bodyRect.bottom) {
            this.clearTimelineDropTarget();
            return;
        }

        const rows = this.visibleRows || this.getVisibleRows();
        if (!rows.length) {
            this.clearTimelineDropTarget();
            return;
        }

        const y = e.clientY - bodyRect.top + this.els.timelineBody.scrollTop;
        let rowIndex = Math.floor(y / this.config.rowHeight);
        if (rowIndex < 0) {
            this.clearTimelineDropTarget();
            return;
        }
        if (rowIndex >= rows.length) {
            rowIndex = rows.length - 1;
        }

        const targetRow = rows[rowIndex];
        const sourceId = this.dragState.projectId;
        if (!targetRow || targetRow.id == sourceId) {
            this.clearTimelineDropTarget();
            return;
        }

        const sourceNode = this.findNode(sourceId);
        if (sourceNode && this.isDescendant(sourceNode, targetRow.id)) {
            this.clearTimelineDropTarget();
            return;
        }

        const rowEl = this.els.timelineRows.children[rowIndex];
        if (!rowEl) {
            this.clearTimelineDropTarget();
            return;
        }
        const rowTop = rowEl.offsetTop;
        const rowHeight = rowEl.offsetHeight || this.config.rowHeight;
        const offsetY = y - rowTop;
        const zoneHeight = rowHeight / 3;

        let position = 'child';
        if (offsetY < zoneHeight) {
            position = 'before';
        } else if (offsetY > rowHeight - zoneHeight) {
            position = 'after';
        }

        if (rowIndex === rows.length - 1 && y > rowTop + rowHeight) {
            position = 'after';
        }

        if (this.dragState.hierarchyRowEl && this.dragState.hierarchyRowEl !== rowEl) {
            this.dragState.hierarchyRowEl.classList.remove('drag-over-top', 'drag-over-center', 'drag-over-bottom');
        }
        rowEl.classList.remove('drag-over-top', 'drag-over-center', 'drag-over-bottom');
        if (position === 'before') {
            rowEl.classList.add('drag-over-top');
            this.showTimelineDropGhost(rowTop);
        } else if (position === 'after') {
            rowEl.classList.add('drag-over-bottom');
            this.showTimelineDropGhost(rowTop + rowHeight);
        } else {
            rowEl.classList.add('drag-over-center');
            if (this.els?.timelineDropGhost) {
                this.els.timelineDropGhost.style.display = 'none';
            }
        }

        this.dragState.hierarchyRowEl = rowEl;
        this.dragState.hierarchyTargetId = targetRow.id;
        this.dragState.hierarchyPosition = position;
    },

    // --- Panning (Left-click without shift) ---
    setupPanning() {
        this.els.timelineBody.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return; // Left-click only
            if (e.shiftKey) return; // Shift is for selection
            if (e.target.closest('.task-bar')) return;

            this.panState = {
                isPanning: true,
                startX: e.clientX,
                startY: e.clientY,
                startScrollLeft: this.els.timelineBody.scrollLeft,
                startScrollTop: this.els.timelineBody.scrollTop
            };
            this.els.timelineBody.style.cursor = 'grabbing';
            e.preventDefault();
        });

        this.els.timelineBody.addEventListener('contextmenu', (e) => {
            if (!e.target.closest('.task-bar') && !e.target.closest('.time-cell-day')) {
                e.preventDefault(); // Prevent context menu on empty area
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.panState.isPanning) return;
            const dx = e.clientX - this.panState.startX;
            const dy = e.clientY - this.panState.startY;
            this.els.timelineBody.scrollLeft = this.panState.startScrollLeft - dx;
            // this.els.timelineBody.scrollTop = this.panState.startScrollTop - dy; // Disable vertical dragging
        });

        document.addEventListener('mouseup', (e) => {
            if (this.panState.isPanning) {
                this.panState.isPanning = false;
                this.els.timelineBody.style.cursor = '';
            }
        });
    },

    // --- Drag Selection (Shift + Left-click) ---

    setupDragSelection() {
        const selBox = this.els.selectionBox;
        const timelineBody = this.els.timelineBody;

        // Use document-level capture to ensure we catch shift+drag even on task bars
        document.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return; // Left-click only
            if (!e.shiftKey) return; // Require Shift key

            // Only start if clicking within timeline area
            const bodyRect = timelineBody.getBoundingClientRect();
            if (e.clientX < bodyRect.left || e.clientX > bodyRect.right ||
                e.clientY < bodyRect.top || e.clientY > bodyRect.bottom) {
                return;
            }

            this.selectState = {
                isSelecting: false, // Don't start until we've moved
                isPending: true,    // Pending until minimum drag
                startX: e.clientX,
                startY: e.clientY,
                rectLeft: bodyRect.left,
                rectTop: bodyRect.top,
                scrollLeft: timelineBody.scrollLeft,
                scrollTop: timelineBody.scrollTop
            };

            e.preventDefault(); // Prevent text selection
        }, true); // capture phase

        document.addEventListener('mousemove', (e) => {
            if (!this.selectState?.isPending && !this.selectState?.isSelecting) return;

            const dx = Math.abs(e.clientX - this.selectState.startX);
            const dy = Math.abs(e.clientY - this.selectState.startY);

            // Start selection only after minimum drag distance (5px) - prevents conflict with double-click
            if (this.selectState.isPending && (dx > 5 || dy > 5)) {
                this.selectState.isPending = false;
                this.selectState.isSelecting = true;
                this.selectedSegments.clear();
                selBox.style.display = 'block';
            }

            if (!this.selectState.isSelecting) return;

            const x1 = Math.min(this.selectState.startX, e.clientX);
            const y1 = Math.min(this.selectState.startY, e.clientY);
            const x2 = Math.max(this.selectState.startX, e.clientX);
            const y2 = Math.max(this.selectState.startY, e.clientY);

            selBox.style.left = `${x1}px`;
            selBox.style.top = `${y1}px`;
            selBox.style.width = `${x2 - x1}px`;
            selBox.style.height = `${y2 - y1}px`;
        });

        // Use capture phase to ensure this handler fires FIRST before any other mouseup handlers
        document.addEventListener('mouseup', (e) => {
            // Cancel pending selection (was just a click, not a drag)
            if (this.selectState?.isPending) {
                this.selectState.isPending = false;
                this.selectState.isSelecting = false;
                selBox.style.display = 'none';
                return;
            }

            if (!this.selectState?.isSelecting) return;

            // CRITICAL: Get rect BEFORE hiding the box
            const selRect = {
                left: selBox.getBoundingClientRect().left,
                right: selBox.getBoundingClientRect().right,
                top: selBox.getBoundingClientRect().top,
                bottom: selBox.getBoundingClientRect().bottom
            };
            selBox.style.display = 'none';

            // Find ALL bars/markers in selection rect (from both layers)
            const taskBars = Array.from(this.els.taskLayer.querySelectorAll('.task-bar:not(.collapsed-child)'));
            const eventMarkers = this.els.eventLayer ? Array.from(this.els.eventLayer.querySelectorAll('.event-marker')) : [];
            const allElements = [...taskBars, ...eventMarkers];

            allElements.forEach(el => {
                const elRect = el.getBoundingClientRect();
                // Check intersection: overlaps if NOT (separated)
                const separated = elRect.left > selRect.right ||
                    elRect.right < selRect.left ||
                    elRect.top > selRect.bottom ||
                    elRect.bottom < selRect.top;
                if (!separated) {
                    this.selectedSegments.add(el.dataset.sid);
                }
            });

            this.selectState.isSelecting = false;

            // Set flag to prevent immediate click handlers from firing (if start was on a task)
            this.selectState.justFinished = true;
            setTimeout(() => { if (this.selectState) this.selectState.justFinished = false; }, 50);

            this.renderTasks();
        }, true); // <- capture: true to run first
    },


    rectsIntersect(r1, r2) {
        // Standard rectangle intersection with 5px buffer for forgiving selection
        // Returns true if any part of r2 overlaps or nearly touches r1
        const buffer = 5;
        return !(r2.left > r1.right + buffer ||
            r2.right < r1.left - buffer ||
            r2.top > r1.bottom + buffer ||
            r2.bottom < r1.top - buffer);
    },

    // --- Zoom ---

    setupZoom() {
        this.els.timelineBody.addEventListener('wheel', (e) => {
            if (!e.ctrlKey && !e.metaKey) {
                e.preventDefault();

                const delta = e.deltaY > 0 ? -0.1 : 0.1;
                let newZoom = this.config.zoomLevel + delta;
                newZoom = Math.max(this.config.minZoom, Math.min(this.config.maxZoom, newZoom));

                if (newZoom !== this.config.zoomLevel) {
                    const rect = this.els.timelineBody.getBoundingClientRect();
                    const mouseX = e.clientX - rect.left;
                    const scrollLeft = this.els.timelineBody.scrollLeft;
                    const oldPos = scrollLeft + mouseX;
                    const dayUnderMouse = oldPos / this.config.cellWidth;

                    this.config.zoomLevel = newZoom;
                    this.config.cellWidth = Math.round(this.config.baseCellWidth * newZoom);

                    this.renderTimelineStructure();

                    const newPos = dayUnderMouse * this.config.cellWidth;
                    this.els.timelineBody.scrollLeft = newPos - mouseX;
                }
            }
        }, { passive: false });
    },

    // --- NOW Marker ---

    // --- Interaction ---
    toggleExpand(id) {
        const node = this.findNode(id);
        if (node) { node.expanded = !node.expanded; this.renderTasks(); }
    },


    attachTaskEvents(bar, pid, sid) {
        bar.addEventListener('mousedown', (e) => {
            if (this.isProjectLocked) return;
            if (e.button !== 0) return;
            if (e.shiftKey) return; // Shift: Bubble to timeline for box selection

            // Stop propagation immediately so it doesn't trigger timeline panning
            e.stopPropagation();

            if (e.target.classList.contains('resize-handle')) {
                this.startResize(e, bar, pid, sid, e.target.dataset.dir);
            } else {
                this.clearTimelineDropTarget();
                // Initialize pending drag
                this.dragState = {
                    isPending: true,
                    isDragging: false,
                    isResizing: false,
                    projectId: pid,
                    segmentId: sid,
                    initialX: e.clientX,
                    initialY: e.clientY,
                    el: bar,
                    hierarchyTargetId: null,
                    hierarchyPosition: null,
                    hierarchyRowEl: null
                };
            }
        });
    },


    startDrag(e, bar, pid, sid) {
        // e is now the mousemove event that confirmed the drag
        const barRect = bar.getBoundingClientRect();
        const node = this.findNode(pid);
        const seg = node?.segments?.find(s => s.id === sid);
        const multiDragSegments = this.getMultiDragSegments(sid);
        const multiGhosts = this.createMultiDragGhosts(multiDragSegments, sid);

        // Create ghost preview element
        const ghost = bar.cloneNode(true);
        ghost.classList.add('drag-ghost');
        ghost.style.position = 'fixed';
        ghost.style.left = `${barRect.left}px`;
        ghost.style.top = `${barRect.top}px`;
        ghost.style.width = `${barRect.width}px`;
        ghost.style.height = `${barRect.height}px`;
        ghost.style.opacity = '0.7';
        ghost.style.pointerEvents = 'none';
        ghost.style.zIndex = '9999';
        document.body.appendChild(ghost);

        // Update dragState to active dragging
        this.dragState = {
            ...this.dragState, // Keep existing state (projectId, etc)
            isPending: false,
            isDragging: true,
            initialGhostLeft: barRect.left,
            initialLeft: parseFloat(bar.style.left),
            initialWidth: parseFloat(bar.style.width),
            initialSegStart: seg?.startOffset ?? 0,
            multiDragSegments,
            multiGhosts,
            ghost: ghost
        };
        bar.style.opacity = '0.3'; // Dim original
    },


    startResize(e, bar, pid, sid, dir) {
        e.preventDefault(); e.stopPropagation();
        this.clearTimelineDropTarget();

        const barRect = bar.getBoundingClientRect();
        const ghost = bar.cloneNode(true);
        ghost.classList.add('resize-ghost');
        ghost.style.position = 'fixed';
        ghost.style.left = `${barRect.left}px`;
        ghost.style.top = `${barRect.top}px`;
        ghost.style.width = `${barRect.width}px`;
        ghost.style.height = `${barRect.height}px`;
        ghost.style.opacity = '0.7';
        ghost.style.pointerEvents = 'none';
        ghost.style.zIndex = '9999';
        document.body.appendChild(ghost);

        const node = this.findNode(pid);
        const seg = node?.segments?.find(s => s.id === sid);
        const multiResizeSegments = [];
        if (this.selectedSegments?.size > 1 && this.selectedSegments.has(sid)) {
            this.selectedSegments.forEach((segId) => {
                const match = this.findSegmentOwner(segId);
                if (!match || match.seg?.isEvent) return;
                multiResizeSegments.push({
                    nodeId: match.node.id,
                    segmentId: match.seg.id,
                    startOffset: match.seg.startOffset,
                    duration: match.seg.duration
                });
            });
        }

        this.dragState = {
            isDragging: false, isResizing: true, resizeDir: dir,
            projectId: pid, segmentId: sid,
            initialX: e.clientX,
            initialGhostLeft: barRect.left,
            initialLeft: parseFloat(bar.style.left),
            initialWidth: parseFloat(bar.style.width),
            initialSegStart: seg?.startOffset ?? 0,
            initialSegDuration: seg?.duration ?? 1,
            multiResizeSegments: multiResizeSegments.length > 1 ? multiResizeSegments : null,
            multiGhosts: multiResizeSegments.length > 1 ? this.createMultiResizeGhosts(multiResizeSegments, sid) : null,
            el: bar,
            ghost: ghost
        };
        bar.style.opacity = '0.3';
    },


    startEventDrag(e, marker, pid, sid, rowIndex) {
        e.preventDefault();
        e.stopPropagation();
        this.clearTimelineDropTarget();

        const markerRect = marker.getBoundingClientRect();
        const node = this.findNode(pid);
        const seg = node?.segments?.find(s => s.id === sid);
        const multiDragSegments = this.getMultiDragSegments(sid);
        const multiGhosts = this.createMultiDragGhosts(multiDragSegments, sid);
        const ghost = document.createElement('div');
        ghost.className = 'event-marker drag-ghost';
        ghost.style.position = 'fixed';
        ghost.style.left = `${markerRect.left + markerRect.width / 2}px`;
        ghost.style.top = `${markerRect.top + markerRect.height / 2}px`;
        ghost.style.width = `${markerRect.width}px`;
        ghost.style.height = `${markerRect.height}px`;
        ghost.style.opacity = '0.7';
        ghost.style.pointerEvents = 'none';
        ghost.style.zIndex = '9999';
        ghost.innerHTML = '<div class="diamond-inner"></div>';
        document.body.appendChild(ghost);

        this.dragState = {
            isDragging: true, isResizing: false, isEventDrag: true,
            projectId: pid, segmentId: sid,
            initialX: e.clientX,
            initialGhostLeft: markerRect.left + markerRect.width / 2,
            initialLeft: parseFloat(marker.style.left),
            initialSegStart: seg?.startOffset ?? 0,
            multiDragSegments,
            multiGhosts,
            el: marker,
            ghost: ghost
        };
        marker.style.opacity = '0.3';
    },


    onMouseMove(e) {
        if (this.dragState.isPending) {
            const dx = Math.abs(e.clientX - this.dragState.initialX);
            const dy = Math.abs(e.clientY - this.dragState.initialY);
            if (dx > 3 || dy > 3) {
                // Determine drag threshold met, start actual drag
                this.startDrag(e, this.dragState.el, this.dragState.projectId, this.dragState.segmentId);
            }
            return;
        }

        if (!this.dragState.isDragging && !this.dragState.isResizing) return;
        const delta = e.clientX - this.dragState.initialX;
        const cell = this.config.cellWidth;
        const ghost = this.dragState.ghost;

        if (this.dragState.isDragging) {
            // Use initialGhostLeft for fixed-position ghost
            const newLeft = (this.dragState.initialGhostLeft || this.dragState.initialLeft) + delta;

            // For event drag, snap to grid and show guide line
            if (this.dragState.isEventDrag) {
                // Ghost follows mouse directly (using delta from initial position)
                ghost.style.left = `${newLeft}px`;

                // Calculate snapped position for guide line
                const newGridLeft = this.dragState.initialLeft + delta;
                let snappedDayIndex = Math.round((newGridLeft - cell / 2) / cell);
                if (snappedDayIndex < 0) snappedDayIndex = 0;
                const snappedGridLeft = snappedDayIndex * cell + cell / 2; // Center of day

                // Convert snapped grid position to screen position for guide
                const gridRect = this.els.timelineGrid.getBoundingClientRect();
                const snappedScreenX = gridRect.left + snappedGridLeft - this.els.timelineBody.scrollLeft;

                // Show snap guide line at target position
                const guide = this.els.snapGuideLine;
                guide.style.display = 'block';
                guide.style.left = `${snappedScreenX}px`;
                guide.style.top = `${gridRect.top}px`;
                guide.style.height = `${gridRect.height}px`;
            } else {
                ghost.style.left = `${newLeft}px`;
                if (!this.dragState.multiDragSegments) {
                    this.updateTimelineDropTarget(e);
                }
            }

            if (this.dragState.multiGhosts && this.dragState.multiGhosts.length > 0) {
                this.dragState.multiGhosts.forEach((multi) => {
                    multi.el.style.left = `${multi.initialLeft + delta}px`;
                });
            }
        } else if (this.dragState.isResizing) {
            const multiGhosts = this.dragState.multiGhosts;

            if (this.dragState.resizeDir === 'right') {
                const newWidth = Math.max(cell, this.dragState.initialWidth + delta);
                ghost.style.width = `${newWidth}px`;

                if (multiGhosts) {
                    multiGhosts.forEach(m => {
                        const mNewWidth = Math.max(cell, m.initialWidth + delta);
                        m.el.style.width = `${mNewWidth}px`;
                    });
                }
            } else {
                // Use initialGhostLeft for fixed-position ghost
                const l = (this.dragState.initialGhostLeft || this.dragState.initialLeft) + delta;
                const w = this.dragState.initialWidth - delta;
                if (w >= cell) {
                    ghost.style.left = `${l}px`;
                    ghost.style.width = `${w}px`;

                    if (multiGhosts) {
                        multiGhosts.forEach(m => {
                            const mL = m.initialLeft + delta;
                            const mW = m.initialWidth - delta;
                            if (mW >= cell) {
                                m.el.style.left = `${mL}px`;
                                m.el.style.width = `${mW}px`;
                            }
                        });
                    }
                }
            }
        }
    },


    onMouseUp(e) {
        if (this.dragState.isPending) {
            // Mouse didn't move enough -> Treat as Click
            this.handleSegmentClick(e, this.dragState.projectId, this.dragState.segmentId);

            // Handle Memo Logic
            const node = this.findNode(this.dragState.projectId);
            const segment = node?.segments.find(s => s.id === this.dragState.segmentId);
            if (segment && segment.memo) {
                this.ctxState.targetId = node.id;
                this.ctxState.targetSegId = segment.id;
                this.openMemoPanel();
            } else {
                if (!e.ctrlKey && !e.shiftKey) this.closeMemoPanel();
            }

            this.dragState = { isDragging: false, isResizing: false, isPending: false };
            return;
        }

        if (!this.dragState.isDragging && !this.dragState.isResizing) return;

        // Save state for undo before making changes
        this.saveState();

        const cell = this.config.cellWidth;
        const node = this.findNode(this.dragState.projectId);
        const ghost = this.dragState.ghost;
        const seg = node?.segments?.find(s => s.id === this.dragState.segmentId);
        if (!node || !seg) {
            if (ghost && ghost.parentNode) {
                ghost.parentNode.removeChild(ghost);
            }
            this.cleanupMultiGhosts();
            if (this.dragState.el) {
                this.dragState.el.style.opacity = '1';
            }
            if (this.els.snapGuideLine) {
                this.els.snapGuideLine.style.display = 'none';
            }
            this.clearTimelineDropTarget();
            this.dragState = { isDragging: false, isResizing: false };
            this.renderTasks();
            return;
        }

        // Calculate delta from initial mouse position
        const delta = e.clientX - this.dragState.initialX;

        if (this.dragState.isDragging) {
            // Calculate new grid position using initialLeft (grid coords) + delta
            let newLeft = this.dragState.initialLeft + delta;

            // For events, initialLeft includes cell/2 offset for centering
            // Use floor to avoid rounding up to next cell on click
            let snappedOffset;
            if (this.dragState.isEventDrag) {
                // Events: subtract center offset before calculating day index
                snappedOffset = Math.round((newLeft - cell / 2) / cell);
            } else {
                // Regular tasks: use round for snapping
                let snappedLeft = Math.round(newLeft / cell) * cell;
                if (snappedLeft < 0) snappedLeft = 0;
                snappedOffset = Math.round(snappedLeft / cell);
            }
            if (snappedOffset < 0) snappedOffset = 0;
            let deltaDays = snappedOffset - this.dragState.initialSegStart;
            const multiDragSegments = this.dragState.multiDragSegments;
            if (multiDragSegments && multiDragSegments.length > 1) {
                const minStart = Math.min(...multiDragSegments.map(info => info.startOffset));
                if (deltaDays < -minStart) deltaDays = -minStart;
                const touchedNodes = new Map();
                multiDragSegments.forEach((info) => {
                    const owner = this.findSegmentOwner(info.segmentId);
                    if (!owner) return;
                    owner.seg.startOffset = info.startOffset + deltaDays;
                    if (!owner.seg.isEvent) owner.seg.autoSync = false;
                    touchedNodes.set(owner.node.id, owner.node);
                });
                touchedNodes.forEach((node) => {
                    this.mergeSegments(node);
                    this.updateAncestorSchedules(node);
                });
            } else {
                seg.startOffset = snappedOffset;
                if (!seg.isEvent) seg.autoSync = false;
            }
            const bodyRect = this.els.timelineBody.getBoundingClientRect();
            const isInTimeline = e.clientX >= bodyRect.left && e.clientX <= bodyRect.right &&
                e.clientY >= bodyRect.top && e.clientY <= bodyRect.bottom;
            if (!this.dragState.isEventDrag && isInTimeline && this.dragState.hierarchyTargetId && !this.dragState.multiDragSegments) {
                const sourceNode = node;
                const targetId = this.dragState.hierarchyTargetId;
                const position = this.dragState.hierarchyPosition;
                if (targetId && targetId != sourceNode.id && !this.isDescendant(sourceNode, targetId)) {
                    this.moveNode(sourceNode.id, targetId, position, { save: false, render: false });
                }
            }
        } else if (this.dragState.isResizing) {
            const initialStart = this.dragState.initialSegStart ?? seg.startOffset;
            const initialDuration = this.dragState.initialSegDuration ?? seg.duration;
            const multiSegments = this.dragState.multiResizeSegments;
            const touchedNodes = new Map();

            if (this.dragState.resizeDir === 'right') {
                // Right resize: width changes, left stays same
                const newWidth = this.dragState.initialWidth + delta;
                const snappedWidth = Math.round(newWidth / cell) * cell;
                let desiredDuration = Math.max(1, Math.round(snappedWidth / cell));
                let deltaDuration = desiredDuration - initialDuration;

                if (multiSegments) {
                    const { min } = this.getResizeDeltaBounds(multiSegments, 'right');
                    if (deltaDuration < min) deltaDuration = min;
                    multiSegments.forEach((info) => {
                        const owner = this.findSegmentOwner(info.segmentId);
                        if (!owner) return;
                        owner.seg.duration = Math.max(1, info.duration + deltaDuration);
                        if (!owner.seg.isEvent) owner.seg.autoSync = false;
                        touchedNodes.set(owner.node.id, owner.node);
                    });
                } else {
                    seg.duration = Math.max(1, initialDuration + deltaDuration);
                    if (!seg.isEvent) seg.autoSync = false;
                }
            } else {
                // Left resize: left changes, width changes inversely
                const newLeft = this.dragState.initialLeft + delta;
                let snappedLeft = Math.round(newLeft / cell) * cell;
                if (snappedLeft < 0) snappedLeft = 0;
                let desiredStart = Math.round(snappedLeft / cell);
                let deltaStart = desiredStart - initialStart;

                if (multiSegments) {
                    const { min, max } = this.getResizeDeltaBounds(multiSegments, 'left');
                    if (deltaStart < min) deltaStart = min;
                    if (deltaStart > max) deltaStart = max;
                    multiSegments.forEach((info) => {
                        const owner = this.findSegmentOwner(info.segmentId);
                        if (!owner) return;
                        owner.seg.startOffset = info.startOffset + deltaStart;
                        owner.seg.duration = Math.max(1, info.duration - deltaStart);
                        if (!owner.seg.isEvent) owner.seg.autoSync = false;
                        touchedNodes.set(owner.node.id, owner.node);
                    });
                } else {
                    const { min, max } = this.getResizeDeltaBounds([{ startOffset: initialStart, duration: initialDuration }], 'left');
                    if (deltaStart < min) deltaStart = min;
                    if (deltaStart > max) deltaStart = max;
                    seg.startOffset = initialStart + deltaStart;
                    seg.duration = Math.max(1, initialDuration - deltaStart);
                    if (!seg.isEvent) seg.autoSync = false;
                }
            }

            if (multiSegments && touchedNodes.size > 0) {
                touchedNodes.forEach((node) => {
                    this.mergeSegments(node);
                    this.updateAncestorSchedules(node);
                });
            }
        }

        // Cleanup ghost and restore original
        if (ghost && ghost.parentNode) {
            ghost.parentNode.removeChild(ghost);
        }
        this.cleanupMultiGhosts();
        this.dragState.el.style.opacity = '1';

        // Hide snap guide line
        if (this.els.snapGuideLine) {
            this.els.snapGuideLine.style.display = 'none';
        }

        this.clearTimelineDropTarget();
        this.mergeSegments(node);
        this.dragState = { isDragging: false, isResizing: false };
        this.renderTasks();
    },

    // --- Context Menus ---

    handleSegmentClick(e, nodeId, segId) {
        e.stopPropagation();

        // If we just finished a box selection, don't process this click (it's a side effect)
        if (this.selectState?.justFinished) return;

        if (e.altKey) {
            // Alt: Remove from selection
            this.selectedSegments.delete(segId);
        } else if (e.ctrlKey || e.metaKey) {
            // Ctrl: Toggle selection
            if (this.selectedSegments.has(segId)) {
                this.selectedSegments.delete(segId);
            } else {
                this.selectedSegments.add(segId);
                this.lastSelectedSeg = segId;
            }
        } else if (e.shiftKey && this.lastSelectedSeg) {
            // Shift: Range selection based on VISIBLE order
            const rows = this.getVisibleRows();
            const visibleSegs = [];

            // Flatten visible segments
            rows.forEach(node => {
                if (node.segments) {
                    // Sort segments by visual position (startOffset) to ensure intuitive left-to-right selection
                    const sortedSegs = [...node.segments].sort((a, b) => a.startOffset - b.startOffset);
                    sortedSegs.forEach(seg => visibleSegs.push(seg.id));
                }
            });

            const lastIdx = visibleSegs.indexOf(this.lastSelectedSeg);
            const currIdx = visibleSegs.indexOf(segId);

            if (lastIdx !== -1 && currIdx !== -1) {
                const [start, end] = lastIdx < currIdx ? [lastIdx, currIdx] : [currIdx, lastIdx];

                if (!e.ctrlKey) this.selectedSegments.clear(); // Shift only = clear others

                for (let i = start; i <= end; i++) {
                    this.selectedSegments.add(visibleSegs[i]);
                }
            }
        } else {
            // Normal click: Select only this
            this.selectedSegments.clear();
            this.selectedSegments.add(segId);
            this.lastSelectedSeg = segId;
        }

        // Clear task row selection when selecting segments to avoid confusion
        if (!e.shiftKey && !e.ctrlKey) {
            this.selectedTaskIds.clear();
            this.selectedTaskId = null;
        }

        this.renderTasks();
    },

    // Generate individual overlay elements for each weekend/holiday day
    // This approach avoids CSS gradient limitations for long durations

    setupInteractions() {
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        document.addEventListener('mouseup', (e) => this.onMouseUp(e));

        // Sync header scroll and update floating text
        this.els.timelineBody.addEventListener('scroll', () => {
            this.els.headerScrollContent.scrollLeft = this.els.timelineBody.scrollLeft;
            this.updateFloatingLabels();
        });

        this.els.addBtn.addEventListener('click', () => {
            const colors = ['#5e6ad2', '#26b5ce', '#46c28e', '#f59e0b', '#ef4444', '#8b5cf6'];
            const randColor = colors[Math.floor(Math.random() * colors.length)];
            this.data.push({
                id: Date.now(), name: "New Project", expanded: true, color: randColor,
                segments: [{ id: `s${Date.now()}`, startOffset: 30, duration: 5, includeWeekends: true }],
                children: []
            });
            this.renderTasks();
        });

        this.els.timelineRows.addEventListener('dblclick', (e) => {
            if (e.target.classList.contains('timeline-row')) {
                const rect = this.els.timelineBody.getBoundingClientRect();
                const clickX = e.clientX + this.els.timelineBody.scrollLeft - rect.left;
                const dayIndex = Math.floor(clickX / this.config.cellWidth);
                const projId = e.target.dataset.id;
                const node = this.findNode(projId);
                if (node) {
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
    },


    setupScrollSync() {
        let isSyncingSidebar = false;
        let isSyncingTimeline = false;

        this.els.timelineBody.addEventListener('scroll', () => {
            // Horizontal sync always
            if (this.els.timelineHeader) {
                this.els.timelineHeader.scrollLeft = this.els.timelineBody.scrollLeft;
            }

            // Vertical sync
            if (!isSyncingSidebar) {
                isSyncingTimeline = true;
                this.els.sidebarScrollArea.scrollTop = this.els.timelineBody.scrollTop;
            }
            isSyncingSidebar = false;
        });

        this.els.sidebarScrollArea.addEventListener('scroll', () => {
            if (!isSyncingTimeline) {
                isSyncingSidebar = true;
                this.els.timelineBody.scrollTop = this.els.sidebarScrollArea.scrollTop;
            }
            isSyncingTimeline = false;
        });
    },


    startRealTimeUpdates() {
        const update = () => this.updateNowMarker();
        update();
        setInterval(update, 60000);
    },

    selectTask(taskId, e = null) {
        if (!e) {
            // Programmatic selection (single)
            this.selectedTaskIds.clear();
            this.selectedTaskIds.add(taskId);
            this.lastSelectedTaskId = taskId;
            this.selectedTaskId = taskId; // Legacy sync
        } else {
            // Interactive selection
            if (e.shiftKey && this.lastSelectedTaskId) {
                // Range Selection
                const rows = this.getVisibleRows();
                const lastIdx = rows.findIndex(r => r.id == this.lastSelectedTaskId);
                const currIdx = rows.findIndex(r => r.id == taskId);

                if (lastIdx !== -1 && currIdx !== -1) {
                    const [start, end] = lastIdx < currIdx ? [lastIdx, currIdx] : [currIdx, lastIdx];

                    if (!e.ctrlKey) this.selectedTaskIds.clear(); // Shift only = clear others unless Ctrl held (optional standard behavior is clear)
                    // Actually Windows Explorer Shift+Click clears others.

                    for (let i = start; i <= end; i++) {
                        this.selectedTaskIds.add(rows[i].id);
                    }
                }
            } else if (e.ctrlKey || e.metaKey) {
                // Toggle Selection
                if (this.selectedTaskIds.has(taskId)) {
                    this.selectedTaskIds.delete(taskId);
                } else {
                    this.selectedTaskIds.add(taskId);
                    this.lastSelectedTaskId = taskId;
                }
            } else {
                // Single Selection
                this.selectedTaskIds.clear();
                this.selectedTaskIds.add(taskId);
                this.lastSelectedTaskId = taskId;
            }
            this.selectedTaskId = this.lastSelectedTaskId; // Legacy sync
        }

        this.selectedSegments.clear(); // Clear segment selection when selecting tasks
        this.renderTasks();
    },

    // In-place edit for project/task names (sidebar)

    // In-place edit for segment-specific names (graph bar labels - independent from task name)
    editSegmentName(nodeId, segmentId, labelEl) {
        const node = this.findNode(nodeId);
        if (!node) return;
        const seg = node.segments.find(s => s.id === segmentId);
        if (!seg) return;

        // Use segment.label or default to node.name
        const currentName = seg.label || node.name;

        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentName;
        input.className = 'inline-edit-input';
        input.style.cssText = 'width:auto;max-width:150px;background:rgba(0,0,0,0.5);color:white;border:1px solid rgba(255,255,255,0.3);padding:2px 6px;border-radius:4px;font-size:11px;';

        labelEl.replaceWith(input);
        input.focus();
        input.select();

        let saved = false;
        const save = () => {
            if (saved) return;
            saved = true;
            this.saveState();
            seg.label = input.value.trim() || node.name;
            this.renderTasks();
        };

        input.onblur = save;
        input.onkeydown = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); input.onblur = null; save(); }
            if (e.key === 'Escape') { input.onblur = null; this.renderTasks(); }
        };
    },


    deleteTask(taskId) {
        // Keep for internal recursive calls or explicit single delete
        const parentInfo = this.findNodeParent(taskId);
        const deleteFromArray = (arr) => {
            for (let i = 0; i < arr.length; i++) {
                if (arr[i].id == taskId) {
                    arr.splice(i, 1);
                    return true;
                }
                if (arr[i].children && deleteFromArray(arr[i].children)) {
                    return true;
                }
            }
            return false;
        };
        const deleted = deleteFromArray(this.data);
        if (deleted && parentInfo?.parent) {
            this.updateAncestorSchedules(parentInfo.parent);
        }
    },


    deleteSelectedTasks() {
        // Create a copy of IDs to avoid modification issues during iteration
        const idsToDelete = new Set(this.selectedTaskIds);
        const affectedParents = new Set();

        idsToDelete.forEach((id) => {
            const info = this.findNodeParent(id);
            if (info?.parent && !idsToDelete.has(info.parent.id)) {
                affectedParents.add(info.parent.id);
            }
        });

        // Helper to check if a node is marked for deletion
        const isMarked = (id) => idsToDelete.has(id);

        // We need to delete from the data structure.
        // Special case: If parent is deleted, children are deleted automatically.
        // We should avoid trying to delete children if parent is already being deleted to avoid errors.

        const processDeletions = (nodes) => {
            for (let i = nodes.length - 1; i >= 0; i--) {
                const node = nodes[i];
                if (isMarked(node.id)) {
                    nodes.splice(i, 1);
                } else if (node.children) {
                    processDeletions(node.children);
                }
            }
        };

        processDeletions(this.data);

        affectedParents.forEach((parentId) => {
            const node = this.findNode(parentId);
            if (node) this.updateAncestorSchedules(node);
        });

        this.selectedTaskIds.clear();
        this.selectedTaskId = null;
        this.lastSelectedTaskId = null;
        this.renderTasks();
    },


    deleteSelectedSegments() {
        const affectedNodes = new Set();
        const deleteFromNodes = (nodes) => {
            nodes.forEach(node => {
                if (node.segments) {
                    const originalCount = node.segments.length;
                    node.segments = node.segments.filter(seg => !this.selectedSegments.has(seg.id));
                    if (node.segments.length !== originalCount) {
                        affectedNodes.add(node.id);
                    }
                }
                if (node.children) deleteFromNodes(node.children);
            });
        };
        deleteFromNodes(this.data);
        affectedNodes.forEach((nodeId) => {
            const node = this.findNode(nodeId);
            if (node) this.updateAncestorSchedules(node);
        });
        this.selectedSegments.clear();
        this.renderTasks();
    }

});
