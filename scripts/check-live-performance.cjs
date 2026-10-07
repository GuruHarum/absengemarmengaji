'use strict';
const fs = require('node:fs');
const { request } = require('node:https');
const { brotliDecompressSync, gunzipSync } = require('node:zlib');
function get(url, headers) {
    return new Promise((resolve, reject) => {
        const req = request(url, { headers }, response => {
            const chunks = []; let length = 0;
            response.on('data', chunk => { length += chunk.length; if (length > 10 * 1024 * 1024) req.destroy(Error('Response too large')); else chunks.push(chunk); });
            response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, bytes: Buffer.concat(chunks) }));
        });
        req.setTimeout(30000, () => req.destroy(Error('Request timed out')));
        req.on('error', reject); req.end();
    });
}
async function main() {
    const site = new URL(process.argv[2] || 'https://gemarmengajisdit.netlify.app');
    if (site.protocol !== 'https:') throw Error('Use an HTTPS website URL');
    const checks = [];
    for (const [asset, accept] of [['/admin.html', 'br, gzip'], ['/css/theme.css', 'br, gzip'], ['/js/database.js', 'gzip']]) {
        const response = await get(new URL(asset, site), { 'Accept-Encoding': accept });
        const encoding = response.headers['content-encoding'];
        if (response.status !== 200 || !['br', 'gzip'].includes(encoding)) throw Error(`Compression check failed: ${asset} (${response.status}, ${encoding || 'identity'})`);
        const decoded = encoding === 'br' ? brotliDecompressSync(response.bytes) : gunzipSync(response.bytes);
        checks.push({ asset, encoding, transferredBytes: response.bytes.length, decodedBytes: decoded.length, vary: response.headers.vary || '' });
    }
    // Verify a read-only, date-filtered, one-page request using the same public key as the website.
    const config = fs.readFileSync('js/config.js', 'utf8');
    const base = config.match(/const SUPABASE_URL = "([^"]+)"/)[1];
    const key = config.match(/const SUPABASE_ANON_KEY = "([^"]+)"/)[1];
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const endpoint = new URL('/rest/v1/attendance', base);
    endpoint.search = new URLSearchParams({ select: 'id,date,teacher,class,student,status,note,student_id,class_id,teacher_id', date: 'eq.' + date, order: 'date.desc,id.desc', offset: '0', limit: '10' }).toString();
    const response = await get(endpoint, { apikey: key, Authorization: 'Bearer ' + key, Prefer: 'count=exact' });
    if (![200, 206].includes(response.status)) throw Error(`Attendance API read failed (${response.status})`);
    const rows = JSON.parse(response.bytes.toString());
    if (!Array.isArray(rows) || rows.length > 10 || !/\/\d+$/.test(response.headers['content-range'] || '')) throw Error('Attendance pagination/count check failed');
    const result = { site: site.origin, compression: checks, attendance: { date, receivedRows: rows.length, contentRange: response.headers['content-range'], readOnly: true } };
    fs.mkdirSync('outputs', { recursive: true });
    fs.writeFileSync('outputs/live-performance-check.json', JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { get };
