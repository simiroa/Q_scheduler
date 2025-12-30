import { Scheduler } from './core.js';

Object.assign(Scheduler.prototype, {

    // Helper to find parent of a node
    findNodeParent(id, nodes = this.data, parent = null) {
        for (let i = 0; i < nodes.length; i++) {
            if (nodes[i].id == id) {
                return { parent, index: i };
            }
            if (nodes[i].children) {
                const result = this.findNodeParent(id, nodes[i].children, nodes[i]);
                if (result) return result;
            }
        }
        return null;
    },

    // --- Helpers ---
    getVisibleRows() {
        const rows = [];
        const traverse = (nodes, level, parentCollapsed = false) => {
            nodes.forEach(node => {
                // When expanded, add node and recurse
                if (!parentCollapsed) {
                    rows.push({ ...node, level, collapsedChildren: !node.expanded ? this.getAllDescendantSegments(node) : [] });
                }
                if (node.expanded && node.children) {
                    traverse(node.children, level + 1, false);
                }
            });
        };
        traverse(this.data, 0, false);
        return rows;
    },

    // Get all segments from all descendants (for collapsed display)

    getAllDescendantSegments(node) {
        const segments = [];
        const collect = (n) => {
            if (n.children) {
                n.children.forEach(child => {
                    if (child.segments) {
                        child.segments.forEach(seg => {
                            segments.push({ ...seg, color: seg.color || child.color, childName: child.name });
                        });
                    }
                    collect(child);
                });
            }
        };
        collect(node);
        return segments;
    },

    getDescendantTaskSegments(node) {
        const segments = [];
        const collect = (n) => {
            if (!n.children) return;
            n.children.forEach(child => {
                if (child.segments) {
                    child.segments.forEach(seg => {
                        if (!seg.isEvent) segments.push(seg);
                    });
                }
                collect(child);
            });
        };
        collect(node);
        return segments;
    },

    getSegmentsRange(segments) {
        let minStart = null;
        let maxEnd = null;
        segments.forEach(seg => {
            if (typeof seg.startOffset !== 'number' || typeof seg.duration !== 'number') return;
            const start = seg.startOffset;
            const end = seg.startOffset + seg.duration;
            if (minStart === null || start < minStart) minStart = start;
            if (maxEnd === null || end > maxEnd) maxEnd = end;
        });
        if (minStart === null || maxEnd === null) return null;
        return { start: minStart, end: maxEnd };
    },

    syncParentSchedule(node) {
        if (!node || !node.children || node.children.length === 0) return;
        const childSegments = this.getDescendantTaskSegments(node);
        const range = this.getSegmentsRange(childSegments);
        if (!range) return;

        const events = (node.segments || []).filter(seg => seg.isEvent);
        const ownTaskSegments = (node.segments || []).filter(seg => !seg.isEvent);
        if (ownTaskSegments.length === 0) {
            const baseSeg = {
                id: `s${node.id}`,
                includeWeekends: true,
                autoSync: true,
                startOffset: range.start,
                duration: Math.max(1, range.end - range.start)
            };
            node.segments = [baseSeg, ...events];
            return;
        }

        const autoSeg = ownTaskSegments.find(seg => seg.autoSync);
        if (!autoSeg) return;

        autoSeg.startOffset = range.start;
        autoSeg.duration = Math.max(1, range.end - range.start);
        if (autoSeg.includeWeekends === undefined) autoSeg.includeWeekends = true;
    },

    updateAncestorSchedules(node) {
        let current = node;
        while (current) {
            this.syncParentSchedule(current);
            const parentInfo = this.findNodeParent(current.id);
            current = parentInfo ? parentInfo.parent : null;
        }
    },

    applyInheritedColor(node, color) {
        if (!node || !color) return;
        node.color = color;
        if (node.segments) {
            node.segments.forEach(seg => {
                if (!seg.isEvent) seg.color = color;
            });
        }
        if (node.children) {
            node.children.forEach(child => this.applyInheritedColor(child, color));
        }
    },


    findNode(id, nodes = this.data) {
        for (let node of nodes) {
            if (node.id == id) return node;
            if (node.children) {
                const found = this.findNode(id, node.children);
                if (found) return found;
            }
        }
        return null;
    },


    getAllSegments() {
        const segs = [];
        const collect = (nodes) => {
            nodes.forEach(n => {
                if (n.segments) n.segments.forEach(s => segs.push({ nodeId: n.id, seg: s }));
                if (n.children) collect(n.children);
            });
        };
        collect(this.data);
        return segs;
    },


    getDateKey(date) { return date.toISOString().split('T')[0]; },
    isHoliday(date) { return this.holidays.has(this.getDateKey(date)); },
    isWeekend(date) { const d = date.getDay(); return d === 0 || d === 6; },
    isNonWorkingDay(date) { return this.isWeekend(date) || this.isHoliday(date); },


    getWorkingDays(startOffset, duration, includeWeekends) {
        // includeWeekends=true: count all days
        // includeWeekends=false: count only working days (exclude weekends/holidays)
        if (!includeWeekends) return duration; // If not including weekends overlay, just return duration
        let count = 0;
        for (let i = 0; i < duration; i++) {
            const d = new Date(this.config.startDate);
            d.setDate(d.getDate() + startOffset + i);
            if (!this.isNonWorkingDay(d)) count++;
        }
        return count;
    },

    // --- Rendering ---

    mergeSegments(node) {
        if (!node.segments) return;

        // Separate events from regular tasks to prevent merging events into tasks
        const events = node.segments.filter(s => s.id.startsWith('e_') || s.isEvent);
        const tasks = node.segments.filter(s => !s.id.startsWith('e_') && !s.isEvent);

        tasks.sort((a, b) => a.startOffset - b.startOffset);

        let merged = [];
        if (tasks.length > 0) {
            let prev = { ...tasks[0] };
            for (let i = 1; i < tasks.length; i++) {
                const curr = tasks[i];
                if (curr.startOffset <= (prev.startOffset + prev.duration)) {
                    const newEnd = Math.max(prev.startOffset + prev.duration, curr.startOffset + curr.duration);
                    prev.duration = newEnd - prev.startOffset;
                } else {
                    merged.push(prev);
                    prev = { ...curr };
                }
            }
            merged.push(prev);
        }

        // Re-combine: merged tasks + original events
        node.segments = [...merged, ...events];
    }

});
