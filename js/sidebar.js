(() => {
    const sidebar = document.getElementById('sidebar');
    const main = document.getElementById('adminMain');
    const trigger = document.getElementById('mobileMenuButton');
    const close = document.getElementById('toggleSidebar');
    const overlay = document.getElementById('mobileSidebarOverlay');
    const mobile = window.matchMedia('(max-width: 767px)');
    let collapsed = true;
    let opened = false;
    function render() {
        const drawerOpen = mobile.matches && opened;
        document.body.classList.toggle('drawer-open', drawerOpen);
        document.body.classList.toggle('sidebar-collapsed', !mobile.matches && collapsed);
        sidebar.inert = mobile.matches && !opened;
        main.inert = drawerOpen;
        sidebar.setAttribute('aria-hidden', String(sidebar.inert));
        trigger.setAttribute('aria-expanded', String(mobile.matches ? opened : !collapsed));
        trigger.setAttribute('aria-label', mobile.matches ? (opened ? 'Tutup navigasi' : 'Buka navigasi') : (collapsed ? 'Perluas navigasi' : 'Ciutkan navigasi'));
        overlay.setAttribute('aria-hidden', String(!drawerOpen));
    }
    window.setMobileDrawer = function (open) {
        const wasOpen = opened;
        opened = mobile.matches && Boolean(open);
        render();
        if (opened)
            close.focus();
        else if (wasOpen)
            trigger.focus();
    };
    trigger.addEventListener('click', () => {
        if (mobile.matches)
            window.setMobileDrawer(!opened);
        else {
            collapsed = !collapsed;
            render();
        }
    });
    close.addEventListener('click', () => window.setMobileDrawer(false));
    overlay.addEventListener('click', () => window.setMobileDrawer(false));
    sidebar.querySelectorAll('nav .admin-nav-item').forEach(item => item.addEventListener('click', () => {
        if (mobile.matches) window.setMobileDrawer(false);
        else {
            collapsed = true;
            render();
        }
    }));
    document.addEventListener('keydown', event => {
        if (!mobile.matches || !opened)
            return;
        if (event.key === 'Escape') {
            event.preventDefault();
            window.setMobileDrawer(false);
        }
        else if (event.key === 'Tab') {
            const controls = Array.from(sidebar.querySelectorAll('button:not([disabled]), a[href]'));
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            }
            else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    });
    mobile.addEventListener('change', () => {
        const focusWasInside = sidebar.contains(document.activeElement);
        opened = false;
        render();
        if (focusWasInside)
            trigger.focus();
    });
    render();
})();
