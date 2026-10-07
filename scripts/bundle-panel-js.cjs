'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');

function bundlePanelJs(out) {
    // Read the loader's declared groups rather than maintaining a second feature list.
    let loader = fs.readFileSync(path.join(out, 'js/panel-modules.js'), 'utf8');
    const definitions = vm.runInNewContext('(' + loader.match(/const definitions = (\{[\s\S]*?\n    \});/)[1] + ')');
    const core = vm.runInNewContext(loader.match(/const core = (\[[^;]+\]);/)[1]);
    const assets = {};
    for (const [name, files] of [['core', core], ...Object.entries(definitions).filter(([, value]) => value.files).map(([name, value]) => [name, value.files])]) {
        // Enrollment is role-specific; keep it separate from the shared manage bundle.
        const shared = files.filter(file => file !== 'enrollment');
        if (!shared.length) { assets[name] = []; continue; }
        const content = shared.map(file => fs.readFileSync(path.join(out, 'js', file + '.js'), 'utf8')).join('\n;\n');
        new vm.Script(content, { filename: name + '.js' });
        const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
        const target = `panel-${hash}.js`;
        fs.writeFileSync(path.join(out, 'js', target), content);
        assets[name] = ['js/' + target];
    }
    loader = 'window.GM_PANEL_ASSETS = ' + JSON.stringify(assets) + ';\n' + loader;
    loader = loader.replace('const sources = window.GM_PANEL_ASSETS?.[name]', "const built = window.GM_PANEL_ASSETS?.[name];\n            const sources = (built && name === 'manage' && role !== 'teacher' ? [...built, ...files(['enrollment'])] : built)");
    fs.writeFileSync(path.join(out, 'js/panel-modules.js'), loader);
    return assets;
}
module.exports = { bundlePanelJs };
