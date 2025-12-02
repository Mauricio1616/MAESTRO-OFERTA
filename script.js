// --- CONFIGURACIÓN ---
const CONFIG = {
    startHour: 6,    
    endHour: 23,     
    slotHeight: 80   
};

// --- PALETA DE COLORES PERSONALIZADA (UAGRM / TEMA DARK) ---
const THEME = {
    bgMain: "#0a0a0a",      // Fondo negro
    bgPanel: "#162b4e",     // Azul header
    accent: "#510100",      // Rojo
    border: "#84939c",      // Gris azulado
    text: "#FFFFFF"         // Blanco
};

// Estado
let appState = {
    allSubjects: {}, 
    flatSubjects: [], 
    selectedSubjects: [],
    currentLevel: null,
    mode: 'normal', 
    selectedTeacher: null,
    selectedGroupData: null
};

// --- NUEVA PALETA CORPORATIVA "EJECUTIVA" (Adiós Arcoiris) ---
const COLORS = [
    // 1. Rojo Institucional (Variante para contraste)
    { bg: '#510100', border: '#7f1d1d' }, 
    // 2. Azul Institucional
    { bg: '#162b4e', border: '#1e40af' }, 
    // 3. Gris Plomo (Elegante)
    { bg: '#1f2937', border: '#374151' }, 
    // 4. Azul Petróleo (Profundo)
    { bg: '#0f2c38', border: '#155e75' }, 
    // 5. Rojo Vino (Alternativo)
    { bg: '#450a0a', border: '#7f1d1d' }, 
    // 6. Azul Acero
    { bg: '#1e3a8a', border: '#3b82f6' }
];

document.addEventListener('DOMContentLoaded', () => {
    initCalendarGrid();
    
    const safeAdd = (id, evt, fn) => {
        const el = document.getElementById(id);
        if(el) el.addEventListener(evt, fn);
    };

    safeAdd('file-input', 'change', handleFileUpload);
    safeAdd('download-template-btn', 'click', generateTemplate);
    safeAdd('search-box', 'input', (e) => handleGlobalSearch(e.target.value));
    safeAdd('clear-btn', 'click', clearAll);
    
    safeAdd('export-img-btn', 'click', () => downloadSchedule('image'));
    safeAdd('export-pdf-btn', 'click', () => downloadSchedule('pdf'));
    safeAdd('export-all-btn', 'click', exportAllToPDF);
    
    safeAdd('teachers-btn', 'click', () => toggleTeachersModal(true));
    safeAdd('teacher-search', 'input', (e) => renderTeachersGrid(e.target.value));
    safeAdd('groups-btn', 'click', () => toggleGroupsModal(true));
});

// 1. INICIALIZACIÓN DE LA GRILLA (PANTALLA)
function initCalendarGrid() {
    const grid = document.getElementById('grid-lines');
    const container = document.getElementById('grid-container');
    const hoursCount = CONFIG.endHour - CONFIG.startHour;
    const totalHeight = hoursCount * CONFIG.slotHeight;
    
    container.style.height = `${totalHeight}px`;
    
    let html = '';
    for (let h = CONFIG.startHour; h < CONFIG.endHour; h++) {
        for (let m = 0; m < 60; m += 15) {
            const timeLabel = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
            const topPos = ((h - CONFIG.startHour) + (m / 60)) * CONFIG.slotHeight;
            const isHour = m === 0;
            const rowHeight = CONFIG.slotHeight / 4; 

            // Estilos ajustados al tema #84939c
            const borderClass = isHour ? 'border-[#84939c]' : 'border-[#84939c]/30 border-dashed'; 
            const textClass = isHour 
                ? 'text-white font-bold text-[11px]' 
                : 'text-[#84939c] text-[9px]';        
            const labelBg = isHour ? 'bg-[#162b4e]' : ''; // Azul panel en la etiqueta de hora

            html += `
                <div class="absolute w-full border-b ${borderClass} flex box-border" style="top: ${topPos}px; height: ${rowHeight}px;">
                    <div class="w-[60px] relative border-r border-[#84939c] ${labelBg} flex items-start justify-end pr-2 pt-0.5 shrink-0 z-10">
                        <span class="${textClass} font-mono leading-none tracking-tight">${timeLabel}</span>
                    </div>
                    ${Array(7).fill('').map(() => `<div class="flex-1 border-r border-[#84939c]/30"></div>`).join('')}
                </div>
            `;
        }
    }
    grid.innerHTML = html;
}

// 2. PROCESAMIENTO EXCEL
function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    toggleLoading(true, "Leyendo archivo...");
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, {header: 1}); 
            parseExcelRows(rows);
        } catch (err) {
            alert("Error crítico al leer Excel: " + err.message);
        } finally {
            toggleLoading(false);
            document.getElementById('file-input').value = '';
        }
    };
    reader.readAsArrayBuffer(file);
}

function parseExcelRows(rows) {
    if (!rows || rows.length === 0) { alert("Archivo vacío."); return; }
    let headerIdx = -1;
    let map = { sigla: -1, grupo: -1, materia: -1, nivel: -1, docente: -1, schedules: [] };

    try {
        for(let i=0; i < Math.min(rows.length, 50); i++) {
            if (!rows[i]) continue;
            const rowStr = rows[i].map(c => c ? String(c).toUpperCase().trim() : "");
            if(rowStr.includes("SIGLA") || rowStr.includes("MATERIA")) {
                headerIdx = i;
                rowStr.forEach((cell, colIdx) => {
                    if(cell.includes("SIGLA")) map.sigla = colIdx;
                    if(cell.includes("GRUPO")) map.grupo = colIdx;
                    if(cell.includes("MATERIA") || cell.includes("ASIGNATURA")) map.materia = colIdx;
                    if(cell.includes("NIVEL") || cell.includes("SEM")) map.nivel = colIdx;
                    if(cell.includes("DOCENTE")) map.docente = colIdx;
                });
                for(let j=1; j<=4; j++) {
                    let sMap = { day: -1, start: -1, end: -1, room: -1 };
                    rowStr.forEach((cell, colIdx) => {
                        if(cell === `DIA ${j}` || cell === `DÍA ${j}` || cell === `DIA${j}`) sMap.day = colIdx;
                        if(sMap.day !== -1) {
                            if(cell.includes(`INICIO`) && cell.includes(`${j}`)) sMap.start = colIdx;
                            if(cell.includes(`FIN`) && cell.includes(`${j}`)) sMap.end = colIdx;
                            if(cell.includes(`AULA`) && cell.includes(`${j}`)) sMap.room = colIdx;
                        }
                    });
                    if(sMap.day !== -1) map.schedules.push(sMap);
                }
                if(map.schedules.length === 0) {
                    rowStr.forEach((cell, colIdx) => {
                        if(cell === "DIA" || cell === "DÍA") map.schedules.push({ day: colIdx, start: colIdx + 1, end: colIdx + 2, room: colIdx + 3 });
                    });
                }
                break;
            }
        }
    } catch (e) { console.error(e); }

    if(headerIdx === -1) { alert("No se encontró cabecera."); return; }

    appState.allSubjects = {};
    appState.flatSubjects = [];
    let count = 0;

    for(let i = headerIdx + 1; i < rows.length; i++) {
        try {
            const row = rows[i];
            if(!row) continue;
            const matVal = map.materia !== -1 ? row[map.materia] : null;
            if(!matVal) continue;

            let schedules = [];
            map.schedules.forEach(m => {
                if(m.day !== -1 && row[m.day]) {
                    const dayVal = String(row[m.day]);
                    if(dayVal.trim().length > 2) { 
                        schedules.push({
                            day: normalizeDay(dayVal),
                            start: formatExcelTime(row[m.start]),
                            end: formatExcelTime(row[m.end]),
                            room: (m.room !== -1 && row[m.room]) ? row[m.room] : 'Virtual'
                        });
                    }
                }
            });

            if(schedules.length > 0) {
                let rawLevel = (map.nivel !== -1 && row[map.nivel]) ? String(row[map.nivel]).trim().toUpperCase() : 'Sin asignar semestre';
                let finalLevel = rawLevel;
                if(rawLevel.includes('E')) finalLevel = 'Electivas';
                else if(rawLevel.includes('T')) finalLevel = 'Talleres';

                const subjectObj = {
                    id: `sub_${count++}`,
                    sigla: (map.sigla !== -1 && row[map.sigla]) ? row[map.sigla] : '',
                    grupo: (map.grupo !== -1 && row[map.grupo]) ? String(row[map.grupo]).trim() : '0',
                    materia: matVal,
                    docente: (map.docente !== -1 && row[map.docente]) ? row[map.docente] : 'Por Designar',
                    schedules: schedules,
                    nivel: finalLevel
                };

                if(!appState.allSubjects[finalLevel]) appState.allSubjects[finalLevel] = [];
                appState.allSubjects[finalLevel].push(subjectObj);
                appState.flatSubjects.push(subjectObj);
            }
        } catch (err) { continue; }
    }
    renderLevelTabs();
}

// 3. UI y MODALES
function handleGlobalSearch(term) {
    const tabsEl = document.getElementById('level-tabs');
    const bannerEl = document.getElementById('search-mode-banner');
    if (term.trim().length > 0) {
        appState.mode = 'search';
        tabsEl.classList.add('hidden');
        bannerEl.classList.remove('hidden');
        renderSubjectList(term);
    } else {
        clearSearch();
    }
}

function clearSearch() {
    appState.mode = 'normal';
    document.getElementById('search-box').value = '';
    document.getElementById('level-tabs').classList.remove('hidden');
    document.getElementById('search-mode-banner').classList.add('hidden');
    document.getElementById('teacher-mode-banner').classList.add('hidden');
    document.getElementById('group-mode-banner').classList.add('hidden');
    renderSubjectList();
}

function toggleTeachersModal(show) {
    const modal = document.getElementById('teachers-modal');
    if(show) {
        if(appState.flatSubjects.length === 0) { alert("Primero carga un Excel."); return; }
        modal.classList.remove('hidden');
        renderTeachersGrid();
    } else {
        modal.classList.add('hidden');
    }
}

function renderTeachersGrid(filter = '') {
    const grid = document.getElementById('teachers-grid');
    const teachers = [...new Set(appState.flatSubjects.map(s => s.docente).filter(d => d && d !== 'Por Designar'))].sort();
    const filtered = teachers.filter(t => t.toLowerCase().includes(filter.toLowerCase()));
    
    // Uso de clases de tema
    grid.innerHTML = filtered.map(t => `
        <div onclick="selectTeacher('${t}')" 
                class="p-3 bg-[#162b4e] hover:bg-[#510100] rounded cursor-pointer transition-colors text-xs text-white border border-[#84939c]">
            👨‍🏫 ${t}
        </div>
    `).join('');
}

function selectTeacher(teacherName) {
    toggleTeachersModal(false);
    appState.mode = 'teacher';
    appState.selectedTeacher = teacherName;
    document.getElementById('level-tabs').classList.add('hidden');
    document.getElementById('search-mode-banner').classList.add('hidden');
    document.getElementById('group-mode-banner').classList.add('hidden');
    const banner = document.getElementById('teacher-mode-banner');
    banner.classList.remove('hidden');
    document.getElementById('teacher-name-label').innerText = teacherName;
    const subjects = appState.flatSubjects.filter(s => s.docente === teacherName);
    appState.selectedSubjects = [];
    subjects.forEach((sub, idx) => {
        const color = COLORS[idx % COLORS.length];
        appState.selectedSubjects.push({ ...sub, color });
    });
    updateUI();
}

function exitTeacherMode() {
    appState.mode = 'normal';
    appState.selectedTeacher = null;
    document.getElementById('teacher-mode-banner').classList.add('hidden');
    document.getElementById('level-tabs').classList.remove('hidden');
    renderSubjectList();
}

function toggleGroupsModal(show) {
    const modal = document.getElementById('groups-modal');
    if(show) {
        if(appState.flatSubjects.length === 0) { alert("Primero carga un Excel."); return; }
        modal.classList.remove('hidden');
        renderGroupsGrid();
    } else {
        modal.classList.add('hidden');
    }
}

function renderGroupsGrid() {
    const grid = document.getElementById('groups-grid');
    grid.innerHTML = '';
    const levels = Object.keys(appState.allSubjects).sort((a,b) => (parseInt(a)||999) - (parseInt(b)||999));
    levels.forEach(level => {
        const subjectsInLevel = appState.allSubjects[level];
        const uniqueGroups = [...new Set(subjectsInLevel.map(s => s.grupo))].sort();
        uniqueGroups.forEach(grp => {
            const el = document.createElement('div');
            el.className = "p-3 bg-[#162b4e] hover:bg-[#510100] rounded cursor-pointer transition-colors border border-[#84939c] flex flex-col items-center justify-center";
            el.innerHTML = `
                <span class="text-xs text-[#84939c] uppercase tracking-widest text-[9px]">Semestre ${level}</span>
                <span class="text-lg font-bold text-white">Grupo ${grp}</span>
            `;
            el.onclick = () => selectGroup(level, grp);
            grid.appendChild(el);
        });
    });
}

function selectGroup(level, group) {
    toggleGroupsModal(false);
    appState.mode = 'group';
    appState.selectedGroupData = { level, group };
    document.getElementById('level-tabs').classList.add('hidden');
    document.getElementById('search-mode-banner').classList.add('hidden');
    document.getElementById('teacher-mode-banner').classList.add('hidden');
    const banner = document.getElementById('group-mode-banner');
    banner.classList.remove('hidden');
    document.getElementById('group-name-label').innerText = `${level} - GRP ${group}`;
    const subjects = appState.allSubjects[level].filter(s => s.grupo === group);
    appState.selectedSubjects = [];
    subjects.forEach((sub, idx) => {
        const color = COLORS[idx % COLORS.length];
        appState.selectedSubjects.push({ ...sub, color });
    });
    updateUI();
}

function exitGroupMode() {
    appState.mode = 'normal';
    appState.selectedGroupData = null;
    document.getElementById('group-mode-banner').classList.add('hidden');
    document.getElementById('level-tabs').classList.remove('hidden');
    renderSubjectList();
}

// 5. RENDERIZADO LATERAL
function renderLevelTabs() {
    const container = document.getElementById('level-tabs');
    const levels = Object.keys(appState.allSubjects).sort((a,b) => (parseInt(a)||999) - (parseInt(b)||999));
    if(levels.length === 0) { container.innerHTML = '<span class="text-xs text-[#84939c] px-2">Sin datos</span>'; return; }
    container.innerHTML = levels.map(lvl => `
        <button onclick="changeLevel('${lvl}')" 
            class="px-4 py-1.5 rounded-full text-xs font-bold transition-all border border-[#84939c]
            ${appState.currentLevel == lvl ? 'bg-[#510100] text-white border-white shadow-md' : 'bg-[#162b4e] text-[#84939c] hover:bg-[#0f1e36]'}">
            ${lvl.replace(/^\d+$/, 'Semestre $&')}
        </button>
    `).join('');
    if(!appState.currentLevel || !levels.includes(appState.currentLevel)) changeLevel(levels[0]);
}

window.changeLevel = function(lvl) {
    if(appState.mode === 'search' || appState.mode === 'teacher' || appState.mode === 'group') return; 
    appState.currentLevel = lvl;
    renderLevelTabs();
    renderSubjectList();
}

function renderSubjectList(filter = '') {
    const container = document.getElementById('subjects-list');
    let listToRender = [];
    if (appState.mode === 'search') listToRender = appState.flatSubjects;
    else if (appState.mode === 'teacher') listToRender = appState.flatSubjects.filter(s => s.docente === appState.selectedTeacher);
    else if (appState.mode === 'group') listToRender = appState.allSubjects[appState.selectedGroupData.level].filter(s => s.grupo === appState.selectedGroupData.group);
    else listToRender = appState.allSubjects[appState.currentLevel] || [];

    const cleanFilter = filter.toLowerCase();
    const filtered = listToRender.filter(s => String(s.materia).toLowerCase().includes(cleanFilter) || String(s.docente).toLowerCase().includes(cleanFilter) || String(s.grupo).toLowerCase().includes(cleanFilter) || String(s.sigla).toLowerCase().includes(cleanFilter));

    if(filtered.length === 0) { container.innerHTML = '<div class="text-center text-[#84939c] mt-4 text-xs">Sin resultados</div>'; return; }

    const grouped = {};
    filtered.forEach(item => { const name = item.materia; if(!grouped[name]) grouped[name] = []; grouped[name].push(item); });
    const sortedNames = Object.keys(grouped).sort();

    container.innerHTML = sortedNames.map(materiaName => {
        const groups = grouped[materiaName];
        const anySelected = groups.some(g => appState.selectedSubjects.some(s => s.id === g.id));
        const selectedCount = groups.filter(g => appState.selectedSubjects.some(s => s.id === g.id)).length;
        const isExpanded = (appState.mode === 'search') || (appState.mode === 'teacher') || (appState.mode === 'group') || anySelected;
        const hiddenClass = isExpanded ? '' : 'hidden';
        const arrowRot = isExpanded ? 'rotate-180' : '';
        // Colores de la lista lateral también ajustados
        const bgClass = anySelected ? 'border-[#510100] bg-[#162b4e]' : 'border-[#84939c] bg-[#162b4e]/50';
        const safeId = materiaName.replace(/[^a-zA-Z0-9]/g, '_') + Math.random().toString(36).substr(2,5); 
        const siglaBadge = groups[0].sigla ? `<span class="text-[#84939c] font-mono mr-1">[${groups[0].sigla}]</span>` : '';

        let html = `
            <div class="mb-2 border rounded-lg overflow-hidden ${bgClass} transition-colors">
                <div onclick="toggleAccordion('${safeId}')"
                        class="p-3 cursor-pointer flex justify-between items-center hover:bg-[#0a0a0a]/50 transition-colors select-none">
                    <div class="overflow-hidden">
                        <h4 class="font-bold text-xs text-gray-200 truncate pr-2 flex items-center">
                            ${siglaBadge} ${materiaName}
                        </h4>
                        <p class="text-[10px] text-[#84939c]">${groups.length} grupos</p>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        ${selectedCount > 0 ? `<span class="bg-[#510100] text-[9px] px-1.5 py-0.5 rounded-full text-white font-bold">${selectedCount}</span>` : ''}
                        <svg id="arrow-${safeId}" class="w-4 h-4 text-[#84939c] transform transition-transform duration-200 ${arrowRot}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                </div>
                <div id="list-${safeId}" class="${hiddenClass} bg-[#0a0a0a]/30 border-t border-[#84939c]/50">
        `;
        html += groups.map(sub => {
            const isSelected = appState.selectedSubjects.some(s => s.id === sub.id);
            // Si está seleccionado, buscamos su color en el estado
            let color = null;
            if(isSelected) {
                const found = appState.selectedSubjects.find(s => s.id === sub.id);
                if(found) color = found.color;
            }
            
            const borderStyle = isSelected && color ? `border-left-color: ${color.border}; background-color: rgba(22, 43, 78, 0.8);` : 'border-left-color: transparent;';
            
            return `
                    <div onclick="toggleSubject('${sub.id}')" 
                            class="p-2 border-b border-[#84939c]/30 last:border-0 cursor-pointer transition-all hover:bg-white/5 relative group
                            ${isSelected ? 'pl-3' : 'pl-4 opacity-75 hover:opacity-100 hover:pl-3'}"
                            style="${borderStyle} border-left-width: 4px;">
                        <div class="flex justify-between items-center mb-1">
                            <span class="text-[10px] font-mono bg-[#0a0a0a] text-[#84939c] px-1.5 rounded border border-[#84939c] shadow-sm">Grp ${sub.grupo || '?'}</span>
                        </div>
                        <p class="text-[10px] text-gray-300 truncate font-medium mb-1">${sub.docente}</p>
                        <div class="flex flex-wrap gap-1">
                            ${sub.schedules.map(s => 
                                `<span class="text-[9px] bg-[#0a0a0a] px-1.5 rounded text-[#84939c] border border-[#84939c]/50">
                                    ${s.day.substring(0,3)} ${s.start}
                                </span>`
                            ).join('')}
                        </div>
                    </div>
            `;
        }).join('');
        html += `</div></div>`;
        return html;
    }).join('');
}

window.toggleAccordion = function(id) {
    const list = document.getElementById(`list-${id}`);
    const arrow = document.getElementById(`arrow-${id}`);
    if(list.classList.contains('hidden')) {
        list.classList.remove('hidden');
        arrow.classList.add('rotate-180');
    } else {
        list.classList.add('hidden');
        arrow.classList.remove('rotate-180');
    }
}

window.toggleSubject = function(id) {
    const subject = appState.flatSubjects.find(s => s.id === id);
    if(!subject) return;
    const idx = appState.selectedSubjects.findIndex(s => s.id === id);
    if(idx > -1) {
        appState.selectedSubjects.splice(idx, 1);
    } else {
        if (appState.mode !== 'teacher' && appState.mode !== 'group') {
            const conflict = findConflict(subject);
            if(conflict) { alert(`⚠️ CHOQUE DE HORARIO\n\nCon: ${conflict.with}\nDía: ${conflict.day} Hora: ${conflict.time}`); return; }
        }
        const color = COLORS[appState.selectedSubjects.length % COLORS.length];
        appState.selectedSubjects.push({ ...subject, color });
    }
    updateUI();
}

function findConflict(newSub) {
    for(let exist of appState.selectedSubjects) {
        for(let s1 of exist.schedules) {
            for(let s2 of newSub.schedules) {
                if(s1.day === s2.day) {
                    const start1 = timeToMin(s1.start);
                    const end1 = timeToMin(s1.end);
                    const start2 = timeToMin(s2.start);
                    const end2 = timeToMin(s2.end);
                    if(Math.max(start1, start2) < Math.min(end1, end2)) return { with: exist.materia, day: s1.day, time: `${s1.start}-${s1.end}` };
                }
            }
        }
    }
    return null;
}

function updateUI() {
    document.getElementById('selected-count').innerText = appState.selectedSubjects.length;
    renderSubjectList(appState.mode === 'search' ? document.getElementById('search-box').value : '');
    drawEvents();
}

function drawEvents() {
    const container = document.getElementById('calendar-events');
    container.innerHTML = '';
    const DAYS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];

    appState.selectedSubjects.forEach(sub => {
        sub.schedules.forEach(sched => {
            const dayIdx = DAYS.indexOf(sched.day);
            if(dayIdx === -1) return;
            const startMin = timeToMin(sched.start);
            const endMin = timeToMin(sched.end);
            if (isNaN(startMin) || isNaN(endMin)) return;

            const topPx = ((startMin/60) - CONFIG.startHour) * CONFIG.slotHeight;
            const heightPx = ((endMin - startMin) / 60) * CONFIG.slotHeight;
            
            const el = document.createElement('div');
            el.className = 'calendar-event pointer-events-auto flex flex-col justify-center';
            el.style.zIndex = '20'; 
            el.style.top = `${topPx}px`;
            el.style.height = `${heightPx}px`;
            el.style.left = `calc(60px + ((100% - 60px) / 7) * ${dayIdx} + 2px)`;
            el.style.width = `calc(((100% - 60px) / 7) - 4px)`;
            
            el.style.backgroundColor = sub.color.bg;
            el.style.borderLeftColor = sub.color.border;
            
            el.innerHTML = `
                <div class="font-bold truncate text-white drop-shadow-md text-[10px] leading-tight">
                    <span class="font-mono text-cyan-200 text-[9px] mr-1">${sub.sigla}</span>${sub.materia}
                </div>
                <div class="text-[9px] text-yellow-200 font-bold truncate leading-tight mt-0.5 mb-0.5">${sched.start} - ${sched.end}</div>
                <div class="text-[9px] text-white/90 truncate leading-tight font-medium">${sub.docente}</div>
                <div class="text-[9px] text-white/80 truncate leading-tight">${sub.grupo} - ${sched.room}</div>
            `;
            el.title = `[${sub.sigla}] ${sub.materia}\nDocente: ${sub.docente}\nGrupo: ${sub.grupo}\nAula: ${sched.room}\nHorario: ${sched.start} - ${sched.end}`;
            container.appendChild(el);
        });
    });
}

function normalizeDay(day) {
    if(!day) return "";
    const d = day.trim().toLowerCase();
    if(d.includes('lun')) return 'Lunes';
    if(d.includes('mar')) return 'Martes';
    if(d.includes('mi')) return 'Miércoles';
    if(d.includes('jue')) return 'Jueves';
    if(d.includes('vie')) return 'Viernes';
    if(d.includes('sab') || d.includes('sáb')) return 'Sábado';
    if(d.includes('dom')) return 'Domingo';
    return day;
}
function formatExcelTime(val) {
    try {
        if(val === undefined || val === null) return "00:00";
        if(typeof val === 'number') {
            const totalSec = Math.round(val * 86400);
            const h = Math.floor(totalSec / 3600);
            const m = Math.floor((totalSec % 3600) / 60);
            return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
        }
        return String(val).trim().substring(0,5);
    } catch(e) { return "00:00"; }
}
function timeToMin(time) {
    if(!time) return 0;
    const [h, m] = time.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return 0;
    return (h*60) + m;
}
function clearAll() {
    if(confirm("¿Limpiar todo?")) {
        appState.selectedSubjects = [];
        if(appState.mode === 'teacher') exitTeacherMode(); 
        if(appState.mode === 'group') exitGroupMode(); 
        updateUI();
    }
}
function toggleLoading(show, text = "Procesando...") {
    const el = document.getElementById('loading-overlay');
    const txt = document.getElementById('loading-text');
    if(txt) txt.innerText = text;
    show ? el.classList.remove('hidden') : el.classList.add('hidden');
}
function generateTemplate() {
    const headers = ["SIGLA","GRUPO","ASIGNATURA","NIVEL","DOCENTE","DIA 1","INICIO DE DIA 1","FIN DE DIA 1","AULA DEL DIA 1","DIA 2","INICIO DE DIA 2","FIN DE DIA 2","AULA DEL DIA 2"];
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla");
    XLSX.writeFile(wb, "Plantilla_Planificador.xlsx");
}

// --- GENERADOR CANVAS CON TEMA PERSONALIZADO ---
function generateCanvasForSubjects(subjects, titleText = null) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Altura Dinámica
    let minTime = CONFIG.startHour * 60; 
    let maxTime = CONFIG.endHour * 60;

    if (subjects.length > 0) {
        let earliest = 24 * 60; 
        let latest = 0;
        subjects.forEach(sub => {
            sub.schedules.forEach(s => {
                const sMin = timeToMin(s.start);
                const eMin = timeToMin(s.end);
                if (sMin > 0 && sMin < earliest) earliest = sMin;
                if (eMin > latest) latest = eMin;
            });
        });
        if (earliest < 24*60 && latest > 0) {
            let startHourCalc = Math.floor(earliest / 60);
            if (startHourCalc > 0) startHourCalc -= 1; 
            let endHourCalc = Math.ceil(latest / 60);
            if (endHourCalc < 24) endHourCalc += 1;
            minTime = startHourCalc * 60;
            maxTime = endHourCalc * 60;
        }
    }

    const startH = Math.max(0, Math.floor(minTime / 60));
    const endH = Math.min(24, Math.ceil(maxTime / 60));
    
    // HD
    const width = 2000;
    const headerHeight = 100;
    const hourHeight = 120; 
    const validTotalHours = Math.max(1, endH - startH);
    const bodyHeight = validTotalHours * hourHeight;
    const yOffset = titleText ? 80 : 0;
    const totalHeight = headerHeight + bodyHeight + yOffset;
    
    canvas.width = width;
    canvas.height = totalHeight;

    // 1. Fondo (Negro #0a0a0a)
    ctx.fillStyle = THEME.bgMain; 
    ctx.fillRect(0, 0, width, totalHeight);

    // Título Superior
    if (titleText) {
        ctx.fillStyle = THEME.bgPanel;
        ctx.fillRect(0, 0, width, yOffset);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 40px Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(titleText, width / 2, yOffset / 2);
    }

    const getY = (timeStr) => {
        const min = timeToMin(timeStr);
        const startOffsetMin = startH * 60;
        return yOffset + headerHeight + ((min - startOffsetMin) / 60) * hourHeight;
    };

    let timeLabels = [];
    for(let h = startH; h < endH; h++) {
        for(let m = 0; m < 60; m += 15) {
            timeLabels.push({ 
                time: `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`, 
                min: h * 60 + m, 
                type: m === 0 ? 'hour' : 'quarter' 
            });
        }
    }
    timeLabels.push({ time: `${endH}:00`, min: endH * 60, type: 'hour' });

    // Grid
    const colWidth = (width - 120) / 7; 
    const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

    // Cabecera (Azul #162b4e)
    ctx.fillStyle = THEME.bgPanel;
    ctx.fillRect(0, yOffset, width, headerHeight);
    
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = THEME.border; // Texto Gris azulado
    ctx.font = "bold 24px Arial, sans-serif";
    ctx.fillText("HORA", 60, yOffset + headerHeight/2);
    
    days.forEach((day, i) => {
        const x = 120 + (i * colWidth);
        ctx.fillStyle = THEME.text; // Blanco para días
        ctx.fillText(day, x + (colWidth/2), yOffset + headerHeight/2);
        
        ctx.beginPath();
        ctx.strokeStyle = THEME.border;
        ctx.lineWidth = 2;
        ctx.moveTo(x, yOffset);
        ctx.lineTo(x, totalHeight);
        ctx.stroke();
    });

    // Líneas
    ctx.textAlign = "right";
    ctx.textBaseline = "middle"; 

    timeLabels.forEach(lbl => {
        const y = getY(lbl.time);
        
        if (lbl.type === 'hour') {
            ctx.fillStyle = THEME.text; // Blanco brillante para hora
            ctx.font = "bold 24px Arial, monospace";
            ctx.fillText(lbl.time, 110, y);
            
            ctx.beginPath();
            ctx.strokeStyle = THEME.border; 
            ctx.lineWidth = 1;
            ctx.setLineDash([]);
            ctx.moveTo(120, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        } else {
            ctx.fillStyle = THEME.border; // Gris azulado para 15 min
            ctx.font = "16px Arial, monospace"; 
            ctx.fillText(lbl.time, 110, y);

            ctx.beginPath();
            ctx.strokeStyle = THEME.border; 
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]); 
            ctx.moveTo(120, y);
            ctx.lineTo(width, y);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    });

    // Materias
    ctx.textBaseline = "top"; 

    subjects.forEach(sub => {
        sub.schedules.forEach(sched => {
            const dayIndex = days.indexOf(sched.day);
            if(dayIndex === -1) return;
            const startMin = timeToMin(sched.start);
            const endMin = timeToMin(sched.end);
            if (startMin < (startH * 60)) return; 
            const startOffsetMin = (startH * 60);
            
            const startY = yOffset + headerHeight + ((startMin - startOffsetMin) / 60) * hourHeight;
            const durationMin = endMin - startMin;
            const height = (durationMin / 60) * hourHeight;
            const x = 120 + (dayIndex * colWidth);
            
            const gap = 4;
            const boxX = x + gap;
            const boxY = startY + 1;
            const boxW = colWidth - (gap * 2);
            const boxH = height - 2;

            ctx.fillStyle = "rgba(0,0,0,0.5)";
            ctx.fillRect(boxX + 6, boxY + 6, boxW, boxH);

            ctx.fillStyle = sub.color.bg;
            ctx.fillRect(boxX, boxY, boxW, boxH);
            
            ctx.strokeStyle = "rgba(255,255,255,0.4)"; 
            ctx.lineWidth = 2;
            ctx.strokeRect(boxX, boxY, boxW, boxH);
            
            ctx.fillStyle = sub.color.border;
            ctx.fillRect(boxX, boxY, 10, boxH);

            ctx.fillStyle = "white";
            ctx.textAlign = "left";
            
            const fontSize = Math.max(14, Math.min(20, height / 5));
            ctx.font = `bold ${fontSize}px Arial, sans-serif`;
            
            let textY = startY + 10;
            ctx.fillText(`[${sub.sigla}] ${sub.materia}`, boxX + 18, textY, boxW - 24);
            
            textY += fontSize + 6;
            ctx.font = `bold ${fontSize - 2}px Arial, sans-serif`;
            ctx.fillStyle = "#fef08a"; // Amarillo claro para hora
            ctx.fillText(`${sched.start} - ${sched.end}`, boxX + 18, textY, boxW - 24);
            
            textY += fontSize + 4;
            ctx.font = `${fontSize - 2}px Arial, sans-serif`;
            ctx.fillStyle = "rgba(255,255,255,0.95)";
            ctx.fillText(sub.docente, boxX + 18, textY, boxW - 24);
            
            textY += fontSize + 2;
            ctx.fillStyle = "rgba(255,255,255,0.85)";
            ctx.fillText(`Aula: ${sched.room} (Grp ${sub.grupo})`, boxX + 18, textY, boxW - 24);
        });
    });

    return canvas;
}

function downloadSchedule(format) {
    if(appState.selectedSubjects.length === 0) { alert("Horario vacío. Agrega materias."); return; }
    toggleLoading(true, "Generando...");
    const canvas = generateCanvasForSubjects(appState.selectedSubjects);
    if (format === 'image') {
        const link = document.createElement('a');
        link.download = 'mi_horario_hd.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
        toggleLoading(false);
    } else if (format === 'pdf') {
        const imgData = canvas.toDataURL('image/png');
        const pdfWidth = canvas.width * 0.264583; 
        const pdfHeight = canvas.height * 0.264583;
        const pdf = new window.jspdf.jsPDF({ orientation: pdfWidth > pdfHeight ? 'l' : 'p', unit: 'mm', format: [pdfWidth, pdfHeight] });
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save('mi_horario_hd.pdf');
        toggleLoading(false);
    }
}

async function exportAllToPDF() {
    const levels = Object.keys(appState.allSubjects);
    if(levels.length === 0) { alert("No hay datos cargados para exportar."); return; }
    if(!confirm(`Se generará un PDF con todos los grupos de ${levels.length} semestres. Esto puede tardar unos segundos. ¿Continuar?`)) return;
    toggleLoading(true, "Generando PDF Masivo...");
    await new Promise(r => setTimeout(r, 100));
    try {
        const pdf = new window.jspdf.jsPDF('l', 'mm', 'a4'); 
        let pageAdded = false;
        const sortedLevels = levels.sort((a,b) => (parseInt(a)||999) - (parseInt(b)||999));
        for (const level of sortedLevels) {
            const subjectsInLevel = appState.allSubjects[level];
            const groups = {};
            subjectsInLevel.forEach(s => { const g = s.grupo; if(!groups[g]) groups[g] = []; groups[g].push(s); });
            const sortedGroups = Object.keys(groups).sort();
            for (const grp of sortedGroups) {
                const groupSubjects = groups[grp];
                const subjectsWithColors = groupSubjects.map((s, i) => ({ ...s, color: COLORS[i % COLORS.length] }));
                const title = `Semestre ${level} - Grupo ${grp}`;
                const canvas = generateCanvasForSubjects(subjectsWithColors, title);
                const imgData = canvas.toDataURL('image/jpeg', 0.75);
                const pdfWidth = canvas.width * 0.264583;
                const pdfHeight = canvas.height * 0.264583;
                if (pageAdded) { pdf.addPage([pdfWidth, pdfHeight], pdfWidth > pdfHeight ? 'l' : 'p'); } else { pdf.addPage([pdfWidth, pdfHeight], pdfWidth > pdfHeight ? 'l' : 'p'); pageAdded = true; }
                const pageCount = pdf.internal.getNumberOfPages();
                pdf.setPage(pageCount);
                pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
                canvas.width = 1; canvas.height = 1;
            }
        }
        pdf.deletePage(1);
        pdf.save('Horarios_Completos_UAGRM.pdf');
    } catch (e) { console.error(e); alert("Error al generar PDF masivo: " + e.message); } finally { toggleLoading(false); }
}
