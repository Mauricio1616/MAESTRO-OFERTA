// --- CONFIGURACIÓN ---
const CONFIG = {
    startHour: 6,    // 06:00
    endHour: 23,     // 23:00
    slotHeight: 40   // Píxeles por hora
};

// Estado
let appState = {
    allSubjects: {}, // { Nivel: [Materias] }
    flatSubjects: [], // Array plano de todas las materias para búsqueda global
    selectedSubjects: [],
    currentLevel: null,
    mode: 'normal', // 'normal', 'search', 'teacher', 'group'
    selectedTeacher: null,
    selectedGroupData: null // { level: '...', group: '...' }
};

const COLORS = [
    { bg: '#059669', border: '#34d399' }, { bg: '#2563eb', border: '#60a5fa' },
    { bg: '#d97706', border: '#fbbf24' }, { bg: '#dc2626', border: '#f87171' },
    { bg: '#7c3aed', border: '#a78bfa' }, { bg: '#db2777', border: '#f472b6' },
    { bg: '#0891b2', border: '#22d3ee' }, { bg: '#4f46e5', border: '#818cf8' }
];

document.addEventListener('DOMContentLoaded', () => {
    initCalendarGrid();
    
    // Listeners seguros
    const safeAdd = (id, evt, fn) => {
        const el = document.getElementById(id);
        if(el) el.addEventListener(evt, fn);
    };

    safeAdd('file-input', 'change', handleFileUpload);
    safeAdd('download-template-btn', 'click', generateTemplate);
    safeAdd('search-box', 'input', (e) => handleGlobalSearch(e.target.value));
    safeAdd('clear-btn', 'click', clearAll);
    safeAdd('export-img-btn', 'click', exportAsImage);
    safeAdd('export-pdf-btn', 'click', exportAsPDF);
    
    // Modal Docentes
    safeAdd('teachers-btn', 'click', () => toggleTeachersModal(true));
    safeAdd('teacher-search', 'input', (e) => renderTeachersGrid(e.target.value));

    // Modal Grupos
    safeAdd('groups-btn', 'click', () => toggleGroupsModal(true));
});

// 1. INICIALIZACIÓN
function initCalendarGrid() {
    const grid = document.getElementById('grid-lines');
    const container = document.getElementById('grid-container');
    const hoursCount = CONFIG.endHour - CONFIG.startHour;
    const totalHeight = hoursCount * CONFIG.slotHeight;
    
    container.style.height = `${totalHeight}px`;
    
    let html = '';
    for (let h = CONFIG.startHour; h < CONFIG.endHour; h++) {
        const timeLabel = `${h.toString().padStart(2,'0')}:00`;
        const topPos = (h - CONFIG.startHour) * CONFIG.slotHeight;
        
        html += `
            <div class="absolute w-full border-b border-gray-800 flex" style="top: ${topPos}px; height: ${CONFIG.slotHeight}px;">
                <div class="w-[60px] relative border-r border-gray-700 bg-gray-800/30">
                    <span class="time-label absolute right-2 -top-2.5 text-[10px] text-gray-500 font-mono bg-gray-900 px-1 rounded">${timeLabel}</span>
                </div>
                ${Array(7).fill('').map(() => `<div class="flex-1 border-r border-gray-800/50"></div>`).join('')}
            </div>
        `;
        html += `<div class="absolute w-full border-b border-gray-800/30 dashed pointer-events-none" style="top: ${topPos + (CONFIG.slotHeight/2)}px;"></div>`;
    }
    grid.innerHTML = html;
}

// 2. PROCESAMIENTO EXCEL
function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    toggleLoading(true);
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
                if(map.schedules.length === 0) { // Fallback
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
                appState.flatSubjects.push(subjectObj); // Guardar copia plana para búsqueda
            }
        } catch (err) { continue; }
    }
    renderLevelTabs();
}

// 3. NAVEGACIÓN Y BÚSQUEDA GLOBAL
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
    renderSubjectList(); // Vuelve al nivel actual
}

// 4. LÓGICA DE DOCENTES
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
    // Extraer docentes únicos
    const teachers = [...new Set(appState.flatSubjects.map(s => s.docente).filter(d => d && d !== 'Por Designar'))].sort();
    
    const filtered = teachers.filter(t => t.toLowerCase().includes(filter.toLowerCase()));
    
    grid.innerHTML = filtered.map(t => `
        <div onclick="selectTeacher('${t}')" 
                class="p-3 bg-gray-700 hover:bg-purple-600 rounded cursor-pointer transition-colors text-xs text-gray-200 hover:text-white border border-gray-600">
            👨‍🏫 ${t}
        </div>
    `).join('');
}

function selectTeacher(teacherName) {
    toggleTeachersModal(false);
    // Activar Modo Docente
    appState.mode = 'teacher';
    appState.selectedTeacher = teacherName;
    
    // Actualizar UI
    document.getElementById('level-tabs').classList.add('hidden');
    document.getElementById('search-mode-banner').classList.add('hidden');
    document.getElementById('group-mode-banner').classList.add('hidden');
    const banner = document.getElementById('teacher-mode-banner');
    banner.classList.remove('hidden');
    document.getElementById('teacher-name-label').innerText = teacherName;
    
    // PROYECCIÓN AUTOMÁTICA: Seleccionar todas las materias de este docente
    const subjects = appState.flatSubjects.filter(s => s.docente === teacherName);
    appState.selectedSubjects = []; // Limpiar horario anterior
    
    subjects.forEach((sub, idx) => {
        // Asignar colores cíclicos
        const color = COLORS[idx % COLORS.length];
        appState.selectedSubjects.push({ ...sub, color });
    });

    updateUI(); // Esto pintará el calendario y la lista lateral
}

function exitTeacherMode() {
    appState.mode = 'normal';
    appState.selectedTeacher = null;
    document.getElementById('teacher-mode-banner').classList.add('hidden');
    document.getElementById('level-tabs').classList.remove('hidden');
    renderSubjectList();
}

// 5. NUEVA LÓGICA: GRUPOS Y SEMESTRES
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

    // Obtener niveles ordenados
    const levels = Object.keys(appState.allSubjects).sort((a,b) => {
        const numA = parseInt(a) || 999;
        const numB = parseInt(b) || 999;
        return numA - numB;
    });

    levels.forEach(level => {
        // Encontrar grupos únicos para este nivel
        const subjectsInLevel = appState.allSubjects[level];
        const uniqueGroups = [...new Set(subjectsInLevel.map(s => s.grupo))].sort();

        uniqueGroups.forEach(grp => {
            const el = document.createElement('div');
            el.className = "p-3 bg-gray-700 hover:bg-orange-600 rounded cursor-pointer transition-colors border border-gray-600 flex flex-col items-center justify-center";
            el.innerHTML = `
                <span class="text-xs text-gray-400 uppercase tracking-widest text-[9px]">Semestre ${level}</span>
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

    // Actualizar UI banners
    document.getElementById('level-tabs').classList.add('hidden');
    document.getElementById('search-mode-banner').classList.add('hidden');
    document.getElementById('teacher-mode-banner').classList.add('hidden');
    
    const banner = document.getElementById('group-mode-banner');
    banner.classList.remove('hidden');
    document.getElementById('group-name-label').innerText = `${level} - GRP ${group}`;

    // PROYECCIÓN AUTOMÁTICA
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


// 6. RENDERIZADO DE MATERIAS
function renderLevelTabs() {
    const container = document.getElementById('level-tabs');
    const levels = Object.keys(appState.allSubjects).sort((a,b) => {
        const getWeight = (lvl) => {
            if (lvl === 'Sin asignar semestre') return 1000;
            if (lvl === 'Talleres') return 999;
            if (lvl === 'Electivas') return 998;
            const num = parseInt(lvl);
            if (!isNaN(num)) return num;
            return 500; 
        };
        return getWeight(a) - getWeight(b);
    });

    if(levels.length === 0) { container.innerHTML = '<span class="text-xs text-red-400 px-2">Sin datos</span>'; return; }

    container.innerHTML = levels.map(lvl => `
        <button onclick="changeLevel('${lvl}')" 
            class="px-4 py-1.5 rounded-full text-xs font-bold transition-all border border-gray-700
            ${appState.currentLevel == lvl ? 'bg-cyan-600 text-white border-cyan-500 shadow-md' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}">
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

    // LÓGICA DE FUENTE DE DATOS
    if (appState.mode === 'search') {
        listToRender = appState.flatSubjects;
    } else if (appState.mode === 'teacher') {
        listToRender = appState.flatSubjects.filter(s => s.docente === appState.selectedTeacher);
    } else if (appState.mode === 'group') {
        const { level, group } = appState.selectedGroupData;
        if(appState.allSubjects[level]) {
            listToRender = appState.allSubjects[level].filter(s => s.grupo === group);
        }
    } else {
        listToRender = appState.allSubjects[appState.currentLevel] || [];
    }

    const cleanFilter = filter.toLowerCase();
    
    const filtered = listToRender.filter(s => 
        String(s.materia).toLowerCase().includes(cleanFilter) || 
        String(s.docente).toLowerCase().includes(cleanFilter) ||
        String(s.grupo).toLowerCase().includes(cleanFilter) ||
        String(s.sigla).toLowerCase().includes(cleanFilter)
    );

    if(filtered.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-500 mt-4 text-xs">Sin resultados</div>';
        return;
    }

    const grouped = {};
    filtered.forEach(item => {
        const name = item.materia;
        if(!grouped[name]) grouped[name] = [];
        grouped[name].push(item);
    });

    const sortedNames = Object.keys(grouped).sort();

    container.innerHTML = sortedNames.map(materiaName => {
        const groups = grouped[materiaName];
        const anySelected = groups.some(g => appState.selectedSubjects.some(s => s.id === g.id));
        const selectedCount = groups.filter(g => appState.selectedSubjects.some(s => s.id === g.id)).length;
        
        const isExpanded = (appState.mode === 'search') || (appState.mode === 'teacher') || (appState.mode === 'group') || anySelected;
        const hiddenClass = isExpanded ? '' : 'hidden';
        const arrowRot = isExpanded ? 'rotate-180' : '';
        const bgClass = anySelected ? 'border-cyan-600/50 bg-gray-800' : 'border-gray-700 bg-gray-800/50';
        const safeId = materiaName.replace(/[^a-zA-Z0-9]/g, '_') + Math.random().toString(36).substr(2,5); 

        const levelBadge = (appState.mode === 'search' && groups[0]) 
            ? `<span class="text-[9px] bg-gray-700 px-1 rounded ml-2 text-gray-400 border border-gray-600">${groups[0].nivel}</span>` 
            : '';

        const siglaBadge = groups[0].sigla ? `<span class="text-cyan-400 font-mono mr-1">[${groups[0].sigla}]</span>` : '';

        let html = `
            <div class="mb-2 border rounded-lg overflow-hidden ${bgClass} transition-colors">
                <div onclick="toggleAccordion('${safeId}')"
                        class="p-3 cursor-pointer flex justify-between items-center hover:bg-gray-700/50 transition-colors select-none">
                    <div class="overflow-hidden">
                        <h4 class="font-bold text-xs text-gray-200 truncate pr-2 flex items-center">
                            ${siglaBadge} ${materiaName} ${levelBadge}
                        </h4>
                        <p class="text-[10px] text-gray-500">${groups.length} grupos</p>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        ${selectedCount > 0 ? `<span class="bg-cyan-600 text-[9px] px-1.5 py-0.5 rounded-full text-white font-bold">${selectedCount}</span>` : ''}
                        <svg id="arrow-${safeId}" class="w-4 h-4 text-gray-500 transform transition-transform duration-200 ${arrowRot}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                </div>
                <div id="list-${safeId}" class="${hiddenClass} bg-black/20 border-t border-gray-700/50">
        `;

        html += groups.map(sub => {
            const isSelected = appState.selectedSubjects.some(s => s.id === sub.id);
            const color = isSelected ? appState.selectedSubjects.find(s => s.id === sub.id).color : null;
            const borderStyle = isSelected ? `border-left-color: ${color.border}; background-color: rgba(31, 41, 55, 0.8);` : 'border-left-color: transparent;';
            
            return `
                    <div onclick="toggleSubject('${sub.id}')" 
                            class="p-2 border-b border-gray-700/30 last:border-0 cursor-pointer transition-all hover:bg-white/5 relative group
                            ${isSelected ? 'pl-3' : 'pl-4 opacity-75 hover:opacity-100 hover:pl-3'}"
                            style="${borderStyle} border-left-width: 4px;">
                        <div class="flex justify-between items-center mb-1">
                            <span class="text-[10px] font-mono bg-gray-800 text-cyan-400 px-1.5 rounded border border-gray-700 shadow-sm">Grp ${sub.grupo || '?'}</span>
                        </div>
                        <p class="text-[10px] text-gray-300 truncate font-medium mb-1">${sub.docente}</p>
                        <div class="flex flex-wrap gap-1">
                            ${sub.schedules.map(s => 
                                `<span class="text-[9px] bg-gray-900/80 px-1.5 rounded text-gray-400 border border-gray-700/50">
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
            if(conflict) {
                alert(`⚠️ CHOQUE DE HORARIO\n\nCon: ${conflict.with}\nDía: ${conflict.day} Hora: ${conflict.time}`);
                return;
            }
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
                    if(Math.max(start1, start2) < Math.min(end1, end2)) {
                        return { with: exist.materia, day: s1.day, time: `${s1.start}-${s1.end}` };
                    }
                }
            }
        }
    }
    return null;
}

function updateUI() {
    document.getElementById('selected-count').innerText = appState.selectedSubjects.length;
    const searchTerm = appState.mode === 'search' ? document.getElementById('search-box').value : '';
    renderSubjectList(searchTerm);
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
            const topPx = ((startMin/60) - CONFIG.startHour) * CONFIG.slotHeight;
            const heightPx = ((endMin - startMin) / 60) * CONFIG.slotHeight;
            const leftPercent = (dayIdx * (100/7)); 

            const el = document.createElement('div');
            el.className = 'calendar-event pointer-events-auto flex flex-col justify-center';
            el.style.top = `${topPx}px`;
            el.style.height = `${heightPx}px`;
            el.style.left = `calc(60px + ${leftPercent}% + 2px)`;
            el.style.width = `calc((100% - 60px) / 7 - 4px)`;
            el.style.backgroundColor = sub.color.bg;
            el.style.borderLeftColor = sub.color.border;
            
            el.innerHTML = `
                <div class="font-bold truncate text-white drop-shadow-md text-[10px] leading-tight">
                    <span class="font-mono text-cyan-200 text-[9px] mr-1">${sub.sigla}</span>${sub.materia}
                </div>
                <div class="text-[9px] text-white/90 truncate leading-tight font-medium">${sub.docente}</div>
                <div class="text-[9px] text-white/80 truncate leading-tight">${sub.grupo} - ${sched.room}</div>
            `;
            el.title = `[${sub.sigla}] ${sub.materia}\nDocente: ${sub.docente}\nGrupo: ${sub.grupo}\nAula: ${sched.room}\nHorario: ${sched.start} - ${sched.end}`;
            container.appendChild(el);
        });
    });
}

// UTILS
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
function toggleLoading(show) {
    const el = document.getElementById('loading-overlay');
    show ? el.classList.remove('hidden') : el.classList.add('hidden');
}
function generateTemplate() {
    const headers = ["SIGLA","GRUPO","ASIGNATURA","NIVEL","DOCENTE","DIA 1","INICIO DE DIA 1","FIN DE DIA 1","AULA DEL DIA 1","DIA 2","INICIO DE DIA 2","FIN DE DIA 2","AULA DEL DIA 2"];
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla");
    XLSX.writeFile(wb, "Plantilla_Planificador.xlsx");
}

// --- NUEVA LÓGICA DE EXPORTACIÓN ROBUSTA (FULL CLONE) ---
async function getCalendarCanvas() {
    toggleLoading(true);
    
    // 1. Clonar el contenedor PRINCIPAL (calendar-area) completo
    // Esto asegura que la cabecera (calendar-header) y el cuerpo (schedule-scroll) mantengan su relación
    const originalElement = document.getElementById('calendar-area');
    const clone = originalElement.cloneNode(true);
    
    // 2. Configurar el clon para ser "invisible" pero renderizable y expandido
    clone.style.position = 'fixed';
    clone.style.top = '0';
    clone.style.left = '0';
    clone.style.width = '1600px'; // Ancho fijo HD para evitar scroll horizontal
    clone.style.height = 'auto';  // Altura automática
    clone.style.zIndex = '-9999'; // Detrás de todo
    clone.style.overflow = 'visible'; // Importante: dejar ver todo el contenido
    clone.style.visibility = 'visible'; // html2canvas necesita que sea visible
    
    // 3. Modificar el contenedor de scroll interno del clon para que muestre todo
    const scrollArea = clone.querySelector('#schedule-scroll');
    if(scrollArea) {
        scrollArea.style.overflow = 'visible';
        scrollArea.style.height = 'auto';
        scrollArea.style.maxHeight = 'none';
    }

    // 4. Asegurarnos que el contenedor de la grilla interna también se expanda
    const gridContainer = clone.querySelector('#grid-container');
    if(gridContainer) {
        gridContainer.style.height = 'auto';
    }
    
    document.body.appendChild(clone);
    
    // Pequeña pausa para asegurar que el navegador renderice el clon
    await new Promise(resolve => requestAnimationFrame(resolve));

    try {
        // 5. Capturar con html2canvas
        const canvas = await html2canvas(clone, {
            backgroundColor: "#111827",
            scale: 2, // Calidad x2 (Retina like)
            useCORS: true,
            logging: false,
            width: 1600, // Forzar ancho de captura
            windowWidth: 1600
        });
        
        document.body.removeChild(clone);
        toggleLoading(false);
        return canvas;
    } catch (e) {
        if(document.body.contains(clone)) document.body.removeChild(clone);
        toggleLoading(false);
        alert("Error al generar imagen: " + e.message);
        throw e;
    }
}

async function exportAsImage() {
    try {
        const canvas = await getCalendarCanvas();
        const link = document.createElement('a');
        link.download = 'mi_horario_completo.png';
        link.href = canvas.toDataURL();
        link.click();
    } catch(e) { console.error(e); }
}

async function exportAsPDF() {
    try {
        const canvas = await getCalendarCanvas();
        const imgData = canvas.toDataURL('image/png');
        
        // Conversión a PDF manteniendo la relación de aspecto exacta (Poster PDF)
        const pxToMm = 0.264583;
        const imgWidthMm = canvas.width * pxToMm;
        const imgHeightMm = canvas.height * pxToMm;

        const pdf = new window.jspdf.jsPDF({
            orientation: imgWidthMm > imgHeightMm ? 'l' : 'p',
            unit: 'mm',
            format: [imgWidthMm, imgHeightMm]
        });

        pdf.addImage(imgData, 'PNG', 0, 0, imgWidthMm, imgHeightMm);
        pdf.save('mi_horario_completo.pdf');
    } catch(e) { console.error(e); }
}