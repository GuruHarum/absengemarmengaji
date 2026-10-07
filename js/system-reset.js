window.SystemReset = (() => {
  const el = id => document.getElementById(id);
  let loaded = false, preview = null, busy = false;
  const fmt = value => Number(value || 0).toLocaleString('id-ID');
  const requiredText = 'HAPUS SEMUA DATA SISWA';

  function roleAllowed() { return AppAccess.profile?.role === 'koordinator'; }
  function renderCounts(data) {
    const counts = data?.counts || {};
    const items = [
      ['Siswa', counts.students], ['Absensi', counts.attendance], ['Nilai', counts.subject_assessments],
      ['Penilaian lama', counts.periodic_assessments], ['Rapor', counts.student_reports], ['Kelompok', counts.teaching_assignments],
      ['Anggota kelompok', counts.assessment_group_members], ['Identitas NIS/NISN', counts.student_identifiers]
    ];
    el('systemResetCounts').innerHTML = items.map(([label,value]) => `<div><span>${label}</span><strong>${fmt(value)}</strong></div>`).join('');
  }
  function syncButton() {
    const button = el('systemResetExecute');
    if (!button) return;
    button.disabled = busy || !preview || !el('systemResetBackup').checked || !el('systemResetUnderstand').checked || el('systemResetPhrase').value.trim() !== requiredText;
  }
  async function open(force = false) {
    if (!roleAllowed()) {
      el('settingsViewData')?.setAttribute('hidden','');
      return;
    }
    if ((loaded && !force) || busy) return;
    busy = true; syncButton();
    el('systemResetFeedback').textContent = 'Memeriksa data...';
    try {
      const {data,error} = await supabase.rpc('gm_student_data_reset_preview');
      if (error) throw error;
      preview = data; loaded = true; renderCounts(data);
      el('systemResetFeedback').textContent = 'Data siap diperiksa. Tombol reset hanya aktif setelah dua persetujuan dan frasa konfirmasi benar.';
    } catch(error) {
      preview = null;
      el('systemResetFeedback').textContent = 'Pratinjau reset gagal: ' + error.message;
    } finally { busy = false; syncButton(); }
  }
  async function execute() {
    if (!roleAllowed() || busy || !preview) return;
    if (!(await AdminNotice.confirm('Reset ini menghapus seluruh data siswa dan data operasional terkait dari database. Guru, akun, foto guru, konfigurasi sekolah, referensi, dan Arsip Rapor tidak dihapus. Lanjutkan?'))) return;
    if (el('systemResetPhrase').value.trim() !== requiredText) return;
    busy = true; syncButton(); el('systemResetFeedback').textContent = 'Menghapus data siswa... jangan tutup halaman.';
    try {
      const counts = preview.counts || {};
      const {data,error} = await supabase.rpc('gm_reset_all_student_data_verified', {
        p_expected_students: Number(counts.students || 0),
        p_expected_attendance: Number(counts.attendance || 0),
        p_expected_assessments: Number(counts.subject_assessments || 0),
        p_confirmation: requiredText
      });
      if (error) throw error;
      el('systemResetFeedback').textContent = `Reset selesai. ${fmt(data?.deleted_students)} siswa dan ${fmt(data?.deleted_attendance)} absensi dihapus.`;
      window.tahsinRosterStudents = [];
      window.attendanceData = [];
      preview = null; loaded = false;
      el('systemResetPhrase').value = '';
      el('systemResetBackup').checked = false;
      el('systemResetUnderstand').checked = false;
      renderCounts({counts:{}});
      AdminNotice.notify('Reset data siswa selesai. Guru, akun, pengaturan, dan Arsip Rapor tetap dipertahankan.', 'success');
    } catch(error) {
      el('systemResetFeedback').textContent = 'Reset dibatalkan: ' + error.message;
      AdminNotice.notify(error.message, 'error');
    } finally { busy = false; syncButton(); }
  }
  ((callback) => window.GMPanel ? GMPanel.onReady(callback) : document.addEventListener('panelready', callback))( () => {
    const nav = document.querySelector('[data-settings-view="data"]');
    if (nav) nav.hidden = !roleAllowed();
    ['systemResetBackup','systemResetUnderstand','systemResetPhrase'].forEach(id => el(id)?.addEventListener('input', syncButton));
    el('systemResetRefresh')?.addEventListener('click', () => open(true));
    el('systemResetExecute')?.addEventListener('click', execute);
  });
  return { open };
})();
