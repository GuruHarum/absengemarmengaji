// Public attendance entry point. Panel authentication is handled only in admin.html.
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

        window.applySchoolProfile = function(profile) {
            if (!profile) return;
            const name = profile.name || 'Gemar Mengaji';
            const logo = profile.logo_url || 'https://iili.io/FjF61ou.png';
            const nameElement = document.getElementById('schoolName');
            const addressElement = document.getElementById('schoolAddress');
            const logoElement = document.getElementById('schoolLogo');
            const loaderName = document.getElementById('loaderSchoolName');
            if (nameElement) nameElement.textContent = name;
            if (addressElement) addressElement.textContent = profile.address || '';
            if (logoElement) logoElement.src = logo;
            if (loaderName) loaderName.textContent = name;
            document.documentElement.style.setProperty('--brand-color', resolveThemeColor(profile.theme_color));
        };


function hideIslamicLoader() {
    requestAnimationFrame(() => requestAnimationFrame(() => {
        document.body.classList.add('page-ready');
        loadingIndicator?.classList.add('is-hidden');
    }));
}
async function initApp() {
    try {
        applySchoolProfile(await getSchoolProfile());
        if (await getMaintenanceMode()) {
            window.location.replace('maintenance.html');
            return;
        }
        await Promise.all([fetchTeachers(), fetchStudents(), fetchAttendanceData({ date: formatDateForStorage() })]);
    } catch (error) {
        console.error('Error initializing app:', error);
        showNotification('error', 'Terjadi kesalahan saat memuat aplikasi. Silakan refresh halaman.');
    } finally { hideIslamicLoader(); }
}
window.handleMaintenanceRealtime = function(enabled) {
    if (enabled) window.location.replace('maintenance.html');
};
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    // A panel session changes only the destination label, never public data access.
    panelAuthClient.auth.getSession().then(({ data }) => {
        const link = document.getElementById('loginBtn');
        if (data.session && link) { link.href = 'admin.html'; link.textContent = 'Panel Saya'; }
    }).catch(console.error);
    document.getElementById('closeClassModal')?.addEventListener('click', closeClassModal);
    document.getElementById('backToHome')?.addEventListener('click', () => showPage(1));
    window.addEventListener('click', event => { if (event.target === classModal) closeClassModal(); });
});
