import { Scheduler } from './core.js';

Object.assign(Scheduler.prototype, {

    // --- Rendering ---
    renderTimelineStructure() {
        const totalDays = this.config.daysView;
        const cellW = this.config.cellWidth;
        const totalWidth = totalDays * cellW;

        this.els.timelineGrid.style.width = `${totalWidth}px`;
        this.els.headerScrollContent.style.width = `${totalWidth}px`;

        this.els.headerScrollContent.innerHTML = '';
        this.els.gridLines.innerHTML = '';

        const days = ['일', '월', '화', '수', '목', '금', '토'];
        const months = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

        for (let i = 0; i < totalDays; i++) {
            const date = new Date(this.config.startDate);
            date.setDate(date.getDate() + i);
            const dName = days[date.getDay()];
            const dNum = date.getDate();
            const mName = months[date.getMonth()];
            const year = date.getFullYear();
            const isWknd = this.isWeekend(date);
            const isHday = this.isHoliday(date);
            const isToday = date.toDateString() === new Date().toDateString();

            const dayCell = document.createElement('div');
            dayCell.className = `time-cell-day ${isToday ? 'today' : ''} ${isWknd ? 'weekend' : ''} ${isHday ? 'holiday' : ''}`;
            dayCell.dataset.dayIndex = i;
            dayCell.style.width = `${cellW}px`;
            dayCell.innerHTML = `
                <div class="day-year">${year}</div>
                <div class="day-month">${mName}</div>
                <div class="day-number">${dNum}</div>
                <div class="day-name">${dName}</div>
            `;

            dayCell.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.openHeaderMenu(e, i, date);
            });

            this.els.headerScrollContent.appendChild(dayCell);

            const gridCol = document.createElement('div');
            gridCol.className = `grid-col ${isWknd ? 'weekend' : ''} ${isHday ? 'holiday' : ''}`;
            gridCol.style.width = `${cellW}px`;
            this.els.gridLines.appendChild(gridCol);
        }

        this.renderRowsAndTasks();
        this.updateNowMarker();
    },


    renderRowsAndTasks() {
        this.els.sidebarList.innerHTML = '';
        this.els.timelineRows.innerHTML = '';
        this.els.taskLayer.innerHTML = '';
        // Clear event layer if exists
        if (this.els.eventLayer) {
            this.els.eventLayer.innerHTML = '';
        }

        const rows = this.getVisibleRows();
        this.visibleRows = rows;
        this._measuredRowHeight = null;
        const pendingEvents = []; // Collect events to render last

        rows.forEach((node, index) => {
            // Sidebar Item
            const item = document.createElement('div');
            item.className = 'task-row-label';
            if (this.selectedTaskIds.has(node.id)) item.classList.add('selected');
            item.style.paddingLeft = `${24 + (node.level * 20)}px`;

            // Drag and Drop
            item.setAttribute('draggable', 'true');
            item.addEventListener('dragstart', (e) => {
                if (this.isProjectLocked) {
                    e.preventDefault();
                    return;
                }
                this.handleDragStart(e, node.id);
            });
            item.addEventListener('dragover', (e) => this.handleDragOver(e, node.id));
            item.addEventListener('dragleave', (e) => this.handleDragLeave(e));
            item.addEventListener('drop', (e) => this.handleDrop(e, node.id));
            item.addEventListener('dragend', (e) => this.handleDragEnd(e));

            // Row-level click handler for expanded hit area
            item.addEventListener('click', (e) => {
                // Don't trigger if clicking explicit interactive elements that handle their own events
                if (e.target.closest('.toggle-icon') || e.target.closest('.project-color-dot') || e.target.tagName === 'INPUT') return;
                this.selectTask(node.id, e);
            });

            item.addEventListener('dblclick', (e) => {
                this.openEditDialog(node.id, null, item);
            });

            const colorDot = document.createElement('span');
            colorDot.className = 'project-color-dot';
            colorDot.style.background = node.color || '#5e6ad2';
            colorDot.ondblclick = (e) => {
                if (this.isProjectLocked) return;
                e.stopPropagation();
                this.ctxState.targetId = node.id;
                this.els.projectColorPicker.click();
            };
            colorDot.setAttribute('draggable', 'false'); // Prevent child from blocking drag
            item.appendChild(colorDot);

            const toggle = document.createElement('span');
            toggle.className = 'toggle-icon material-icons';
            toggle.style.fontSize = '18px'; // Adjust size for better look
            toggle.innerText = node.children && node.children.length > 0 ? (node.expanded ? 'keyboard_arrow_down' : 'keyboard_arrow_right') : '';
            toggle.onclick = (e) => {
                e.stopPropagation();
                this.toggleExpand(node.id);
            };
            toggle.setAttribute('draggable', 'false'); // Prevent child from blocking drag
            item.appendChild(toggle);

            const text = document.createElement('span');
            text.className = 'project-name';
            text.innerText = node.name;
            // Removed text.onclick as it is handled by item
            // Double click = rename
            text.ondblclick = (e) => {
                if (this.isProjectLocked) return;
                e.stopPropagation();
                this.editProjectName(node.id, text);
            };
            text.setAttribute('draggable', 'false'); // Prevent child from blocking drag
            item.appendChild(text);

            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.openSidebarMenu(e, node.id);
            });

            this.els.sidebarList.appendChild(item);

            // Timeline Row
            const row = document.createElement('div');
            row.className = 'timeline-row';
            row.dataset.id = node.id;
            const measuredHeight = item.offsetHeight || this.config.rowHeight;
            row.style.height = `${measuredHeight}px`;
            if (!this._measuredRowHeight) {
                this._measuredRowHeight = measuredHeight;
                this.config.rowHeight = measuredHeight;
            }
            row.addEventListener('contextmenu', (e) => {
                if (this.isProjectLocked) {
                    e.preventDefault();
                    return;
                }
                e.preventDefault();
                // Enable adding events on empty space
                this.openTaskMenu(e, node.id, null); // null segment id
            });
            this.els.timelineRows.appendChild(row);

            // Own Segments - separate events from regular bars
            if (node.segments) {
                node.segments.forEach(seg => {
                    if (seg.isEvent) {
                        pendingEvents.push({ node, seg, index });
                    } else {
                        this.createTaskElement(node, seg, index, false);
                    }
                });
            }

            // Collapsed Children Segments (shown on parent row)
            if (node.collapsedChildren && node.collapsedChildren.length > 0) {
                node.collapsedChildren.forEach(seg => {
                    this.createCollapsedChildElement(node, seg, index);
                });
            }
        });

        // Render all events LAST to ensure they're always on top
        pendingEvents.forEach(({ node, seg, index }) => {
            this.createEventMarker(node, seg, index);
        });

        // Initialize floating labels
        this.updateFloatingLabels();
    },


    renderTasks() {
        // Debounce: prevent multiple rapid renders
        if (this._renderPending) return;
        this._renderPending = true;
        requestAnimationFrame(() => {
            this._renderPending = false;
            this.renderRowsAndTasks();
        });
    },

    getRowMetrics(rowIndex) {
        const rowEl = this.els.timelineRows.children[rowIndex];
        const rowTop = rowEl ? rowEl.offsetTop : rowIndex * this.config.rowHeight;
        const rowHeight = rowEl ? rowEl.offsetHeight : this.config.rowHeight;
        return { rowTop, rowHeight };
    },

    createTaskElement(node, segment, rowIndex, isChild = false) {
        // For events, create diamond-shaped markers
        if (segment.isEvent) {
            this.createEventMarker(node, segment, rowIndex);
            return;
        }

        const bar = document.createElement('div');
        bar.className = 'task-bar';
        if (this.selectedSegments.has(segment.id)) bar.classList.add('selected');

        const barColor = segment.color || node.color || '#5e6ad2';
        bar.style.background = barColor;

        bar.dataset.pid = node.id;
        bar.dataset.sid = segment.id;

        const cellW = this.config.cellWidth;
        const left = segment.startOffset * cellW;
        const width = segment.duration * cellW;
        const { rowTop, rowHeight } = this.getRowMetrics(rowIndex);

        const baseHeight = this.config.taskBarHeight || 32;
        const isNested = isChild || node.level > 0;
        const barHeight = isNested ? Math.max(22, Math.round(baseHeight * 0.85)) : baseHeight;
        const barTopOffset = Math.max(0, Math.round((rowHeight - barHeight) / 2));

        bar.style.left = `${left}px`;
        bar.style.width = `${Math.max(width, cellW)}px`;
        bar.style.height = `${barHeight}px`;
        bar.style.top = `${rowTop + barTopOffset}px`;

        const workDays = this.getWorkingDays(segment.startOffset, segment.duration, segment.includeWeekends);

        let overlayHTML = '';
        if (segment.includeWeekends) {
            overlayHTML = this.getWeekendOverlays(segment.startOffset, segment.duration);
        }

        // Use segment.label if set, otherwise use node.name
        const displayName = segment.label || node.name;

        // Memo icon indicator
        const memoIcon = segment.memo ? `<span class="material-icons memo-indicator" style="font-size:12px; margin-left:4px; opacity:0.8;" title="${segment.memo}">description</span>` : '';

        bar.innerHTML = `
            <span class="bar-label">${displayName}</span>
            <span class="duration-badge">${workDays}일</span>
            ${memoIcon}
            ${overlayHTML}
            <div class="resize-handle left" data-dir="left"></div>
            <div class="resize-handle right" data-dir="right"></div>
        `;

        // Label is now just for display - rename via right-click menu
        // (Removed: label click-to-rename caused issues with short bars)


        bar.addEventListener('contextmenu', (e) => {
            if (this.isProjectLocked) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            this.openTaskMenu(e, node.id, segment.id);
        });

        bar.addEventListener('dblclick', (e) => {
            if (this.isProjectLocked) return;
            e.stopPropagation();
            this.openEditDialog(node.id, segment.id, bar);
        });

        // Shift+Click Handler (since mousedown is skipped for Shift)
        bar.addEventListener('click', (e) => {
            if (e.shiftKey) {
                e.stopPropagation();
                this.handleSegmentClick(e, node.id, segment.id);
            }
        });

        this.attachTaskEvents(bar, node.id, segment.id);
        this.els.taskLayer.appendChild(bar);
    },


    createEventMarker(node, segment, rowIndex) {
        const marker = document.createElement('div');
        marker.className = 'event-marker';
        if (this.selectedSegments.has(segment.id)) marker.classList.add('selected');

        marker.dataset.pid = node.id;
        marker.dataset.sid = segment.id;

        const cellW = this.config.cellWidth;
        const left = segment.startOffset * cellW + (cellW / 2);
        const { rowTop, rowHeight } = this.getRowMetrics(rowIndex);
        const top = rowTop + (rowHeight / 2);

        marker.style.left = `${left}px`;
        marker.style.top = `${top}px`;

        // Event label (use segment.label or default to "이벤트")
        const displayLabel = segment.label || '이벤트';

        // Diamond inner element + label
        const memoIcon = segment.memo ? ` <span class="material-icons" style="font-size:12px; vertical-align:middle;" title="${segment.memo}">description</span>` : '';
        const eventColor = segment.color || '#ef4444'; // Default red if no color
        marker.innerHTML = `
            <div class="diamond-inner" style="background-color: ${eventColor}; border-color: ${eventColor};"></div>
            <span class="event-label">${displayLabel}${memoIcon}</span>
        `;

        const labelEl = marker.querySelector('.event-label');
        if (labelEl) {
            labelEl.addEventListener('mousedown', (e) => {
                if (e.shiftKey) return;
                e.stopPropagation();
            });
            // Pass double click to marker
            labelEl.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                this.openEditDialog(node.id, segment.id, labelEl);
            });
        }

        marker.addEventListener('dblclick', (e) => {
            if (this.isProjectLocked) return;
            e.stopPropagation();
            this.openEditDialog(node.id, segment.id, marker);
        });

        marker.addEventListener('contextmenu', (e) => {
            if (this.isProjectLocked) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            this.openTaskMenu(e, node.id, segment.id);
        });

        marker.addEventListener('mousedown', (e) => {
            if (this.isProjectLocked) return;
            if (e.button === 0) {
                if (e.shiftKey) return; // Shift: Bubble to timeline for box selection

                e.stopPropagation();
                // If clicking on label, don't start drag
                if (e.target.classList.contains('event-label')) {
                    this.handleSegmentClick(e, node.id, segment.id);
                    // If segment has memo, open memo panel; otherwise close if open
                    if (segment.memo) {
                        this.ctxState.targetId = node.id;
                        this.ctxState.targetSegId = segment.id;
                        this.openMemoPanel();
                    } else {
                        this.closeMemoPanel();
                    }
                    return;
                }
                // Start dragging the event marker
                this.startEventDrag(e, marker, node.id, segment.id, rowIndex);
            }
        });

        // Single click on diamond opens memo panel (if has memo)
        marker.addEventListener('click', (e) => {
            if (e.button === 0 && !e.target.classList.contains('event-label')) {
                this.handleSegmentClick(e, node.id, segment.id);
                if (segment.memo) {
                    this.ctxState.targetId = node.id;
                    this.ctxState.targetSegId = segment.id;
                    this.openMemoPanel();
                } else {
                    this.closeMemoPanel();
                }
            }
        });

        // Append to event layer (will be created if needed)
        if (!this.els.eventLayer) {
            this.els.eventLayer = document.createElement('div');
            this.els.eventLayer.id = 'eventLayer';
            this.els.eventLayer.className = 'event-layer';
            this.els.timelineGrid.appendChild(this.els.eventLayer);
        }
        this.els.eventLayer.appendChild(marker);
    },

    // Edit event label in-place

    editEventLabel(nodeId, segmentId, labelEl) {
        const node = this.findNode(nodeId);
        if (!node) return;
        const seg = node.segments.find(s => s.id === segmentId);
        if (!seg) return;

        const currentLabel = seg.label || '이벤트';

        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentLabel;
        input.className = 'inline-edit-input';
        input.style.cssText = 'width:80px;background:rgba(0,0,0,0.7);color:white;border:1px solid #ef4444;padding:2px 4px;border-radius:4px;font-size:10px;';

        labelEl.replaceWith(input);
        input.focus();
        input.select();

        let saved = false;
        const save = () => {
            if (saved) return;
            saved = true;
            this.saveState();
            seg.label = input.value.trim() || '이벤트';
            this.renderTasks();
        };

        input.onblur = save;
        input.onkeydown = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); input.onblur = null; save(); }
            if (e.key === 'Escape') { input.onblur = null; this.renderTasks(); }
        };
    },


    createCollapsedChildElement(parentNode, segment, rowIndex) {
        const bar = document.createElement('div');
        bar.className = 'task-bar collapsed-child';

        const barColor = segment.color || parentNode.color || '#888';
        bar.style.background = barColor;
        bar.style.opacity = '0.7';
        const { rowTop, rowHeight } = this.getRowMetrics(rowIndex);
        const barHeight = this.config.taskBarHeight || 32;
        const childHeight = Math.max(14, Math.round(barHeight * 0.6));
        const childTopOffset = Math.max(0, Math.round((rowHeight - childHeight) / 2));

        bar.style.height = `${childHeight}px`;
        bar.style.top = `${rowTop + childTopOffset}px`;

        const cellW = this.config.cellWidth;
        const left = segment.startOffset * cellW;
        const width = segment.duration * cellW;

        bar.style.left = `${left}px`;
        bar.style.width = `${Math.max(width, cellW)}px`;

        bar.innerHTML = `<span class="bar-label" style="font-size:9px;">${segment.childName || ''}</span>`;

        this.els.taskLayer.appendChild(bar);
    },


    // Generate individual overlay elements for each weekend/holiday day
    // This approach avoids CSS gradient limitations for long durations
    getWeekendOverlays(startOffset, duration) {
        let html = '';
        for (let i = 0; i < duration; i++) {
            const d = new Date(this.config.startDate);
            d.setDate(d.getDate() + startOffset + i);
            if (this.isNonWorkingDay(d)) {
                const leftPercent = (i / duration) * 100;
                const widthPercent = (1 / duration) * 100;
                html += `<div class="weekend-day-overlay" style="left:${leftPercent}%;width:${widthPercent}%"></div>`;
            }
        }
        return html;
    },

    // Update floating labels so they stay visible when bar start goes off-screen left
    updateFloatingLabels() {
        const scrollLeft = this.els.timelineBody.scrollLeft;
        const bars = this.els.taskLayer.querySelectorAll('.task-bar');

        bars.forEach(bar => {
            const barLeft = parseFloat(bar.style.left) || 0;
            const barWidth = parseFloat(bar.style.width) || 0;
            const label = bar.querySelector('.bar-label');
            if (!label) return;

            // If bar starts before visible area but ends within visible area
            if (barLeft < scrollLeft && (barLeft + barWidth) > scrollLeft + 5) {
                // Calculate offset to keep label at visible left edge
                const offset = scrollLeft - barLeft + 10; // 10px margin
                label.style.marginLeft = `${offset}px`;
            } else {
                // Reset to normal position
                label.style.marginLeft = '0px';
            }
        });
    },

    // --- Helpers ---

    // --- NOW Marker ---
    updateNowMarker() {
        const now = new Date();
        const start = this.config.startDate.getTime();
        const msInDay = 86400000;
        const diff = (now.getTime() - start) / msInDay;
        if (diff >= 0 && diff < this.config.daysView) {
            this.els.nowMarker.style.left = `${diff * this.config.cellWidth}px`;
            this.els.nowMarker.style.display = 'block';
        } else {
            this.els.nowMarker.style.display = 'none';
        }
    },

    // --- Interaction ---

    scrollToToday() {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const start = this.config.startDate;
        const diffDays = Math.floor((now - start) / 86400000);
        const targetX = diffDays * this.config.cellWidth;
        const viewWidth = this.els.timelineBody.clientWidth;
        const centerOffset = Math.max(0, (viewWidth / 2) - (this.config.cellWidth / 2));
        let nextScroll = targetX - centerOffset;
        const maxScroll = this.els.timelineBody.scrollWidth - viewWidth;
        if (nextScroll < 0) nextScroll = 0;
        if (nextScroll > maxScroll) nextScroll = maxScroll;
        this.els.timelineBody.scrollLeft = nextScroll;
    }

});
