let allData = [];
let filteredData = [];
const rowsPerPage = 12;
let currentPage = 1;
let currentChart = null;

// Elements
const searchInput = document.getElementById('searchInput');
const batchFilter = document.getElementById('batchFilter');
const semesterFilter = document.getElementById('semesterFilter');
const collegeFilter = document.getElementById('collegeFilter');
const branchFilter = document.getElementById('branchFilter');
const sortFilter = document.getElementById('sortFilter');
const searchBtn = document.getElementById('searchBtn');
const resultsArea = document.getElementById('resultsArea');
const loading = document.getElementById('loading');
const errorMsg = document.getElementById('errorMsg');
const errorText = document.getElementById('errorText');
const totalRecords = document.getElementById('totalRecords');
const paginationNav = document.getElementById('paginationNav');
const paginationList = document.getElementById('paginationList');
const studentModal = new bootstrap.Modal(document.getElementById('studentModal'));
const themeToggleBtn = document.getElementById('themeToggle');

// Stats Elements
const statTotal = document.getElementById('statTotal');
const statPassRate = document.getElementById('statPassRate');
const statAvgSgpa = document.getElementById('statAvgSgpa');

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    loadCSVData();

    // Event listeners
    searchBtn.addEventListener('click', applyFilters);
    searchInput.addEventListener('keyup', (e) => {
        if(e.key === 'Enter') applyFilters();
    });
    batchFilter.addEventListener('change', applyFilters);
    semesterFilter.addEventListener('change', applyFilters);
    collegeFilter.addEventListener('change', applyFilters);
    branchFilter.addEventListener('change', applyFilters);
    sortFilter.addEventListener('change', applyFilters);
    themeToggleBtn.addEventListener('click', toggleTheme);
});

// Theme Logic
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);

    // Re-render chart if open to match theme
    if(currentChart && document.getElementById('studentModal').classList.contains('show')) {
        // Redraw chart with new theme colors
        const activeRegNo = document.getElementById('modalTitle').getAttribute('data-reg');
        if(activeRegNo) renderChartForStudent(activeRegNo);
    }
}

function updateThemeIcon(theme) {
    const icon = themeToggleBtn.querySelector('i');
    const span = themeToggleBtn.querySelector('span');
    if (theme === 'dark') {
        icon.className = 'fas fa-sun text-warning';
        span.textContent = 'Light Mode';
        themeToggleBtn.classList.replace('btn-outline-dark', 'btn-outline-light');
    } else {
        icon.className = 'fas fa-moon';
        span.textContent = 'Dark Mode';
        themeToggleBtn.classList.replace('btn-outline-light', 'btn-outline-dark');
    }
}

function loadCSVData() {
    loading.classList.remove('d-none');

Papa.parse('all_student_marks.csv', {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            let parsedData = results.data;

            // Clean SGPA data and group by regNo
            let groupedData = {};

            parsedData.forEach(row => {
                // Parse SGPA array if stringified JSON
                if (row.sgpa && row.sgpa.startsWith('[')) {
                    try {
                        row.sgpaArray = JSON.parse(row.sgpa);
                    } catch (e) {
                        row.sgpaArray = [];
                    }
                } else {
                    row.sgpaArray = [row.sgpa];
                }

                // Handle Even semester anomaly
                let isEvenSem = ["II", "IV", "VI", "VIII"].includes(row.semester);
                let currentSemScore = isEvenSem && row.cgpa ? parseFloat(row.cgpa) : parseFloat(row.sgpaArray[row.sgpaArray.length - 1] || row.sgpa);
                row.sgpaNum = isNaN(currentSemScore) ? 0 : currentSemScore;

                if (!groupedData[row.regNo]) {
                    groupedData[row.regNo] = {
                        regNo: row.regNo,
                        name: row.name,
                        college_name: row.college_name,
                        course: row.course,
                        Session: row.Session,
                        semesters: {}
                    };
                }

                // Store semester record
                groupedData[row.regNo].semesters[row.semester] = row;
            });

            // Convert to flat array of unique students (using their latest/highest semester data for display)
            allData = Object.values(groupedData).map(student => {
                // Find latest semester record
                const romanMap = { "I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8 };
                let latestSem = Object.keys(student.semesters).sort((a, b) => (romanMap[b] || 0) - (romanMap[a] || 0))[0];

                // Base student object is the latest semester
                let baseObj = student.semesters[latestSem];
                // Attach all semesters data to it
                baseObj.allSemesters = student.semesters;
                return baseObj;
            });

            totalRecords.textContent = allData.length;

            // Populate filters
            populateFilters();

            // Initial render
            filteredData = [...allData];
            updateStats();
            sortData();
            renderPage(1);

            loading.classList.add('d-none');
        },
        error: function(err) {
            loading.classList.add('d-none');
            showError("Could not load database file. Please ensure 'all_student_marks.csv' is present.");
        }
    });
}

function updateStats() {
    if(filteredData.length === 0) {
        statTotal.textContent = "0";
        statPassRate.textContent = "0%";
        statAvgSgpa.textContent = "0.00";
        return;
    }

    statTotal.textContent = filteredData.length.toLocaleString();

    let passCount = 0;
    let totalSgpa = 0;
    let sgpaCount = 0;

    filteredData.forEach(student => {
        if(student.fail_any === 'PASS') passCount++;

        const sgpa = parseFloat(student.sgpa);
        if(!isNaN(sgpa) && sgpa > 0) {
            totalSgpa += sgpa;
            sgpaCount++;
        }
    });

    const passRate = (passCount / filteredData.length) * 100;
    statPassRate.textContent = passRate.toFixed(1) + "%";

    const avgSgpa = sgpaCount > 0 ? (totalSgpa / sgpaCount) : 0;
    statAvgSgpa.textContent = avgSgpa.toFixed(2);
}

function populateFilters() {
    const batches = new Set();
    const semesters = new Set();
    const colleges = new Set();
    const branches = new Set();

    allData.forEach(row => {
        if(row.Session) batches.add(row.Session);
        if(row.semester) semesters.add(row.semester);
        if(row.college_name) colleges.add(row.college_name);
        if(row.course) branches.add(row.course);
    });

    Array.from(batches).sort().forEach(b => {
        const opt = document.createElement('option');
        opt.value = b; opt.textContent = b;
        batchFilter.appendChild(opt);
    });

    // Roman numeral sort helper
    const romanMap = { "I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8 };
    Array.from(semesters).sort((a, b) => (romanMap[a] || 99) - (romanMap[b] || 99)).forEach(s => {
        const opt = document.createElement('option');
        opt.value = s; opt.textContent = s;
        semesterFilter.appendChild(opt);
    });

    Array.from(colleges).sort().forEach(c => {
        const opt = document.createElement('option');
        opt.value = c; opt.textContent = c;
        collegeFilter.appendChild(opt);
    });

    Array.from(branches).sort().forEach(b => {
        const opt = document.createElement('option');
        opt.value = b; opt.textContent = b;
        branchFilter.appendChild(opt);
    });
}

function applyFilters() {
    const term = searchInput.value.toLowerCase().trim();
    const batch = batchFilter.value;
    const semester = semesterFilter.value;
    const college = collegeFilter.value;
    const branch = branchFilter.value;

    // Check if the search term looks like a registration number (e.g. 24110113031)
    // If it's a specific reg number, we ignore dropdown filters to show ALL their semesters.
    const isRegSearch = /^\d{10,}$/.test(term);

    filteredData = [];
    allData.forEach(row => {
        const matchSearch = term === '' ||
                            (row.regNo && row.regNo.toLowerCase().includes(term)) ||
                            (row.name && row.name.toLowerCase().includes(term));

        if (isRegSearch && term !== '') {
            if (matchSearch) filteredData.push(row);
            return;
        }

        const matchBatch = batch === '' || row.Session === batch;

        // Semester matching logic needs to check if the student has a record for that semester
        let hasSemesterMatch = semester === '' || !!row.allSemesters[semester];

        const matchCollege = college === '' || row.college_name === college;
        const matchBranch = branch === '' || row.course === branch;

        if (matchSearch && matchBatch && hasSemesterMatch && matchCollege && matchBranch) {
            // If they are filtering by semester, we should temporarily make that semester the active "row" to show
            if (semester !== '') {
                // Return a cloned object representing just that semester so the card displays the filtered info
                let filteredStudent = Object.assign({}, row.allSemesters[semester]);
                filteredStudent.allSemesters = row.allSemesters; // preserve reference to all semesters
                filteredData.push(filteredStudent);
            } else {
                filteredData.push(row); // push latest/highest
            }
        }
    });

    sortData();
    updateStats();
    currentPage = 1;
    renderPage(1);
}

function sortData() {
    const sortVal = sortFilter.value;

    filteredData.sort((a, b) => {
        if (sortVal === 'name_asc') {
            return (a.name || '').localeCompare(b.name || '');
        } else if (sortVal === 'sgpa_desc') {
            return b.sgpaNum - a.sgpaNum;
        } else if (sortVal === 'sgpa_asc') {
            return a.sgpaNum - b.sgpaNum;
        }
        return 0;
    });
}

function renderPage(page) {
    currentPage = page;
    resultsArea.innerHTML = '';

    if(filteredData.length === 0) {
        resultsArea.innerHTML = `<div class="col-12 text-center py-5 text-muted">
            <i class="fas fa-folder-open fa-4x mb-3 text-secondary opacity-50"></i>
            <h4>No records found</h4>
            <p>Try adjusting your search or filters.</p>
        </div>`;
        paginationNav.style.display = 'none';
        return;
    }

    const start = (page - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const paginatedItems = filteredData.slice(start, end);

    paginatedItems.forEach((student, index) => {
        const isPass = student.fail_any === 'PASS';
        const badgeClass = isPass ? 'pass-status' : 'fail-status';
        const statusText = isPass ? 'PASS' : 'FAIL';

        let totalScore = 0;
        Object.keys(student).forEach(key => {
            if(key.endsWith('_total') && student[key]) {
                totalScore += parseInt(student[key] || 0);
            }
        });

        // Staggered animation delay
        const delay = (index % 12) * 0.05;

        const card = document.createElement('div');
        card.className = 'col-lg-4 col-md-6 mb-4';
        card.style.animationDelay = `${delay}s`;
        card.innerHTML = `
            <div class="card h-100 student-card" onclick="showStudentDetails('${student.regNo}')">
                <span class="status-badge ${badgeClass} fw-bold"><i class="fas ${isPass ? 'fa-check-circle' : 'fa-times-circle'} me-1"></i>${statusText}</span>
                <div class="card-body p-4 d-flex flex-column">
                    <div class="d-flex align-items-center mb-4">
                        <div class="avatar-circle text-white rounded-circle d-flex align-items-center justify-content-center fw-bold me-3 shadow-sm flex-shrink-0">
                            ${student.name ? student.name.charAt(0) : '?'}
                        </div>
                        <div class="overflow-hidden">
                            <h5 class="card-title mb-1 fw-bold text-truncate" title="${student.name}">${student.name}</h5>
                            <small class="text-muted"><i class="fas fa-id-card me-1"></i>${student.regNo}</small>
                        </div>
                    </div>

                    <div class="small mb-4 text-muted flex-grow-1">
                        <div class="text-truncate mb-2" title="${student.course}"><i class="fas fa-book me-2 text-primary opacity-75"></i>${student.course}</div>
                        <div class="text-truncate" title="${student.college_name}"><i class="fas fa-university me-2 text-primary opacity-75"></i>${student.college_name}</div>
                    </div>

                    <div class="row g-0 pt-3 border-top mt-auto text-center">
                        <div class="col-6 border-end">
                            <span class="d-block small text-muted text-uppercase fw-bold mb-1" style="font-size: 0.7rem; letter-spacing: 0.5px;">SGPA</span>
                            <span class="fs-4 fw-bold ${student.sgpaNum >= 8 ? 'text-success' : 'text-primary'}">${student.sgpaNum.toFixed(2) || 'N/A'}</span>
                        </div>
                        <div class="col-6">
                            <span class="d-block small text-muted text-uppercase fw-bold mb-1" style="font-size: 0.7rem; letter-spacing: 0.5px;">Total Marks</span>
                            <span class="fs-4 fw-bold">${totalScore}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        resultsArea.appendChild(card);
    });

    renderPagination();
}

function renderPagination() {
    const totalPages = Math.ceil(filteredData.length / rowsPerPage);
    paginationList.innerHTML = '';

    if (totalPages <= 1) {
        paginationNav.style.display = 'none';
        return;
    }

    paginationNav.style.display = 'flex';

    const createBtn = (text, pageNum, disabled, active) => {
        const li = document.createElement('li');
        li.className = `page-item ${disabled ? 'disabled' : ''} ${active ? 'active' : ''}`;
        li.innerHTML = `<a class="page-link shadow-sm fw-bold" href="#" onclick="event.preventDefault(); if(!${disabled}) renderPage(${pageNum})">${text}</a>`;
        return li;
    };

    paginationList.appendChild(createBtn('<i class="fas fa-chevron-left"></i>', currentPage - 1, currentPage === 1, false));

    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    if(endPage - startPage < 4) startPage = Math.max(1, endPage - 4);

    if (startPage > 1) {
        paginationList.appendChild(createBtn('1', 1, false, false));
        if (startPage > 2) {
            const el = document.createElement('li');
            el.className = 'page-item disabled'; el.innerHTML = '<span class="page-link border-0 bg-transparent">...</span>';
            paginationList.appendChild(el);
        }
    }

    for(let i = startPage; i <= endPage; i++) {
        paginationList.appendChild(createBtn(i, i, false, currentPage === i));
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            const el = document.createElement('li');
            el.className = 'page-item disabled'; el.innerHTML = '<span class="page-link border-0 bg-transparent">...</span>';
            paginationList.appendChild(el);
        }
        paginationList.appendChild(createBtn(totalPages, totalPages, false, false));
    }

    paginationList.appendChild(createBtn('<i class="fas fa-chevron-right"></i>', currentPage + 1, currentPage === totalPages, false));
}

// Ensure the student details modal function is accessible globally
window.showStudentDetails = function(regNo, activeSemester = null) {
    const student = allData.find(s => s.regNo === regNo);
    if(!student) return;

    // Determine the semester to display
    const romanMap = { "I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8 };
    const availableSemesters = Object.keys(student.allSemesters).sort((a, b) => (romanMap[a] || 0) - (romanMap[b] || 0));

    if (!activeSemester || !student.allSemesters[activeSemester]) {
        activeSemester = availableSemesters[availableSemesters.length - 1]; // default to highest
    }

    const currentSemData = student.allSemesters[activeSemester];

    // Store active student for theme switching
    document.getElementById('modalTitle').setAttribute('data-reg', regNo);
    document.getElementById('modalTitle').textContent = `${student.name} - Official Record`;

    const isPass = currentSemData.fail_any === 'PASS';

    const subjects = [];
    const subjectNames = new Set();

    Object.keys(currentSemData).forEach(key => {
        if(key.endsWith('_code')) {
            const name = key.replace('_code', '');
            subjectNames.add(name);
        }
    });

    subjectNames.forEach(name => {
        if(currentSemData[`${name}_code`]) {
            subjects.push({
                name: name,
                code: currentSemData[`${name}_code`],
                ese: parseInt(currentSemData[`${name}_ese`]) || 0,
                ia: parseInt(currentSemData[`${name}_ia`]) || 0,
                total: parseInt(currentSemData[`${name}_total`]) || 0,
                grade: currentSemData[`${name}_grade`] || '-',
                credit: currentSemData[`${name}_credit`] || '-'
            });
        }
    });

    subjects.sort((a,b) => a.code.localeCompare(b.code));

    let subjectsHtml = '';
    let totalCredits = 0;
    let grandTotal = 0;

    subjects.forEach(sub => {
        let gClass = 'grade-P';
        if(sub.grade === 'O' || sub.grade === 'A+') gClass = 'grade-O';
        else if(sub.grade === 'A') gClass = 'grade-A';
        else if(sub.grade === 'B') gClass = 'grade-B';
        else if(sub.grade === 'C') gClass = 'grade-C';
        else if(sub.grade === 'D') gClass = 'grade-D';
        else if(sub.grade === 'F') gClass = 'grade-F';

        totalCredits += parseFloat(sub.credit) || 0;
        grandTotal += sub.total;

        subjectsHtml += `
            <tr>
                <td class="text-muted font-monospace small">${sub.code}</td>
                <td class="fw-bold">${sub.name}</td>
                <td class="text-center text-muted">${sub.credit}</td>
                <td class="text-center">${sub.ese || '-'}</td>
                <td class="text-center">${sub.ia || '-'}</td>
                <td class="text-center fw-bold text-primary">${sub.total || '-'}</td>
                <td class="text-center"><span class="grade-box ${gClass}">${sub.grade}</span></td>
            </tr>
        `;
    });

    let semesterTabsHtml = `<div class="d-flex flex-wrap gap-2 mb-4 justify-content-center">`;
    availableSemesters.forEach(sem => {
        const isCurrent = sem === activeSemester;
        semesterTabsHtml += `
            <button class="btn ${isCurrent ? 'btn-primary' : 'btn-outline-primary'} btn-sm rounded-pill px-3 shadow-sm fw-bold"
                    onclick="showStudentDetails('${regNo}', '${sem}')">
                Semester ${sem}
            </button>
        `;
    });
    semesterTabsHtml += `</div>`;

    const bodyHtml = `
        <div class="modal-header-info p-4 p-md-5">
            <div class="row align-items-center">
                <div class="col-md-7 mb-4 mb-md-0">
                    <div class="d-flex align-items-center mb-4">
                        <div class="avatar-circle text-white rounded d-flex align-items-center justify-content-center fw-bold me-4 shadow flex-shrink-0" style="width: 80px; height: 80px; font-size: 2rem;">
                            ${student.name.charAt(0)}
                        </div>
                        <div>
                            <h3 class="mb-1 fw-bold text-primary">${student.name}</h3>
                            <div class="text-muted fs-5"><i class="fas fa-id-card me-2"></i>${student.regNo}</div>
                        </div>
                    </div>
                    <table class="table table-sm table-borderless mb-0">
                        <tr><td class="text-muted w-25 pb-2"><i class="fas fa-user-tie me-2"></i>Father:</td><td class="fw-bold pb-2">${student.father_name}</td></tr>
                        <tr><td class="text-muted w-25 pb-2"><i class="fas fa-user me-2"></i>Mother:</td><td class="fw-bold pb-2">${student.mother_name}</td></tr>
                        <tr><td class="text-muted w-25 pb-2"><i class="fas fa-book-open me-2"></i>Course:</td><td class="fw-bold pb-2">${student.course}</td></tr>
                        <tr><td class="text-muted w-25 pb-2"><i class="fas fa-university me-2"></i>College:</td><td class="fw-bold pb-2">${student.college_name}</td></tr>
                    </table>
                </div>
                <div class="col-md-5">
                    <div class="card border-0 shadow-sm bg-white mb-3" style="border-radius: 15px;">
                        <div class="card-body p-4 text-center">
                            <span class="d-block text-muted text-uppercase fw-bold mb-2 small" style="letter-spacing: 1px;">Semester ${currentSemData.semester} (${currentSemData.exam_held})</span>
                            <div class="d-flex justify-content-center align-items-end gap-3 mb-3">
                                <div>
                                    <h1 class="display-3 fw-bold mb-0 ${currentSemData.sgpaNum >= 8 ? 'text-success' : 'text-primary'}">${currentSemData.sgpaNum.toFixed(2)}</h1>
                                    <span class="text-muted fw-bold small">SGPA</span>
                                </div>
                            </div>
                            <span class="badge ${isPass ? 'bg-success' : 'bg-danger'} px-4 py-2 fs-6 rounded-pill w-100 shadow-sm">
                                <i class="fas ${isPass ? 'fa-check-circle' : 'fa-times-circle'} me-1"></i> STATUS: ${isPass ? 'PASS' : 'FAIL'}
                            </span>
                        </div>
                    </div>
                    ${!isPass ? `<div class="alert alert-danger py-2 small fw-bold mb-0 shadow-sm text-center border-0"><i class="fas fa-exclamation-triangle me-2"></i> BACKLOG: ${currentSemData.fail_any.replace('FAIL:', '')}</div>` : ''}
                </div>
            </div>
        </div>

        <div class="p-4 p-md-5">
            ${semesterTabsHtml}
            <ul class="nav nav-tabs mb-4" id="myTab" role="tablist">
                <li class="nav-item" role="presentation">
                    <button class="nav-link active fw-bold" id="marks-tab" data-bs-toggle="tab" data-bs-target="#marks" type="button" role="tab"><i class="fas fa-list-alt me-2"></i>Detailed Marks</button>
                </li>
                <li class="nav-item" role="presentation">
                    <button class="nav-link fw-bold" id="chart-tab" data-bs-toggle="tab" data-bs-target="#chart" type="button" role="tab" onclick="renderChartForStudent('${student.regNo}')"><i class="fas fa-chart-line me-2"></i>Performance Chart</button>
                </li>
            </ul>

            <div class="tab-content" id="myTabContent">
                <div class="tab-pane fade show active" id="marks" role="tabpanel">
                    <div class="table-responsive bg-card rounded shadow-sm border">
                        <table class="table table-hover table-custom align-middle mb-0">
                            <thead>
                                <tr>
                                    <th width="12%">Code</th>
                                    <th width="35%">Subject Name</th>
                                    <th width="8%" class="text-center">Credit</th>
                                    <th width="10%" class="text-center">ESE <small>(External)</small></th>
                                    <th width="10%" class="text-center">IA <small>(Internal)</small></th>
                                    <th width="10%" class="text-center text-primary">Total</th>
                                    <th width="15%" class="text-center">Grade</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${subjectsHtml}
                            </tbody>
                            <tfoot class="bg-light">
                                <tr>
                                    <td colspan="2" class="text-end fw-bold text-muted text-uppercase">Grand Total:</td>
                                    <td class="text-center fw-bold">${totalCredits}</td>
                                    <td colspan="2"></td>
                                    <td class="text-center fw-bold fs-5 text-primary">${grandTotal}</td>
                                    <td></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

                <div class="tab-pane fade" id="chart" role="tabpanel">
                    <div class="chart-container rounded p-3 border shadow-sm" style="background: var(--bg-card)">
                        <canvas id="performanceChart"></canvas>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('modalBody').innerHTML = bodyHtml;
    // We only need to show the modal if it's not already open, but replacing innerHTML will break active tabs
    // If they were already on the chart tab, maybe we should switch back to marks tab or re-render chart.
    // For simplicity, just showing it works well.
    studentModal.show();
}

window.renderChartForStudent = function(regNo) {
    const student = allData.find(s => s.regNo === regNo);
    if(!student) return;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#e0e0e0' : '#666';
    const gridColor = isDark ? '#333' : '#e5e5e5';

    // Build progression data
    let labels = [];
    let sgpaData = [];

    const romanMap = { "I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8 };
    const revRomanMap = { 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI", 7: "VII", 8: "VIII" };

    // We can rely on sgpaArray which has historical data up to current semester length
    // But since they may have multiple semester rows, we can just use the highest semester's sgpaArray
    // Or we can construct it by going through 1 to max semester

    let maxSem = 1;
    if (student.sgpaArray) maxSem = Math.max(maxSem, student.sgpaArray.length);
    Object.keys(student.allSemesters).forEach(sem => {
        maxSem = Math.max(maxSem, romanMap[sem] || 1);
    });

    for(let i = 1; i <= maxSem; i++) {
        let semRoman = revRomanMap[i];
        labels.push(`Sem ${semRoman}`);

        let val = null;

        // Try to get from individual semester record if available
        if (student.allSemesters[semRoman]) {
            val = student.allSemesters[semRoman].sgpaNum;
        }

        // If not available as a direct record, see if it's in the sgpaArray of any record
        if (val === null || val === 0) {
            // Find the best array. The array at index i-1 is the sgpa.
            let arrayVal = null;
            Object.values(student.allSemesters).forEach(record => {
                 if (record.sgpaArray && record.sgpaArray.length >= i) {
                     let rawScore = parseFloat(record.sgpaArray[i-1]);
                     if (!isNaN(rawScore) && rawScore > 0) arrayVal = rawScore;
                 }
            });
            if (arrayVal !== null) {
                // If it's an even semester, and we don't have the explicit record, we can't easily get CGPA
                // But we will plot the arrayVal (which is SGPA) as a fallback
                val = arrayVal;
            }
        }

        sgpaData.push(val !== null ? val : 0);
    }

    const ctx = document.getElementById('performanceChart');
    if (!ctx) return;

    if (currentChart) {
        currentChart.destroy();
    }

    currentChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'SGPA / CGPA Progression',
                    data: sgpaData,
                    backgroundColor: 'rgba(78, 115, 223, 0.2)',
                    borderColor: 'rgb(78, 115, 223)',
                    borderWidth: 2,
                    pointBackgroundColor: 'rgb(78, 115, 223)',
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    fill: true,
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: textColor, font: { family: "'Segoe UI', sans-serif", weight: 'bold' } } },
                tooltip: {
                    mode: 'index', intersect: false
                }
            },
            scales: {
                x: {
                    ticks: { color: textColor, font: { weight: 'bold' } },
                    grid: { color: gridColor, display: false }
                },
                y: {
                    min: 0,
                    max: 10,
                    ticks: { color: textColor },
                    grid: { color: gridColor },
                    title: { display: true, text: 'Score', color: textColor, font: { weight: 'bold' } }
                }
            }
        }
    });
}

function showError(msg) {
    errorText.textContent = msg;
    errorMsg.classList.remove('d-none');
}
