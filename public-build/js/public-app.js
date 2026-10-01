let teachersData = [];
let studentsData = [];
let attendanceData = [];
let selectedTeacher = null;
let selectedClass = null;
let selectedStudentStatus = {};
let classesData = new Map();
let classNamesByNumber = new Map();
let attendanceIndex = new Map();
const page1 = document.getElementById('page1');
const page2 = document.getElementById('page2');
const teacherGrid = document.getElementById('teacherGrid');
const classModal = document.getElementById('classModal');
const notification = document.getElementById('notification');
const thankYouModal = document.getElementById('thankYouModal');
const classOptions = document.getElementById('classOptions');
const loadingIndicator = document.getElementById('loadingIndicator');
const publicLoaderStartedAt = Number(window.GM_INITIAL_LOADER_STARTED_AT || performance.now());
const PUBLIC_LOADER_MIN_MS = 5000;
window.GM_INITIAL_LOADER_ACTIVE = true;
window.applySchoolProfile = function (profile) {
    if (!profile)
        return;
    const name = profile.name || 'Gemar Mengaji';
    const logo = (!profile.logo_url || String(profile.logo_url).includes('FjF61ou.png')) ? 'assets/school-logo.png' : profile.logo_url;
    const nameElement = document.getElementById('schoolName');
    const addressElement = document.getElementById('schoolAddress');
    const logoElement = document.getElementById('schoolLogo');
    const loaderName = document.getElementById('loaderSchoolName');
    if (nameElement)
        nameElement.textContent = name;
    if (addressElement)
        addressElement.textContent = profile.address || '';
    if (logoElement)
        logoElement.src = logo;
    const loaderLogo = document.getElementById('loaderSchoolLogo');
    if (loaderLogo && loaderLogo.getAttribute('src') !== logo) {
        loaderLogo.hidden = false;
        loaderLogo.parentElement.hidden = false;
        loaderLogo.src = logo;
    }
    if (loaderName)
        loaderName.textContent = name;
    document.documentElement.style.setProperty('--brand-color', resolveThemeColor(profile.theme_color));
};
function hideIslamicLoader() {
    const finish = () => {
        // Siapkan halaman di belakang loader terlebih dahulu.
        // Ini mencegah jeda putih ketika loader ditutup sebelum browser
        // sempat mengecat header/main/index.
        document.body.classList.add('page-ready');
        loadingIndicator?.classList.remove('hidden');

        requestAnimationFrame(() => requestAnimationFrame(() => {
            // Beri sedikit waktu agar transisi konten sudah mulai saat
            // loader mulai fade-out sehingga perpindahan terasa menyatu.
            setTimeout(() => {
                window.GM_INITIAL_LOADER_ACTIVE = false;
                loadingIndicator?.classList.add('is-hidden');
                window.setTimeout(() => loadingIndicator?.classList.add('hidden'), 700);
            }, 180);
        }));
    };
    const wait = window.GMIslamicQuotes
        ? GMIslamicQuotes.remainingMinimum(publicLoaderStartedAt, PUBLIC_LOADER_MIN_MS)
        : Math.max(0, PUBLIC_LOADER_MIN_MS - (performance.now() - publicLoaderStartedAt));
    if (wait > 0) setTimeout(finish, wait);
    else finish();
}
async function initApp() {
    try {
        applySchoolProfile(await getSchoolProfile());
        if (await getMaintenanceMode()) {
            window.location.replace('maintenance.html');
            return;
        }
        await Promise.all([fetchTeachers(), fetchStudents(), fetchAttendanceData({ date: formatDateForStorage() })]);
    }
    catch (error) {
        console.error('Error initializing app:', error);
        showNotification('error', 'Terjadi kesalahan saat memuat aplikasi. Silakan refresh halaman.');
    }
    finally {
        hideIslamicLoader();
    }
}
window.handleMaintenanceRealtime = async function () {
    try { if (await getMaintenanceMode()) window.location.replace('maintenance.html'); }
    catch (error) { console.warn('Status maintenance belum dapat dikonfirmasi:', error); }
};
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    panelAuthClient.auth.getSession().then(({ data }) => {
        const link = document.getElementById('loginBtn');
        if (data.session && link) {
            link.href = 'admin.html';
            link.textContent = 'Panel Saya';
        }
    }).catch(console.error);
    document.getElementById('closeClassModal')?.addEventListener('click', closeClassModal);
    document.getElementById('backToHome')?.addEventListener('click', () => showPage(1));
    window.addEventListener('click', event => { if (event.target === classModal)
        closeClassModal(); });
});
