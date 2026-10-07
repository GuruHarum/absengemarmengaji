window.GMUX = (() => {
    const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));

    function skeletonLine(width = '100%') {
        return `<span class="gm-skeleton-line" style="--gm-skeleton-width:${esc(width)}"></span>`;
    }
    function skeletonList(count = 4, options = {}) {
        const compact = options.compact ? ' gm-skeleton-list--compact' : '';
        return `<div class="gm-skeleton-list${compact}" aria-hidden="true">${Array.from({length: count}, (_,i) => `<div class="gm-skeleton-row"><span class="gm-skeleton-dot"></span><div>${skeletonLine(i % 2 ? '58%' : '72%')}${skeletonLine(i % 2 ? '38%' : '46%')}</div></div>`).join('')}</div>`;
    }
    function skeletonCards(count = 3, options = {}) {
        const form = options.form ? ' gm-skeleton-cards--form' : '';
        return `<div class="gm-skeleton-cards${form}" aria-hidden="true">${Array.from({length: count}, (_,i) => `<div class="gm-skeleton-card">${skeletonLine(i % 2 ? '42%' : '55%')}${skeletonLine('88%')}${skeletonLine('66%')}</div>`).join('')}</div>`;
    }
    function skeletonTable(columns = 5, rows = 4) {
        return `<div class="gm-skeleton-table" aria-hidden="true"><div class="gm-skeleton-table-head">${Array.from({length:columns},()=>skeletonLine('74%')).join('')}</div>${Array.from({length:rows},()=>`<div class="gm-skeleton-table-row">${Array.from({length:columns},(_,i)=>skeletonLine(i ? '62%' : '82%')).join('')}</div>`).join('')}</div>`;
    }
    function empty(title, detail = '', options = {}) {
        return `<div class="gm-empty-state gm-empty-rich${options.compact ? ' gm-empty-state--compact' : ''}"><span class="gm-empty-icon" aria-hidden="true">${options.icon || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path stroke-linecap="round" stroke-linejoin="round" d="M5 7h14M7 7V5h10v2m1 0-.7 12H6.7L6 7m4 4v4m4-4v4"/></svg>'}</span><strong>${esc(title)}</strong>${detail ? `<span>${esc(detail)}</span>` : ''}</div>`;
    }

    const excluded = table => Boolean(table.closest('#reportPreview,.report-preview,.report-sheet,.report-document,.pdf-preview,[data-no-table-enhance]'));
    function enhanceTable(table) {
        if (!(table instanceof HTMLTableElement) || table.dataset.gmTableEnhanced || excluded(table)) return;
        const headers = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim()).filter(Boolean);
        if (!headers.length) return;
        table.dataset.gmTableEnhanced = '1';
        table.classList.add('gm-enhanced-table');
        const scroll = table.dataset.tableLayout === 'scroll' || headers.length > 5;
        table.classList.remove('gm-table-card-mode', 'gm-table-scroll-mode');
        table.classList.add(scroll ? 'gm-table-scroll-mode' : 'gm-table-card-mode');
        table.querySelectorAll('tbody tr').forEach(row => {
            [...row.children].forEach((cell, index) => {
                if (cell.tagName === 'TD' && !cell.hasAttribute('colspan')) cell.dataset.label = headers[index] || '';
            });
        });
        const parent = table.parentElement;
        if (parent && table.classList.contains('gm-table-scroll-mode')) parent.classList.add('gm-table-scroll-shell');
    }
    function enhanceTables(root = document) {
        root.querySelectorAll?.('table').forEach(enhanceTable);
    }
    function observeTables() {
        enhanceTables(document);
        const pendingTables = new Set();
        let scheduled = false;
        const schedule = table => {
            if (!table) return;
            pendingTables.add(table);
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(() => {
                scheduled = false;
                for (const item of pendingTables) {
                    item.dataset.gmTableEnhanced = '';
                    enhanceTable(item);
                }
                pendingTables.clear();
            });
        };
        const observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (!(node instanceof Element)) continue;
                    if (node.matches?.('table')) schedule(node);
                    node.querySelectorAll?.('table').forEach(schedule);
                }
                if (mutation.type === 'childList' && mutation.target instanceof HTMLTableSectionElement) {
                    const table = mutation.target.closest('table');
                    schedule(table);
                }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function init() {
        if (document.body?.classList.contains('admin-page')) observeTables();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
    else init();

    return { skeletonList, skeletonCards, skeletonTable, empty, enhanceTables };
})();
