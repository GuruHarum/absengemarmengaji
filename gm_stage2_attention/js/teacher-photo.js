window.TeacherPhoto = (() => {
    const BUCKET = 'teachers';
    const MAX_BYTES = 2 * 1024 * 1024;
    const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    const isTahsin = teacher => teacher?.attendance_enabled !== false;
    function validate(file) {
        if (!file)
            throw new Error('Pilih foto guru terlebih dahulu.');
        if (!Object.hasOwn(extensions, file.type))
            throw new Error('Foto harus berupa JPG, PNG atau WebP.');
        if (!Number.isFinite(file.size) || file.size < 1 || file.size > MAX_BYTES) {
            throw new Error('Ukuran foto maksimal 2 MB.');
        }
        return extensions[file.type];
    }
    function ownedPath(teacher, path) {
        return Boolean(path && String(path).startsWith(`portraits/${teacher.id}/`));
    }
    async function save(teacher, file) {
        if (!teacher?.id || !isTahsin(teacher))
            throw new Error('Foto hanya dapat diunggah untuk guru Tahsin.');
        const ext = validate(file);
        const path = `portraits/${teacher.id}/${crypto.randomUUID()}.${ext}`;
        const bucket = supabase.storage.from(BUCKET);
        const { error: uploadError } = await bucket.upload(path, file, {
            cacheControl: '3600', upsert: false, contentType: file.type
        });
        if (uploadError)
            throw uploadError;
        const publicUrl = bucket.getPublicUrl(path).data?.publicUrl;
        if (!publicUrl) {
            await bucket.remove([path]);
            throw new Error('Alamat foto tidak dapat dibuat. Periksa pengaturan Supabase Storage.');
        }
        const { data, error } = await supabase.from('teachers')
            .update({ foto: publicUrl, foto_storage_path: path })
            .eq('id', teacher.id).select('*').single();
        if (error || !data) {
            await bucket.remove([path]);
            throw error || new Error('Foto guru tidak dapat disimpan.');
        }
        if (ownedPath(teacher, teacher.foto_storage_path) && teacher.foto_storage_path !== path) {
            try {
                await bucket.remove([teacher.foto_storage_path]);
            }
            catch (cleanupError) {
                console.warn('Foto lama perlu dibersihkan secara manual.', cleanupError);
            }
        }
        return data;
    }
    async function remove(teacher) {
        if (!teacher?.id || !isTahsin(teacher))
            throw new Error('Foto hanya dapat diubah untuk guru Tahsin.');
        const { data, error } = await supabase.from('teachers')
            .update({ foto: null, foto_storage_path: null })
            .eq('id', teacher.id).select('*').single();
        if (error || !data)
            throw error || new Error('Foto guru tidak dapat dihapus.');
        if (ownedPath(teacher, teacher.foto_storage_path)) {
            try {
                await supabase.storage.from(BUCKET).remove([teacher.foto_storage_path]);
            }
            catch (cleanupError) {
                console.warn('Foto lama perlu dibersihkan secara manual.', cleanupError);
            }
        }
        return data;
    }
    return { validate, isTahsin, save, remove, MAX_BYTES };
})();
