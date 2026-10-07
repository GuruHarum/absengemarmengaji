// Share only active reads; settled data is never silently reused after a write.
window.GMDataRequests = (() => {
    const pending = new Map();
    function read(key, work) {
        const profile = window.AppAccess?.profile || {};
        const scope = JSON.stringify([profile.userId || '', profile.role || 'public', profile.teacher_id || '']);
        const scopedKey = scope + ':' + key;
        if (pending.has(scopedKey)) return pending.get(scopedKey);
        const promise = Promise.resolve().then(work);
        pending.set(scopedKey, promise);
        const clear = () => { if (pending.get(scopedKey) === promise) pending.delete(scopedKey); };
        promise.then(clear, clear);
        return promise;
    }
    return { read, invalidate() { pending.clear(); } };
})();
