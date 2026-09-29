(() => {
    const fallback = [{ text: 'Sesungguhnya bersama kesulitan ada kemudahan.', source: 'QS. Al-Insyirah: 5-6', type: 'Qur’an' }];
    const quotes = window.GMIslamicQuotes?.sequence?.('maintenance', window.GMIslamicQuotes.count) || fallback;
    const carousel = document.getElementById('quoteCarousel');
    const slide = document.getElementById('quoteSlide');
    const pause = document.getElementById('quotePause');
    if (!carousel || !slide || !pause) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let index = 0;
    let paused = reduced.matches;
    let hovered = false;
    let timer;
    function schedule() {
        clearInterval(timer);
        if (!paused && !hovered && !document.hidden && !carousel.contains(document.activeElement)) {
            timer = setInterval(() => show(index + 1), 9000);
        }
        pause.textContent = paused ? 'Putar otomatis' : 'Jeda';
        pause.setAttribute('aria-pressed', String(paused));
    }
    function show(next) {
        index = (next + quotes.length) % quotes.length;
        const quote = quotes[index];
        document.getElementById('quoteTopic').textContent = String(quote.type || 'Renungan').toUpperCase();
        document.getElementById('quoteText').textContent = quote.text;
        document.getElementById('quoteSource').textContent = quote.source;
        document.getElementById('quoteCounter').textContent = `${String(index + 1).padStart(2, '0')} / ${quotes.length}`;
        if (!reduced.matches && slide.animate)
            slide.animate([{ opacity: 0, transform: 'translateX(18px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: 450, easing: 'ease-out' });
    }
    document.getElementById('quotePrev').addEventListener('click', () => { show(index - 1); schedule(); });
    document.getElementById('quoteNext').addEventListener('click', () => { show(index + 1); schedule(); });
    pause.addEventListener('click', () => { paused = !paused; schedule(); });
    carousel.addEventListener('mouseenter', () => { hovered = true; schedule(); });
    carousel.addEventListener('mouseleave', () => { hovered = false; schedule(); });
    carousel.addEventListener('focusin', schedule);
    carousel.addEventListener('focusout', () => setTimeout(schedule, 0));
    document.addEventListener('visibilitychange', schedule);
    reduced.addEventListener?.('change', () => { paused = reduced.matches; schedule(); });
    show(0);
    schedule();
})();
