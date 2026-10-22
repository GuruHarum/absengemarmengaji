(function () {
  "use strict";
  // Pusat Guru hanya membaca data. Seluruh operasi penugasan tetap dijalankan
  // oleh halaman Kelola Tahsin/Tahfidz dan RPC lama.
  const root = document.getElementById("page-pusat-guru");
  if (!root) return;
  const el = id => document.getElementById(id);
  const safe = value => escapeHtml(String(value == null ? "" : value));
  const schoolYear = () => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jakarta", year: "numeric", month: "numeric"
    }).formatToParts(new Date());
    const year = Number(parts.find(x => x.type === "year").value);
    const month = Number(parts.find(x => x.type === "month").value);
    return year - (month < 7 ? 1 : 0);
  };
  const state = {
    ready: false, busy: false, tab: "teachers", page: 1, perPage: 20,
    teachers: [], students: [], groups: [], studentLinks: new Map(),
    teacherLinks: new Map(), year: schoolYear()
  };
  const sorted = (a, b) => String(a).localeCompare(String(b), "id", {numeric: true, sensitivity: "base"});
  const fullName = teacher => String(teacher?.nama_lengkap || teacher?.nama || "Guru tidak ditemukan");
  const subjectLabel = subject => subject === "tahsin" ? "Tahsin" : "Tahfidz";

  function notify(message, error) {
    const target = el("tcFeedback");
    if (!target) return;
    target.textContent = message || "";
    target.dataset.error = String(Boolean(error));
  }

  function collect() {
    state.studentLinks = new Map();
    state.teacherLinks = new Map(state.teachers.map(t => [String(t.id), {
      tahsin: new Set(), tahfidz: new Set(), groups: {tahsin: 0, tahfidz: 0}
    }]));
    const groupById = new Map(state.groups.map(g => [String(g.id), g]));
    for (const group of state.groups) {
      const teacher = state.teacherLinks.get(String(group.teacher_id));
      if (teacher) teacher.groups[group.subject] += 1;
    }
    for (const member of state.members) {
      const group = groupById.get(String(member.assignment_id));
      if (!group || member.subject !== group.subject) continue;
      const key = String(member.student_id);
      let record = state.studentLinks.get(key);
      if (!record) {
        record = {tahsin: null, tahfidz: null};
        state.studentLinks.set(key, record);
      }
      record[group.subject] = group;
      const teacher = state.teacherLinks.get(String(group.teacher_id));
      if (teacher) teacher[group.subject].add(key);
    }
  }

  async function load() {
    if (state.busy || !AppAccess.full()) return;
    state.busy = true;
    el("tcRefresh").disabled = true;
    notify("Memuat hubungan guru dan siswa...");
    const year = Number(el("tcYear").value);
    if (!Number.isInteger(year) || year < 2000 || year > 2200) {
      notify("Tahun ajaran tidak valid.", true);
      state.busy = false;
      el("tcRefresh").disabled = false;
      return;
    }
    try {
      const [teachers, students, groups, members] = await Promise.all([
        getTeachers(), getStudents(),
        fetchAllRows(() => supabase.from("teaching_assignments")
          .select("id,teacher_id,subject,class_name,academic_year_start,active")
          .eq("academic_year_start", year).eq("active", true)),
        fetchAllRows(() => supabase.from("assessment_group_members")
          .select("assignment_id,student_id,subject,academic_year_start,active")
          .eq("academic_year_start", year).eq("active", true))
      ]);
      state.teachers = teachers;
      state.students = students;
      state.groups = groups.filter(g => g.subject === "tahsin" || g.subject === "tahfidz");
      state.members = members;
      state.year = year;
      state.ready = true;
      state.page = 1;
      collect();
      const classes = [...new Set(students.map(s => s.kelas).filter(Boolean))].sort(sorted);
      const previous = el("tcClass").value;
      el("tcClass").replaceChildren(new Option("Semua kelas", ""));
      classes.forEach(name => el("tcClass").add(new Option(name, name)));
      if (classes.includes(previous)) el("tcClass").value = previous;
      render();
      notify("");
    } catch (error) {
      notify("Pusat Guru belum berhasil memuat data: " + error.message + ". Tidak ada data yang diubah.", true);
    } finally {
      state.busy = false;
      el("tcRefresh").disabled = false;
    }
  }

  function renderSummary() {
    const assigned = state.students.reduce((counts, s) => {
      const rec = state.studentLinks.get(String(s.id)) || {};
      if (!rec.tahsin) counts.tahsin++;
      if (!rec.tahfidz) counts.tahfidz++;
      if (!rec.tahsin || !rec.tahfidz) counts.incomplete++;
      return counts;
    }, {tahsin: 0, tahfidz: 0, incomplete: 0});
    el("tcTotalTeachers").textContent = String(state.teachers.length);
    el("tcTotalStudents").textContent = String(state.students.length);
    el("tcTotalGroups").textContent = String(state.groups.length);
    el("tcIncomplete").textContent = String(assigned.incomplete);
    el("tcMissingExplanation").textContent = assigned.tahsin + " belum terdaftar di kelompok Tahsin; " +
      assigned.tahfidz + " belum terdaftar di kelompok Tahfidz pada tahun ajaran " + state.year + "/" + (state.year + 1) + ".";
  }

  function matchesStatus(complete, any) {
    const value = el("tcStatus").value;
    return !value || (value === "complete" && complete) ||
      (value === "incomplete" && !complete) || (value === "none" && !any);
  }
  function renderTeachers() {
    const term = el("tcSearch").value.trim().toLocaleLowerCase("id");
    const subject = el("tcProgram").value;
    const cls = el("tcClass").value;
    const students = new Map(state.students.map(s => [String(s.id), s]));
    const rows = state.teachers.filter(teacher => {
      const link = state.teacherLinks.get(String(teacher.id)) || {tahsin:new Set(),tahfidz:new Set()};
      const ids = subject ? [...link[subject]] : [...new Set([...link.tahsin, ...link.tahfidz])];
      const complete = subject ? link[subject].size > 0 : link.tahsin.size > 0 && link.tahfidz.size > 0;
      if (!matchesStatus(complete, ids.length > 0)) return false;
      if (cls && !ids.some(id => students.get(id)?.kelas === cls)) return false;
      return !term || (fullName(teacher) + " " + (teacher.nama || "")).toLocaleLowerCase("id").includes(term);
    }).sort((a, b) => sorted(fullName(a), fullName(b)));
    return {
      rows,
      toHtml: teacher => {
        const link = state.teacherLinks.get(String(teacher.id)) || {tahsin:new Set(),tahfidz:new Set(),groups:{tahsin:0,tahfidz:0}};
        return '<article class="tc-teacher-card">' +
          '<div class="tc-teacher-info"><strong>' + safe(fullName(teacher)) + '</strong>' +
          '<small>' + safe(teacher.attendance_enabled === false ? "Khusus Tahfidz" : "Guru Tahsin / Tahfidz") + '</small></div>' +
          '<div class="tc-teacher-count"><span><b>' + link.tahsin.size + '</b> Tahsin</span>' +
          '<span><b>' + link.tahfidz.size + '</b> Tahfidz</span></div>' +
          '<div class="tc-teacher-actions">' +
          (teacher.attendance_enabled !== false ? '<button type="button" class="secondary-action" data-tc-go="tahsin" data-tc-teacher="' + safe(teacher.id) + '">Kelola Tahsin</button>' : '') +
          '<button type="button" class="secondary-action" data-tc-go="tahfidz" data-tc-teacher="' + safe(teacher.id) + '">Kelola Tahfidz</button></div></article>';
      }
    };
  }

  function renderStudents() {
    const term = el("tcSearch").value.trim().toLocaleLowerCase("id");
    const cls = el("tcClass").value;
    const subject = el("tcProgram").value;
    const teacherNames = new Map(state.teachers.map(t => [String(t.id), fullName(t)]));
    const rows = state.students.filter(student => {
      const rec = state.studentLinks.get(String(student.id)) || {};
      const all = Boolean(rec.tahsin && rec.tahfidz);
      const any = Boolean(rec.tahsin || rec.tahfidz);
      if (!matchesStatus(subject ? Boolean(rec[subject]) : all, subject ? Boolean(rec[subject]) : any)) return false;
      if (cls && student.kelas !== cls) return false;
      const teachers = [rec.tahsin, rec.tahfidz].filter(Boolean).map(g => teacherNames.get(String(g.teacher_id)) || "").join(" ");
      return !term || (String(student["nama siswa"] || "") + " " + String(student.kelas || "") + " " + teachers).toLocaleLowerCase("id").includes(term);
    }).sort((a,b) => sorted(a.kelas, b.kelas) || sorted(a["nama siswa"], b["nama siswa"]));
    return {
      rows,
      toHtml: student => {
        const rec = state.studentLinks.get(String(student.id)) || {};
        const label = (group, subject) => group
          ? '<span>' + safe(teacherNames.get(String(group.teacher_id)) || "Guru tidak ditemukan") + '</span>'
          : '<span class="tc-unassigned">Belum ditempatkan</span>';
        return '<article class="tc-student-card"><div class="tc-student-info"><strong>' +
          safe(student["nama siswa"]) + '</strong><small>' + safe(student.kelas || "-") + '</small></div>' +
          '<div class="tc-student-program"><small>Tahsin</small>' + label(rec.tahsin) + '</div>' +
          '<div class="tc-student-program"><small>Tahfidz</small>' + label(rec.tahfidz) + '</div>' +
          '<div class="tc-student-actions"><button type="button" class="secondary-action" data-tc-go="tahsin">Atur Tahsin</button>' +
          '<button type="button" class="secondary-action" data-tc-go="tahfidz">Atur Tahfidz</button></div></article>';
      }
    };
  }

  function render() {
    if (!state.ready) return;
    renderSummary();
    const guide = state.tab === "transfer";
    el("tcFilters").hidden = guide;
    el("tcPager").hidden = guide;
    el("tcTransferGuide").hidden = !guide;
    el("tcResults").hidden = guide;
    root.querySelectorAll("[data-tc-tab]").forEach(button => {
      const current = button.dataset.tcTab === state.tab;
      button.classList.toggle("active", current);
      button.setAttribute("aria-pressed", String(current));
    });
    if (guide) return;
    const view = state.tab === "teachers" ? renderTeachers() : renderStudents();
    const pageCount = Math.max(1, Math.ceil(view.rows.length / state.perPage));
    state.page = Math.min(Math.max(1, state.page), pageCount);
    const start = (state.page - 1) * state.perPage;
    el("tcResults").innerHTML = view.rows.slice(start, start + state.perPage).map(view.toHtml).join("") ||
      '<div class="tc-empty"><strong>Belum ada hasil</strong><span>Ubah pencarian atau filter untuk melihat data lain.</span></div>';
    el("tcResultCount").textContent = view.rows.length + " " + (state.tab === "teachers" ? "guru" : "siswa") + " ditemukan";
    el("tcPageInfo").textContent = "Halaman " + state.page + " / " + pageCount;
    el("tcPrev").disabled = state.page <= 1;
    el("tcNext").disabled = state.page >= pageCount;
  }

  async function go(subject, teacherId) {
    if (state.busy || !AppAccess.full()) return;
    try {
      if (teacherId) {
        await GMPanel.load("groups");
        LearningGroups.requestTeacher(subject, String(teacherId));
      }
      await switchPage(subject === "tahsin" ? "kelompok-tahsin" : "kelompok");
    } catch (error) {
      notify("Menu Kelola " + subjectLabel(subject) + " gagal dibuka: " + error.message, true);
    }
  }

  root.addEventListener("click", event => {
    const tab = event.target.closest("[data-tc-tab]");
    if (tab) {
      state.tab = tab.dataset.tcTab;
      state.page = 1;
      render();
      return;
    }
    const goButton = event.target.closest("[data-tc-go]");
    if (goButton) return void go(goButton.dataset.tcGo, goButton.dataset.tcTeacher || "");
    if (event.target.closest("#tcPrev")) { state.page--; render(); }
    if (event.target.closest("#tcNext")) { state.page++; render(); }
    if (event.target.closest("#tcRefresh")) void load();
  });
  root.addEventListener("input", event => {
    if (["tcSearch", "tcYear"].includes(event.target.id)) {
      if (event.target.id === "tcYear") return;
      state.page = 1; render();
    }
  });
  root.addEventListener("change", event => {
    if (event.target.id === "tcYear") return void load();
    if (["tcClass", "tcProgram", "tcStatus"].includes(event.target.id)) {
      state.page = 1; render();
    }
  });
  window.TeacherCenter = {open: load};
})();
