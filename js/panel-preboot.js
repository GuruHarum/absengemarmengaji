window.GMPanelPreboot = (() => {
  const standalone = () => window.matchMedia?.('(display-mode: standalone)')?.matches || navigator.standalone === true;
  const currentTail = () => `${location.search || ''}${location.hash || ''}`;
  const storageKey = () => `gm_push_first_login_v53:${String(AppAccess.profile?.userId || AppAccess.profile?.email || 'guru')}`;

  function setLoaderPending(pending) {
    document.body?.classList.toggle('gm-preboot-pending', Boolean(pending));
    const loader = document.getElementById('loadingIndicator');
    if (loader) loader.setAttribute('aria-hidden', pending ? 'true' : 'false');
  }

  function route(expected) {
    const role = AppAccess.profile?.role;
    if (expected === 'coordinator' && role === 'guru') {
      location.replace(`guru.html${currentTail()}`);
      return false;
    }
    if (expected === 'teacher' && role !== 'guru') {
      location.replace(`admin.html${currentTail()}`);
      return false;
    }
    return true;
  }

  function markSeen() {
    try { localStorage.setItem(storageKey(), '1'); } catch (_) {}
  }
  function wasSeen() {
    try { return localStorage.getItem(storageKey()) === '1'; } catch (_) { return false; }
  }
  const pushSupported = () => Boolean(window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);

  function onboardingDialog() {
    const overlay = document.createElement('div');
    overlay.id = 'gmNotificationOnboarding';
    overlay.className = 'gm-notification-onboarding';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'gmNotificationOnboardingTitle');
    overlay.innerHTML = `
      <div class="gm-notification-onboarding-card">
        <div class="gm-notification-onboarding-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/></svg>
        </div>
        <p class="gm-notification-kicker">GEMAR MENGAJI</p>
        <h1 id="gmNotificationOnboardingTitle">Aktifkan notifikasi?</h1>
        <p id="gmNotificationOnboardingCopy">Terima pengingat nilai dan informasi penting langsung di perangkat ini. Izin hanya diminta satu kali pada login pertama dari aplikasi yang sudah terpasang.</p>
        <div class="gm-notification-onboarding-actions">
          <button type="button" data-push-later class="secondary-action">Nanti</button>
          <button type="button" data-push-enable class="primary-action">Aktifkan Notifikasi</button>
        </div>
        <p class="gm-notification-onboarding-status" data-push-status aria-live="polite"></p>
      </div>`;
    document.body.appendChild(overlay);
    return overlay;
  }

  async function maybeAskTeacherPush() {
    if (AppAccess.profile?.role !== 'guru' || !standalone() || wasSeen()) return;
    if (!pushSupported()) { markSeen(); return; }
    if (Notification.permission === 'granted') {
      markSeen();
      window.GM_PUSH_BOOT_PERMISSION = 'granted';
      window.GM_PUSH_BOOT_QUIET = true;
      return;
    }
    if (Notification.permission === 'denied') { markSeen(); return; }

    document.documentElement.style.visibility = 'visible';
    setLoaderPending(true);
    const dialog = onboardingDialog();
    const enable = dialog.querySelector('[data-push-enable]');
    const later = dialog.querySelector('[data-push-later]');
    const status = dialog.querySelector('[data-push-status]');

    await new Promise(resolve => {
      const done = () => {
        markSeen();
        dialog.classList.add('is-leaving');
        setTimeout(() => { dialog.remove(); resolve(); }, 180);
      };
      later.addEventListener('click', done, { once: true });
      enable.addEventListener('click', async () => {
        enable.disabled = true;
        later.disabled = true;
        enable.textContent = 'Meminta izin...';
        try {
          const permission = await Notification.requestPermission();
          if (permission === 'granted') {
            window.GM_PUSH_BOOT_PERMISSION = 'granted';
            window.GM_PUSH_BOOT_QUIET = true;
            status.textContent = 'Izin diberikan. Menyiapkan notifikasi perangkat...';
          } else if (permission === 'denied') {
            status.textContent = 'Notifikasi diblokir. Anda dapat mengubahnya nanti dari pengaturan perangkat.';
          } else {
            status.textContent = 'Izin belum diberikan. Pengaturan tetap tersedia di Profil.';
          }
        } catch (_) {
          status.textContent = 'Izin belum dapat diminta. Pengaturan tetap tersedia di Profil.';
        }
        setTimeout(done, 520);
      }, { once: true });
      requestAnimationFrame(() => enable.focus({ preventScroll: true }));
    });
  }

  async function prepare(expected) {
    await AppAccess.ready;
    if (!route(expected)) return false;
    await maybeAskTeacherPush();
    setLoaderPending(false);
    document.documentElement.style.visibility = 'visible';
    return true;
  }

  return { prepare, standalone };
})();
