(() => {
    // Original reflections, not quotations attributed to scripture or scholars.
    const quotes = [
        ['SABAR', 'Sabar bukan berhenti melangkah, melainkan menjaga hati tetap dekat kepada Allah saat jalan terasa panjang.'],
        ['SYUKUR', 'Sebelum meminta hari yang lebih indah, luangkan waktu untuk mensyukuri kebaikan yang sudah Allah hadirkan.'],
        ['ILMU', 'Satu huruf yang dipelajari dengan sungguh-sungguh adalah langkah kecil menuju hati yang lebih terang.'],
        ['NIAT', 'Luruskan niat sebelum memulai. Pekerjaan sederhana pun dapat menjadi jalan untuk berbuat baik.'],
        ['DOA', 'Saat kata-kata terasa habis, tetaplah berdoa. Allah mengetahui apa yang tersimpan di dalam hati.'],
        ['KEBAIKAN', 'Jangan menunggu mampu melakukan hal besar untuk mulai menebar kebaikan. Mulailah dari orang di dekatmu.'],
        ['TAWAKAL', 'Kerjakan bagianmu dengan sungguh-sungguh, lalu serahkan hasilnya kepada Allah dengan hati yang lapang.'],
        ['AL-QURAN', 'Sediakan waktu untuk membaca Al-Quran, meski sebentar. Rawat kedekatan itu dari hari ke hari.'],
        ['ADAB', 'Ilmu memperluas pengetahuan, adab menuntun cara kita menggunakannya untuk kebaikan.'],
        ['ISTIQAMAH', 'Langkah kecil yang terus dijaga dapat membawa kita lebih jauh daripada semangat besar yang segera padam.'],
        ['KASIH SAYANG', 'Bimbinglah dengan lembut. Hati yang merasa dihargai akan lebih mudah menerima pelajaran.'],
        ['WAKTU', 'Di antara kesibukan, sisihkan jeda untuk mengingat Allah dan menata kembali niat.'],
        ['RENDAH HATI', 'Semakin banyak belajar, semakin kita menyadari luasnya ilmu yang belum kita ketahui.'],
        ['HARAPAN', 'Ketika hari ini terasa berat, jangan putus berdoa dan berikhtiar. Masih ada kebaikan yang dapat kita mulai.'],
        ['MEMAAFKAN', 'Belajar memaafkan adalah bagian dari merawat hati, tanpa melupakan pelajaran dari perjalanan.'],
        ['BERBAGI', 'Bagikan ilmu dengan sabar dan tulus. Semoga yang kita ajarkan menjadi manfaat bagi sesama.']
    ];
    const carousel = document.getElementById('quoteCarousel');
    const slide = document.getElementById('quoteSlide');
    const pause = document.getElementById('quotePause');
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
        document.getElementById('quoteTopic').textContent = quotes[index][0];
        document.getElementById('quoteText').textContent = quotes[index][1];
        document.getElementById('quoteCounter').textContent = `${String(index + 1).padStart(2, '0')} / ${quotes.length}`;
        if (!reduced.matches && slide.animate) slide.animate([{ opacity: 0, transform: 'translateX(18px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: 450, easing: 'ease-out' });
    }
    document.getElementById('quotePrev').addEventListener('click', () => { show(index - 1); schedule(); });
    document.getElementById('quoteNext').addEventListener('click', () => { show(index + 1); schedule(); });
    pause.addEventListener('click', () => { paused = !paused; schedule(); });
    carousel.addEventListener('mouseenter', () => { hovered = true; schedule(); });
    carousel.addEventListener('mouseleave', () => { hovered = false; schedule(); });
    carousel.addEventListener('focusin', schedule);
    carousel.addEventListener('focusout', () => setTimeout(schedule, 0));
    document.addEventListener('visibilitychange', schedule);
    reduced.addEventListener('change', () => { paused = reduced.matches; schedule(); });
    show(0);
    schedule();
})();
