let events = [];
let categories = [{
    id: 'default',
    name: 'General',
    color: '#6b7280'
}];
let queryHistory = [];
let layoutState = {
    colWidths: Array(7).fill('minmax(100px, 1fr)'),
    statsWidth: '160px',
    rowHeights: {}
};
let state = {
    view: 'month',
    currentDate: new Date(),
    yearMode: 'list',
    activeCategories: new Set(['default']),
    activePriorities: new Set(['high', 'medium', 'low']),
    sortBy: 'priority_desc',
    editingEventId: null,
    editingCategoryId: null,
    categoryPendingDelete: null,
    filterPanelOpen: false
};
let currentViewRowIds = [];

function renderYearList(data, container) {
    const year = state.currentDate.getFullYear();
    for (let m = 0; m < 12; m++) {
        const monthDate = new Date(year, m, 1);
        const monthPrefix = `${year}-${String(m + 1).padStart(2, '0')}`;
        const monthEvents = data.filter(ev => ev.date.startsWith(monthPrefix));
        const card = document.createElement('div');
        card.className = 'month-card';
        let html = `<h3>${monthDate.toLocaleDateString('en-US', { month: 'long' })}</h3><div class="month-event-list">`;
        if (monthEvents.length === 0) {
            html += `<div style="color:var(--text-light); font-size:0.8rem; text-align:center; padding-top:10px;">No events</div>`;
        } else {
            monthEvents.forEach(ev => {
                const color = getCategoryColor(ev.categoryId);
                const day = ev.date.split('-')[2];
                const priority = ev.priority || 'low';
                html += `<div class="year-event-item prio-${priority}" style="background-color: ${color}" onclick="openEventForm('${ev.id}')">
                            <span style="overflow:hidden; text-overflow:ellipsis;">${ev.name}</span>
                            <span style="opacity:0.8; font-size:0.7rem;">${day}</span>
                         </div>`;
            });
        }
        html += `</div>`;
        card.innerHTML = html;
        container.appendChild(card);
    }
}

function renderYearGrid(data, container) {
    const year = state.currentDate.getFullYear();
    for (let m = 0; m < 12; m++) {
        const monthDiv = document.createElement('div');
        monthDiv.className = 'month-card';
        monthDiv.style.display = 'block';
        const monthDate = new Date(year, m, 1);
        let html = `<h3>${monthDate.toLocaleDateString('en-US', { month: 'long' })}</h3><div class="mini-grid">`;
        ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach(d => html += `<div class="mini-day header-day">${d}</div>`);
        const startDay = monthDate.getDay();
        const daysInMonth = new Date(year, m + 1, 0).getDate();
        for (let b = 0; b < startDay; b++) html += `<div></div>`;
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const items = data.filter(ev => ev.date === dateStr);
            let style = '';
            let cssClass = '';
            if (items.length > 0) {
                const highPrio = items.filter(i => i.priority === 'high');
                if (highPrio.length > 0) {
                    const uniqueColors = [...new Set(highPrio.map(i => getCategoryColor(i.categoryId)))];
                    if (uniqueColors.length === 1) style = `background-color: ${uniqueColors[0]}; color: white;`;
                    else style = `background: linear-gradient(135deg, ${uniqueColors.join(', ')}); color: white;`;
                    cssClass = 'has-item-bold';
                } else {
                    style = `text-decoration-line: underline;`;
                    cssClass = 'has-item-bold';
                }
            }
            html += `<div class="mini-day ${cssClass}" style="${style}">${d}</div>`;
        }
        html += `</div>`;
        monthDiv.innerHTML = html;
        container.appendChild(monthDiv);
    }
}

// --- GRID RESIZING ---
let resizing = null;

function initResize(e, type, index, initialVal) {
    e.preventDefault();
    e.stopPropagation();
    resizing = {
        type,
        index,
        startX: e.clientX,
        startY: e.clientY,
        startVal: parseFloat(initialVal) || 100
    };
    document.body.style.cursor = type === 'col' ? 'col-resize' : 'row-resize';
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', stopResize);
}

function handleResizeMove(e) {
    if (!resizing) return;
    const container = document.getElementById('calendar-container');
    if (resizing.type === 'col') {
        const delta = e.clientX - resizing.startX;
        const newVal = Math.max(80, resizing.startVal + delta) + 'px';
        layoutState.colWidths[resizing.index] = newVal;
        const cols = [...layoutState.colWidths, layoutState.statsWidth].join(' ');
        container.style.gridTemplateColumns = cols;
    } else if (resizing.type === 'row') {
        const delta = e.clientY - resizing.startY;
        const newVal = Math.max(100, resizing.startVal + delta) + 'px';
        const rowId = currentViewRowIds[resizing.index];
        if (rowId) {
            layoutState.rowHeights[rowId] = newVal;
            const rowsCss = currentViewRowIds.map(rid => layoutState.rowHeights[rid] || 'minmax(100px, 1fr)');
            const finalRowCss = ['auto', ...rowsCss].join(' ');
            container.style.gridTemplateRows = finalRowCss;
        }
    }
}

function stopResize() {
    resizing = null;
    document.body.style.cursor = 'default';
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', stopResize);
    saveToLocal();
}

function resetLayout() {
    layoutState = {
        colWidths: Array(7).fill('minmax(100px, 1fr)'),
        statsWidth: '160px',
        rowHeights: {}
    };
    saveToLocal();
    render();
}

// --- PERSISTENCE ---
function saveToLocal() {
    const payload = {
        events,
        categories,
        appState: { ...state,
            activeCategories: Array.from(state.activeCategories),
            activePriorities: Array.from(state.activePriorities),
            queryHistory
        },
        layoutState,
        savedAt: new Date().toISOString()
    };
    localStorage.setItem('calendar_app_data', JSON.stringify(payload));
}

async function loadFromLocal() {
    const local = localStorage.getItem('calendar_app_data');
    if (local) {
        try {
            const data = JSON.parse(local);
            applyData(data);
            return;
        } catch (e) {}
    }
    try {
        const res = await fetch('calendar_backup.json');
        if (res.ok) {
            const data = await res.json();
            applyData(data);
        }
    } catch (e) {}
}

function applyData(data) {
    if (data.events) events = data.events;
    if (data.categories) categories = data.categories;
    if (data.layoutState) layoutState = data.layoutState;
    if (data.appState) {
        const s = data.appState;
        Object.assign(state, s);
        state.activeCategories = new Set(s.activeCategories);
        state.activePriorities = new Set(s.activePriorities);
        state.currentDate = new Date(s.currentDate);
        if (s.queryHistory) queryHistory = s.queryHistory;
        document.querySelector('.input-select').value = state.sortBy;
        if (state.filterPanelOpen) {
            document.getElementById('filter-panel').classList.remove('hidden');
            document.getElementById('btn-toggle-filters').classList.add('btn-active');
        }
    }
    if (!layoutState.colWidths || layoutState.colWidths.length !== 7) layoutState.colWidths = Array(7).fill('minmax(100px, 1fr)');
    updateCategoryDropdowns();
    renderHistory();
    render();
}

// --- DRAG DROP ---
let draggedEventId = null;

function handleDragStart(e, id) {
    draggedEventId = id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

function handleDrop(e, dateStr) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    if (draggedEventId) {
        const idx = events.findIndex(e => e.id === draggedEventId);
        if (idx !== -1) {
            events[idx].date = dateStr;
            saveToLocal();
            render();
        }
        draggedEventId = null;
    }
}

function createEventElement(item) {
    const color = getCategoryColor(item.categoryId);
    const el = document.createElement('div');
    const priority = item.priority || 'low';
    el.className = `calendar-item prio-${priority}`;
    el.innerHTML = `<span style="overflow:hidden; text-overflow:ellipsis;">${item.name}</span>`;
    el.title = `${item.name} (${priority})`;
    el.style.backgroundColor = color;
    el.draggable = true;
    el.ondragstart = (e) => handleDragStart(e, item.id);
    el.onclick = (e) => {
        e.stopPropagation();
        openEventForm(item.id);
    };
    return el;
}

// --- SQL ---
function setSqlQuery(q) {
    document.getElementById('sql-input').value = q;
    runQuery();
}

function runQuery() {
    let query = document.getElementById('sql-input').value;

    if (!query.trim()) {
        query = 'SELECT * FROM events';
        document.getElementById('sql-input').value = query;
    }

    const tableHead = document.querySelector('#sql-results thead');
    const tableBody = document.querySelector('#sql-results tbody');

    // Prepare data for Alasql
    const flatEvents = events.map(e => {
        const cat = categories.find(c => String(c.id) === String(e.categoryId)) || {
            name: 'Unknown',
            color: '#ccc'
        };
        const d = new Date(e.date + 'T00:00:00');
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        return {
            id: e.id,
            name: e.name,
            date: e.date,
            priority: e.priority,
            description: e.description,
            category_name: cat.name,
            category_color: cat.color,
            day_name: days[d.getDay()],
            month_name: months[d.getMonth()],
            year: d.getFullYear(),
            day: d.getDate()
        };
    });

    const calendarDates = [];
    const startYear = new Date().getFullYear() - 2;
    const endYear = new Date().getFullYear() + 2;
    const start = new Date(startYear, 0, 1);
    const end = new Date(endYear, 11, 31);
    const daysArr = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        calendarDates.push({
            date: formatDateSafe(d),
            day_name: daysArr[d.getDay()],
            year: d.getFullYear()
        });
    }

    try {
        if (!alasql.databases.cal) alasql('CREATE DATABASE cal');
        alasql('USE cal');

        alasql('DROP TABLE IF EXISTS events');
        alasql('CREATE TABLE events');
        alasql('SELECT * INTO events FROM ?', [flatEvents]);

        alasql('DROP TABLE IF EXISTS dates');
        alasql('CREATE TABLE dates');
        alasql('SELECT * INTO dates FROM ?', [calendarDates]);

        renderSchema();

        const res = alasql(query);

        if (query.trim() && !queryHistory.includes(query)) {
            queryHistory.unshift(query);
            if (queryHistory.length > 20) queryHistory.pop();
            renderHistory();
            saveToLocal();
        }

        tableHead.innerHTML = '';
        tableBody.innerHTML = '';

        if (!res || res.length === 0) {
            tableBody.innerHTML = '<tr><td style="padding:10px; color:#666;">No results found.</td></tr>';
            return;
        }

        const headers = Object.keys(res[0]);
        let headRow = '<tr>';
        headers.forEach(h => headRow += `<th>${h}</th>`);
        headRow += '</tr>';
        tableHead.innerHTML = headRow;

        res.forEach(row => {
            let tr = '<tr>';
            headers.forEach(h => tr += `<td>${row[h]}</td>`);
            tr += '</tr>';
            tableBody.innerHTML += tr;
        });

    } catch (err) {
        tableHead.innerHTML = '<tr><th>Error</th></tr>';
        tableBody.innerHTML = `<tr><td style="color:red;">${err.message}</td></tr>`;
    }
}

function renderSchema() {
    const container = document.getElementById('schema-list');
    container.innerHTML = `
        <div class="db-card">
            <div class="db-table-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg> EVENTS</div>
            <div class="db-cols">
                <span class="db-col-tag">id</span><span class="db-col-tag">name</span><span class="db-col-tag">date</span>
                <span class="db-col-tag">priority</span><span class="db-col-tag">category_name</span>
            </div>
        </div>
        <div class="db-card">
            <div class="db-table-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg> DATES</div>
            <div class="db-cols">
                <span class="db-col-tag">date</span><span class="db-col-tag">day_name</span><span class="db-col-tag">year</span>
            </div>
        </div>
    `;
}

function renderHistory() {
    const container = document.getElementById('history-list');
    container.innerHTML = '';
    queryHistory.forEach(q => {
        const d = document.createElement('div');
        d.className = 'history-item';
        d.innerText = q;
        d.title = q;
        d.onclick = () => setSqlQuery(q);
        container.appendChild(d);
    });
}

async function fetchHolidays() {
    const statusEl = document.getElementById('loading-status');
    statusEl.innerText = "Fetching holidays...";
    const years = [2025, 2026, 2027];
    let newHolidaysCount = 0;
    let holidayCat = categories.find(c => c.name === 'Public Holiday');
    let holidayCatId = holidayCat ? holidayCat.id : 'holidays_' + Date.now();
    if (!holidayCat) {
        categories.push({
            id: holidayCatId,
            name: 'Public Holiday',
            color: '#ef4444'
        });
        state.activeCategories.add(holidayCatId);
    } else {
        if (!state.activeCategories.has(holidayCatId)) state.activeCategories.add(holidayCatId);
    }
    try {
        for (let year of years) {
            const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/BR`);
            if (!response.ok) continue;
            const data = await response.json();
            data.forEach(h => {
                const uniqueId = `hol_${h.date}_${h.localName.replace(/\s/g, '')}`;
                if (!events.find(ev => ev.id === uniqueId)) {
                    events.push({
                        id: uniqueId,
                        name: h.localName,
                        date: h.date,
                        categoryId: holidayCatId,
                        priority: 'high',
                        description: `${h.name} (Public Holiday)`
                    });
                    newHolidaysCount++;
                }
            });
        }
        statusEl.innerText = "";
        if (newHolidaysCount > 0) {
            renderFilters();
            render();
            saveToLocal();
        }
    } catch (err) {
        statusEl.innerText = "Offline mode";
    }
}

function formatDateSafe(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function toggleFilterPanel() {
    state.filterPanelOpen = !state.filterPanelOpen;
    const panel = document.getElementById('filter-panel');
    const btn = document.getElementById('btn-toggle-filters');
    if (state.filterPanelOpen) {
        panel.classList.remove('hidden');
        btn.classList.add('btn-active');
    } else {
        panel.classList.add('hidden');
        btn.classList.remove('btn-active');
    }
    saveToLocal();
}

function renderFilters() {
    const container = document.getElementById('filter-cat-container');
    container.innerHTML = '';
    categories.forEach(cat => {
        const chip = document.createElement('div');
        const isActive = state.activeCategories.has(String(cat.id));
        chip.className = `chip ${isActive ? 'active' : ''}`;
        chip.innerHTML = `<span class="chip-dot" style="background:${cat.color}"></span>${cat.name}`;
        if (isActive) {
            chip.style.borderColor = cat.color;
            chip.style.color = cat.color;
        }
        chip.onclick = () => toggleCategoryFilter(String(cat.id));
        container.appendChild(chip);
    });
}

function toggleCategoryFilter(id) {
    const idStr = String(id);
    if (state.activeCategories.has(idStr)) state.activeCategories.delete(idStr);
    else state.activeCategories.add(idStr);
    renderFilters();
    render();
    saveToLocal();
}

function toggleAllCategories() {
    const allIds = categories.map(c => String(c.id));
    if (state.activeCategories.size === allIds.length) state.activeCategories.clear();
    else state.activeCategories = new Set(allIds);
    renderFilters();
    render();
    saveToLocal();
}

function togglePrio(prio, el) {
    if (state.activePriorities.has(prio)) {
        state.activePriorities.delete(prio);
        el.classList.remove('active');
    } else {
        state.activePriorities.add(prio);
        el.classList.add('active');
    }
    render();
    saveToLocal();
}

function setSort(val) {
    state.sortBy = val;
    render();
    saveToLocal();
}

function setYearMode(mode) {
    state.yearMode = mode;
    render();
    saveToLocal();
}

function getCategoryName(id) {
    const cat = categories.find(c => String(c.id) === String(id));
    return cat ? cat.name : '';
}

function getCategoryColor(catId) {
    const cat = categories.find(c => String(c.id) === String(catId));
    return cat ? cat.color : '#6b7280';
}

function getFilteredAndSortedEvents() {
    let filtered = events.filter(ev => {
        const catMatch = state.activeCategories.has(String(ev.categoryId));
        const prioMatch = state.activePriorities.has(ev.priority);
        return catMatch && prioMatch;
    });
    const prioMap = {
        'high': 3,
        'medium': 2,
        'low': 1
    };
    filtered.sort((a, b) => {
        const prioA = prioMap[a.priority] || 0;
        const prioB = prioMap[b.priority] || 0;
        const catA = getCategoryName(a.categoryId).toLowerCase();
        const catB = getCategoryName(b.categoryId).toLowerCase();
        switch (state.sortBy) {
            case 'category_asc':
                if (catA !== catB) return catA.localeCompare(catB);
                return prioB - prioA;
            case 'priority_desc':
                if (prioA !== prioB) return prioB - prioA;
                return catA.localeCompare(catB);
            case 'priority_asc':
                if (prioA !== prioB) return prioA - prioB;
                return catA.localeCompare(catB);
            case 'date_asc':
                if (a.date !== b.date) return new Date(a.date) - new Date(b.date);
                return prioB - prioA;
            case 'date_desc':
                if (a.date !== b.date) return new Date(b.date) - new Date(a.date);
                return prioB - prioA;
            case 'name_asc':
                if (a.name !== b.name) return a.name.localeCompare(b.name);
                return prioB - prioA;
            default:
                return 0;
        }
    });
    return filtered;
}

function getWeeklyListHTML(items) {
    if (!items || items.length === 0) return `<div style="color:var(--text-light); font-size:0.75rem; text-align:center; padding:5px; font-style:italic;">No events</div>`;
    return items.map(ev => {
        const color = getCategoryColor(ev.categoryId);
        const day = ev.date.split('-')[2];
        return `<div class="calendar-item prio-${ev.priority}" style="background-color:${color}; display: flex; justify-content: space-between; align-items: center;" onclick="openEventForm('${ev.id}')" title="${ev.name}"><span style="overflow: hidden; text-overflow: ellipsis; flex: 1;">${ev.name}</span><span style="opacity: 0.8; font-size: 0.9em; margin-left: 5px; flex-shrink: 0;">${day}</span></div>`;
    }).join('');
}

function getStartOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
}

// --- RENDER MAIN ---
function setView(v) {
    state.view = v;
    render();
    saveToLocal();
}

function changeOffset(dir) {
    if (state.view === 'month') state.currentDate.setMonth(state.currentDate.getMonth() + dir);
    else if (state.view === 'week') state.currentDate.setDate(state.currentDate.getDate() + (dir * 7));
    else if (state.view === 'year') state.currentDate.setFullYear(state.currentDate.getFullYear() + dir);
    state.currentDate = new Date(state.currentDate);
    render();
    saveToLocal();
}

function updateCategoryDropdowns() {
    const s = document.getElementById('inp-category');
    const v = s.value;
    s.innerHTML = '';
    categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.innerText = cat.name;
        s.appendChild(opt);
    });
    s.value = [...s.options].some(o => o.value == v) ? v : 'default';
    renderFilters();
}

function handleItemSubmit(e) {
    e.preventDefault();
    const eventData = {
        id: state.editingEventId ? state.editingEventId : String(Date.now()),
        name: document.getElementById('inp-name').value,
        description: document.getElementById('inp-desc').value,
        categoryId: document.getElementById('inp-category').value,
        date: document.getElementById('inp-date').value,
        priority: document.getElementById('inp-priority').value
    };
    if (state.editingEventId) {
        const index = events.findIndex(ev => ev.id === state.editingEventId);
        if (index !== -1) events[index] = eventData;
    } else {
        events.push(eventData);
    }
    saveToLocal();
    closeEventModal();
    render();
}

function handleCategorySubmit(e) {
    e.preventDefault();
    const name = document.getElementById('cat-name').value;
    const color = document.getElementById('cat-color').value;
    if (state.editingCategoryId) {
        const cat = categories.find(c => c.id === state.editingCategoryId);
        if (cat) {
            cat.name = name;
            cat.color = color;
        }
    } else {
        const newId = String(Date.now());
        categories.push({
            id: newId,
            name,
            color
        });
        state.activeCategories.add(newId);
    }
    clearCategoryForm();
    toggleCategoryModal(false);
    saveToLocal();
    updateCategoryDropdowns();
    render();
}

function confirmCategoryDelete(action) {
    const id = state.categoryPendingDelete;
    if (!id) return;
    const idStr = String(id);
    if (action === 'move') events.forEach(ev => {
        if (String(ev.categoryId) === idStr) ev.categoryId = 'default';
    });
    else if (action === 'delete') events = events.filter(ev => String(ev.categoryId) !== idStr);
    categories = categories.filter(c => String(c.id) !== idStr);
    if (state.activeCategories.has(idStr)) state.activeCategories.delete(idStr);
    closeDeleteModal();
    saveToLocal();
    updateCategoryDropdowns();
    renderCategoryList();
    render();
}

function downloadData() {
    const payload = {
        events,
        categories,
        appState: { ...state,
            activeCategories: Array.from(state.activeCategories),
            activePriorities: Array.from(state.activePriorities),
            queryHistory
        },
        layoutState,
        savedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calendar_backup.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function triggerFileUpload() {
    document.getElementById('file-input').click();
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const json = JSON.parse(e.target.result);
            applyData(json);
            alert("Data loaded!");
        } catch (err) {
            alert("Error reading file.");
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function openEventForm(id) {
    updateCategoryDropdowns();
    state.editingEventId = id;
    document.getElementById('event-modal-overlay').classList.remove('hidden');
    if (id) {
        const ev = events.find(e => e.id == id);
        document.getElementById('inp-name').value = ev.name;
        document.getElementById('inp-date').value = ev.date;
        document.getElementById('inp-priority').value = ev.priority;
        document.getElementById('inp-category').value = ev.categoryId;
        document.getElementById('inp-desc').value = ev.description;
        document.getElementById('btn-delete-event').classList.remove('hidden');
    } else {
        document.getElementById('create-form').reset();
        document.getElementById('inp-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('btn-delete-event').classList.add('hidden');
    }
}

function closeEventModal() {
    document.getElementById('event-modal-overlay').classList.add('hidden');
}

function deleteEvent() {
    if (!state.editingEventId) return;
    if (confirm("Delete event?")) {
        events = events.filter(e => e.id !== state.editingEventId);
        saveToLocal();
        closeEventModal();
        render();
    }
}

function promptDeleteCategory(id) {
    state.categoryPendingDelete = id;
    document.getElementById('delete-modal-overlay').classList.remove('hidden');
}

function closeDeleteModal() {
    state.categoryPendingDelete = null;
    document.getElementById('delete-modal-overlay').classList.add('hidden');
}

function toggleCategoryModal(s) {
    const m = document.getElementById('modal-overlay');
    if (s) {
        m.classList.remove('hidden');
        clearCategoryForm();
        renderCategoryList();
    } else {
        m.classList.add('hidden');
    }
}

function clearCategoryForm() {
    state.editingCategoryId = null;
    document.getElementById('cat-name').value = '';
    document.getElementById('cat-color').value = '#3b82f6';
    document.getElementById('cat-color-text').value = '#3b82f6';
    document.getElementById('btn-cat-save').innerText = 'Add';
    document.getElementById('btn-cat-clear').classList.add('hidden');
}

function renderCategoryList() {
    const l = document.getElementById('cat-list-container');
    l.innerHTML = '';
    categories.forEach(c => {
        const d = document.createElement('div');
        d.className = 'cat-item';
        d.innerHTML = `<div style="display:flex;align-items:center;"><span class="cat-dot" style="background:${c.color}"></span><span>${c.name}</span></div>${c.id!=='default'?`<div class="delete-icon" onclick="event.stopPropagation(); promptDeleteCategory('${c.id}')">&times;</div>`:''}`;
        d.onclick = () => loadCat(c.id);
        l.appendChild(d);
    });
}

function loadCat(id) {
    const c = categories.find(x => x.id == id);
    if (!c) return;
    state.editingCategoryId = id;
    document.getElementById('cat-name').value = c.name;
    document.getElementById('cat-color').value = c.color;
    document.getElementById('cat-color-text').value = c.color;
    document.getElementById('btn-cat-save').innerText = 'Update';
    document.getElementById('btn-cat-clear').classList.remove('hidden');
}

function render() {
    const finalEvents = getFilteredAndSortedEvents();
    const options = {
        year: 'numeric',
        month: 'long'
    };
    if (state.view === 'week') options.day = 'numeric';
    document.getElementById('current-date-display').innerText = state.currentDate.toLocaleDateString('en-US', options);

    document.querySelectorAll('.controls .btn').forEach(b => {
        if (b.id && b.id.startsWith('btn-')) b.classList.remove('btn-primary');
        b.classList.remove('btn-active');
    });
    if (document.getElementById(`btn-${state.view}`)) document.getElementById(`btn-${state.view}`).classList.add('btn-active');

    if (state.view === 'year') {
        document.getElementById('btn-mode-list').classList.toggle('btn-active', state.yearMode === 'list');
        document.getElementById('btn-mode-grid').classList.toggle('btn-active', state.yearMode === 'grid');
    }

    const container = document.getElementById('calendar-container');
    const viewEl = document.getElementById('calendar-view');
    const sqlView = document.getElementById('sql-view');
    const secControls = document.getElementById('secondary-controls');
    const filterPanel = document.getElementById('filter-panel');

    if (state.view === 'sql') {
        container.style.display = 'none';
        viewEl.classList.add('hidden');
        sqlView.classList.remove('hidden');
        secControls.classList.add('hidden');
        filterPanel.classList.add('hidden');
        runQuery();
        return;
    } else {
        viewEl.classList.remove('hidden');
        sqlView.classList.add('hidden');
        secControls.classList.remove('hidden');
        filterPanel.classList.toggle('hidden', !state.filterPanelOpen);
    }

    if (state.view === 'year') {
        document.getElementById('year-controls').classList.remove('hidden');
    } else {
        document.getElementById('year-controls').classList.add('hidden');
    }

    container.innerHTML = '';
    viewEl.className = `view-${state.view}`;
    container.style = '';

    if (state.view === 'month') {
        container.style.display = 'grid';
        const cols = [...layoutState.colWidths, layoutState.statsWidth].join(' ');
        container.style.gridTemplateColumns = cols;
        renderMonth(finalEvents, container);
    } else if (state.view === 'week') {
        container.style.display = 'grid';
        const cols = [...layoutState.colWidths, layoutState.statsWidth].join(' ');
        container.style.gridTemplateColumns = cols;
        container.style.gridTemplateRows = 'auto 1fr';
        renderWeek(finalEvents, container);
    } else if (state.view === 'year') {
        container.style.display = 'grid';
        container.style.removeProperty('grid-template-columns');
        container.style.removeProperty('grid-template-rows');
        if (state.yearMode === 'list') renderYearList(finalEvents, container);
        else renderYearGrid(finalEvents, container);
    }
}

function renderMonth(data, container) {
    currentViewRowIds = [];
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach((d, index) => {
        const el = document.createElement('div');
        el.className = 'day-cell header';
        el.innerText = d;
        const resizer = document.createElement('div');
        resizer.className = 'resizer-col';
        resizer.onmousedown = (e) => initResize(e, 'col', index, el.offsetWidth);
        el.appendChild(resizer);
        container.appendChild(el);
    });
    const statsHeader = document.createElement('div');
    statsHeader.className = 'day-cell header stats-cell';
    statsHeader.innerText = 'Tasks';
    container.appendChild(statsHeader);

    const year = state.currentDate.getFullYear();
    const month = state.currentDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const numWeeks = Math.ceil((firstDayIndex + daysInMonth) / 7);

    let rowTemplate = 'auto';
    let currentDay = 1 - firstDayIndex;

    for (let w = 0; w < numWeeks; w++) {
        const weekStart = new Date(year, month, currentDay);
        const rowId = `row-${weekStart.toISOString().split('T')[0]}`;
        currentViewRowIds.push(rowId);
        const height = layoutState.rowHeights[rowId] || 'minmax(100px, 1fr)';
        rowTemplate += ` ${height}`;

        for (let d = 0; d < 7; d++) {
            const date = new Date(year, month, currentDay);
            const dateStr = formatDateSafe(date);
            const isCurrent = date.getMonth() === month;
            const items = data.filter(ev => ev.date === dateStr);

            const el = document.createElement('div');
            el.className = `day-cell ${!isCurrent ? 'not-current-month' : ''}`;
            el.ondragover = handleDragOver;
            el.ondrop = (e) => handleDrop(e, dateStr);
            el.ondragleave = handleDragLeave;

            const content = document.createElement('div');
            content.className = 'cell-content';
            content.innerHTML = `<div class="day-number">${date.getDate()}</div>`;
            items.forEach(item => content.appendChild(createEventElement(item)));
            el.appendChild(content);

            if (d === 0) {
                const resizer = document.createElement('div');
                resizer.className = 'resizer-row';
                resizer.onmousedown = (e) => initResize(e, 'row', w, el.offsetHeight);
                el.appendChild(resizer);
            }
            container.appendChild(el);
            currentDay++;
        }
        const weekEnd = new Date(year, month, currentDay - 1);
        const weekStartDt = new Date(year, month, currentDay - 7);
        const sStr = formatDateSafe(weekStartDt);
        const eStr = formatDateSafe(weekEnd);
        const currentRowEvents = data.filter(ev => ev.date >= sStr && ev.date <= eStr);
        const statCell = document.createElement('div');
        statCell.className = 'stats-cell';
        statCell.innerHTML = getWeeklyListHTML(currentRowEvents);
        container.appendChild(statCell);
    }
    container.style.gridTemplateRows = rowTemplate;
}

function renderWeek(data, container) {
    const start = getStartOfWeek(state.currentDate);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const sStr = formatDateSafe(start);
    const eStr = formatDateSafe(end);
    const weekEvents = data.filter(ev => ev.date >= sStr && ev.date <= eStr);

    for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const el = document.createElement('div');
        el.className = 'day-cell header';
        el.innerText = d.toLocaleDateString('en-US', {
            weekday: 'short',
            day: 'numeric'
        });
        const resizer = document.createElement('div');
        resizer.className = 'resizer-col';
        resizer.onmousedown = (e) => initResize(e, 'col', i, el.offsetWidth);
        el.appendChild(resizer);
        container.appendChild(el);
    }
    const statsHeader = document.createElement('div');
    statsHeader.className = 'day-cell header stats-cell';
    statsHeader.innerText = 'Tasks';
    container.appendChild(statsHeader);

    for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const dateStr = formatDateSafe(d);
        const items = data.filter(ev => ev.date === dateStr);
        const el = document.createElement('div');
        el.className = 'day-cell';
        el.ondragover = handleDragOver;
        el.ondrop = (e) => handleDrop(e, dateStr);
        el.ondragleave = handleDragLeave;

        const content = document.createElement('div');
        content.className = 'cell-content';
        items.forEach(item => content.appendChild(createEventElement(item)));
        el.appendChild(content);

        container.appendChild(el);
    }
    const statCell = document.createElement('div');
    statCell.className = 'stats-cell';
    statCell.innerHTML = getWeeklyListHTML(weekEvents);
    container.appendChild(statCell);
}

window.loadCat = loadCat;
loadFromLocal().then(() => {
    if (!events.length) fetchHolidays();
});