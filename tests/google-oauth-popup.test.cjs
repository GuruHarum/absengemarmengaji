'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/google-oauth-popup.js'), 'utf8');

function createEnvironment({
    blocked = false,
    actualUserId = 'user-1',
    ignoreWrongOrigin = true,
    coopSevered = false
} = {}) {
    const listeners = new Set();
    const channelRegistry = new Map();
    let popup = null;
    let launchCalls = 0;

    class FakeBroadcastChannel {
        constructor(name) {
            this.name = name;
            this.closed = false;
            this.listeners = new Set();
            if (!channelRegistry.has(name)) channelRegistry.set(name, new Set());
            channelRegistry.get(name).add(this);
        }
        addEventListener(type, listener) {
            if (type === 'message') this.listeners.add(listener);
        }
        removeEventListener(type, listener) {
            if (type === 'message') this.listeners.delete(listener);
        }
        postMessage(data) {
            for (const receiver of [...(channelRegistry.get(this.name) || [])]) {
                if (receiver === this || receiver.closed) continue;
                queueMicrotask(() => {
                    if (receiver.closed) return;
                    for (const listener of [...receiver.listeners]) listener({ data });
                });
            }
        }
        close() {
            this.closed = true;
            channelRegistry.get(this.name)?.delete(this);
        }
    }

    const windowObject = {
        location: { origin: 'https://school.test' },
        screen: { availWidth: 1280, availHeight: 800 },
        crypto: { getRandomValues(bytes) { bytes.forEach((_, index) => { bytes[index] = index + 1; }); return bytes; } },
        BroadcastChannel: FakeBroadcastChannel,
        setTimeout,
        clearTimeout,
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
                        const callback = new URL(popup.redirectTo);
                        const payload = {
                            type: 'GM_GOOGLE_OAUTH_RESULT',
                            mode: callback.searchParams.get('mode'),
                            nonce: callback.searchParams.get('nonce'),
                            ok: true,
                            userId: actualUserId,
                            role: 'guru'
                        };

                        if (coopSevered) {
                            // Browsers may report the WindowProxy as closed after a COOP
                            // browsing-context switch even though the popup is still running.
                            popup.closed = true;
                            const sender = new FakeBroadcastChannel(`gm_google_oauth_${payload.nonce}`);
                            sender.postMessage(payload);
                            sender.close();
                            return;
                        }

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

test('returns to the main window through BroadcastChannel when COOP severs the popup reference', async () => {
    const env = createEnvironment({ coopSevered: true });
    const flow = env.api.prepare({ mode: 'login' });
    const result = await flow.start(redirectTo => env.launch(redirectTo));
    assert.equal(result.userId, 'user-1');
    assert.equal(result.role, 'guru');
    assert.equal(env.popup.closed, true, 'the popup reference may report closed after COOP');
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
