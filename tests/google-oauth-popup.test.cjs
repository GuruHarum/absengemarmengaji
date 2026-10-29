'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/google-oauth-popup.js'), 'utf8');

function createEnvironment({ blocked = false, actualUserId = 'user-1', ignoreWrongOrigin = true } = {}) {
    const listeners = new Set();
    let popup = null;
    let launchCalls = 0;
    const windowObject = {
        location: { origin: 'https://school.test' },
        screen: { availWidth: 1280, availHeight: 800 },
        crypto: { getRandomValues(bytes) { bytes.forEach((_, index) => { bytes[index] = index + 1; }); return bytes; } },
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        addEventListener(name, listener) { if (name === 'message') listeners.add(listener); },
        removeEventListener(name, listener) { if (name === 'message') listeners.delete(listener); },
        open(url, name, features) {
            if (blocked) return null;
            popup = {
                closed: false,
                name,
                url,
                features,
                location: {
                    href: url,
                    replace(nextUrl) {
                        this.href = nextUrl;
                        const callback = new URL(nextUrl === 'https://provider.test/oauth'
                            ? popup.redirectTo
                            : popup.redirectTo);
                        const payload = {
                            type: 'GM_GOOGLE_OAUTH_RESULT',
                            mode: callback.searchParams.get('mode'),
                            nonce: callback.searchParams.get('nonce'),
                            ok: true,
                            userId: actualUserId,
                            role: 'guru'
                        };
                        queueMicrotask(() => {
                            if (ignoreWrongOrigin) {
                                for (const listener of [...listeners]) {
                                    listener({ origin: 'https://attacker.test', source: popup, data: payload });
                                }
                            }
                            for (const listener of [...listeners]) {
                                listener({ origin: 'https://school.test', source: popup, data: payload });
                            }
                        });
                    }
                },
                focus() {},
                close() { this.closed = true; }
            };
            return popup;
        }
    };
    const context = { window: windowObject, URL, Uint8Array, Date, Promise, Array, Error, String };
    vm.runInNewContext(source, context);
    return {
        api: windowObject.GMGoogleOAuthPopup,
        get popup() { return popup; },
        get launchCalls() { return launchCalls; },
        launch(redirectTo) {
            launchCalls++;
            if (popup) popup.redirectTo = redirectTo;
            return Promise.resolve({ data: { url: 'https://provider.test/oauth' }, error: null });
        }
    };
}

test('opens popup synchronously and accepts a valid same-origin callback result', async () => {
    const env = createEnvironment();
    const flow = env.api.prepare({ mode: 'login' });
    assert.ok(env.popup, 'the popup must open before the OAuth request awaits');
    const result = await flow.start(redirectTo => env.launch(redirectTo));
    assert.equal(env.launchCalls, 1);
    assert.equal(result.userId, 'user-1');
    assert.equal(result.role, 'guru');
    assert.equal(env.popup.closed, true, 'the opener closes the popup after receiving the result');
});

test('rejects a callback for a different user when replacing a linked Google identity', async () => {
    const env = createEnvironment({ actualUserId: 'someone-else' });
    const flow = env.api.prepare({ mode: 'link', expectedUserId: 'user-1' });
    await assert.rejects(
        flow.start(redirectTo => env.launch(redirectTo)),
        /Identitas akun berubah/
    );
    assert.equal(env.popup.closed, true);
});

test('reports a blocked popup before making an OAuth request', () => {
    const env = createEnvironment({ blocked: true });
    assert.throws(
        () => env.api.prepare({ mode: 'login' }),
        /Jendela Google diblokir/
    );
    assert.equal(env.launchCalls, 0);
});
