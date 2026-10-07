window.ReportExcel = (() => {
    const enc = new TextEncoder();
    const xml = value => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const mmToPt = mm => mm * 72 / 25.4;
    const coord = value => Math.round(value * 1000) / 1000;
    function column(index) {
        let name = '';
        for (++index; index; index = Math.floor((index - 1) / 26)) name = String.fromCharCode(65 + (index - 1) % 26) + name;
        return name;
    }
    const address = (x, y) => column(x) + (y + 1);
    const namespace = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const relationships = 'http://schemas.openxmlformats.org/package/2006/relationships';
    const documentRels = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

    async function build(rows, { onProgress = () => {} } = {}) {
        // Reuse the Word geometry and fitted text, so report content and coordinates have one owner.
        const layout = await ReportZip.layout(rows, (n, total, row) => onProgress(n, total, row));
        const files = [], fonts = [], fontIds = new Map(), borders = [], borderIds = new Map(), styles = [], styleIds = new Map();
        const addXml = (name, content) => files.push({ name, bytes: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + content) });
        function intern(list, ids, key, value) { if (!ids.has(key)) { ids.set(key, list.length); list.push(value); } return ids.get(key); }
        function style(cell, sides = '') {
            const size = Math.round(mmToPt(cell.rendered?.size || cell.size || 2.88) * 2) / 2;
            const font = intern(fonts, fontIds, `${size}|${!!cell.bold}`, `<font>${cell.bold ? '<b/>' : ''}<sz val="${size}"/><color rgb="FF111111"/><name val="Arial"/><family val="2"/></font>`);
            const border = intern(borders, borderIds, sides, '<border>' + ['left', 'right', 'top', 'bottom'].map((side, i) => sides.includes(String(i)) ? `<${side} style="thin"><color rgb="FF161616"/></${side}>` : `<${side}/>`).join('') + '<diagonal/></border>');
            const align = cell.align || 'left';
            const numFmt = typeof cell.text === 'string' && /^0\d+$/.test(cell.text) ? 49 : 0;
            return intern(styles, styleIds, `${font}|${border}|${align}|${numFmt}`, `<xf numFmtId="${numFmt}" fontId="${font}" fillId="0" borderId="${border}" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${align}" vertical="center" wrapText="1"/></xf>`);
        }
        // Column widths are measured against the workbook's Normal font (Arial 10, MDW 7).
        // Report cells retain their individually fitted font sizes.
        style({size: 10 * 25.4 / 72});
        const sheets = [], names = new Set(), contentTypes = [], printAreas = [];
        for (let sheetIndex = 0; sheetIndex < layout.pages.length; sheetIndex++) {
            const page = layout.pages[sheetIndex], number = sheetIndex + 1;
            let name = `${page.student.name || 'Siswa'}`.replace(/[\[\]:*?/\\\u0000-\u001f]/g, ' ')
                .replace(/\s+/g, ' ').trim().replace(/^'+|'+$/g, '').trim().slice(0, 31).replace(/'+$/g, '') || 'Siswa';
            if (name.toLowerCase() === 'history') name = 'Siswa History';
            const base = name;
            for (let suffix = 2; names.has(name.toLocaleLowerCase('id')); suffix++) name = base.slice(0, 31 - String(suffix).length - 1) + ' ' + suffix;
            names.add(name.toLocaleLowerCase('id'));
            sheets.push(`<sheet name="${xml(name)}" sheetId="${number}" r:id="sheet${number}"/>`);
            const xs = new Set([0, 210]), ys = new Set([0, 297]);
            for (const table of page.tables) {
                xs.add(coord(table.x)); xs.add(coord(table.x + table.width)); ys.add(coord(table.y));
                let y = table.y;
                for (const row of table.rows) {
                    let x = table.x;
                    for (const cell of row.cells) { xs.add(coord(x)); x += cell.width; xs.add(coord(x)); }
                    y += row.height; ys.add(coord(y));
                }
            }
            const xPositions = [...xs].sort((a, b) => a - b), yPositions = [...ys].sort((a, b) => a - b);
            const xIndex = new Map(xPositions.map((x, i) => [x, i])), yIndex = new Map(yPositions.map((y, i) => [y, i]));
            const cells = new Map(), merges = [], occupied = new Set(), drawings = [];
            function put(x, y, value, cell, sides) {
                const key = address(x, y), previous = cells.get(key);
                const mergedSides = [...new Set((previous?.sides || '') + sides)].sort().join('');
                cells.set(key, { x, y, value: value === undefined ? previous?.value : value, cell, sides: mergedSides, style: style(cell, mergedSides) });
            }
            for (const table of page.tables) {
                let y = table.y;
                const tableBottom = coord(table.y + table.rows.reduce((sum, row) => sum + row.height, 0));
                for (let r = 0; r < table.rows.length; r++) {
                    const row = table.rows[r]; let x = table.x;
                    for (const cell of row.cells) {
                        if (cell.merge === 'continue') { x += cell.width; continue; }
                        let height = row.height;
                        if (cell.merge === 'restart') {
                            for (let j = r + 1; j < table.rows.length; j++) {
                                let nextX = table.x;
                                const next = table.rows[j].cells.find(candidate => { const found = coord(nextX) === coord(x) && candidate.width === cell.width; nextX += candidate.width; return found; });
                                if (next?.merge !== 'continue') break;
                                height += table.rows[j].height;
                            }
                        }
                        if (cell.image) {
                            drawings.push({ name: cell.image, x: table.x + (table.width - 25) / 2, y, width: 25, height: 25 });
                            x += cell.width; continue;
                        }
                        const left = xIndex.get(coord(x)), right = xIndex.get(coord(x + cell.width)) - 1;
                        const top = yIndex.get(coord(y)), bottom = yIndex.get(coord(y + height)) - 1;
                        const value = cell.xml ? '' : typeof cell.text === 'number' && Number.isFinite(cell.text) ? cell.text : cell.rendered?.lines.join('\n') ?? '';
                        for (let cy = top; cy <= bottom; cy++) for (let cx = left; cx <= right; cx++) {
                            const key = address(cx, cy);
                            if (occupied.has(key)) throw Error('Tata letak rapor Excel bertumpuk: ' + key);
                            occupied.add(key);
                            let sides = '';
                            if (table.border) {
                                if (!table.rule && cx === left && (table.inside || coord(x) === coord(table.x))) sides += '0';
                                if (!table.rule && cx === right && (table.inside || coord(x + cell.width) === coord(table.x + table.width))) sides += '1';
                                if (!table.rule && cy === top && (table.inside || coord(y) === coord(table.y))) sides += '2';
                                if (cy === bottom && (table.rule || table.inside || coord(y + height) === tableBottom)) sides += '3';
                            }
                            put(cx, cy, cx === left && cy === top ? value : undefined, cell, sides);
                        }
                        if (right > left || bottom > top) merges.push(`<mergeCell ref="${address(left, top)}:${address(right, bottom)}"/>`);
                        x += cell.width;
                    }
                    y += row.height;
                }
            }
            const end = address(xPositions.length - 2, yPositions.length - 2);
            printAreas.push(`<definedName name="_xlnm.Print_Area" localSheetId="${sheetIndex}">'${xml(name.replace(/'/g, "''"))}'!$A$1:$${column(xPositions.length - 2)}$${yPositions.length - 1}</definedName>`);
            const columns = xPositions.slice(0, -1).map((x, i) => {
                const pixels = (xPositions[i + 1] - x) * 96 / 25.4;
                const width = Math.round(pixels / 7 * 256) / 256;
                return `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`;
            }).join('');
            const byRow = new Map();
            for (const cell of cells.values()) { const list = byRow.get(cell.y) || []; list.push(cell); byRow.set(cell.y, list); }
            const sheetData = yPositions.slice(0, -1).map((y, index) => {
                const entries = (byRow.get(index) || []).sort((a, b) => a.x - b.x).map(cell => {
                    const ref = address(cell.x, cell.y), attrs = `r="${ref}" s="${cell.style}"`;
                    if (cell.value === undefined || cell.value === '') return `<c ${attrs}/>`;
                    if (typeof cell.value === 'number') return `<c ${attrs}><v>${cell.value}</v></c>`;
                    return `<c ${attrs} t="inlineStr"><is><t xml:space="preserve">${xml(cell.value)}</t></is></c>`;
                }).join('');
                return `<row r="${index + 1}" ht="${mmToPt(yPositions[index + 1] - y).toFixed(4)}" customHeight="1">${entries}</row>`;
            }).join('');
            addXml(`xl/worksheets/sheet${number}.xml`, `<worksheet xmlns="${namespace}" xmlns:r="${documentRels}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${end}"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${columns}</cols><sheetData>${sheetData}</sheetData><mergeCells count="${merges.length}">${merges.join('')}</mergeCells><printOptions gridLines="0" gridLinesSet="1"/><pageMargins left="0" right="0" top="0" bottom="0" header="0" footer="0"/><pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="1"/>${drawings.length ? '<drawing r:id="drawing"/>' : ''}</worksheet>`);
            contentTypes.push(`<Override PartName="/xl/worksheets/sheet${number}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
            if (drawings.length) {
                addXml(`xl/worksheets/_rels/sheet${number}.xml.rels`, `<Relationships xmlns="${relationships}"><Relationship Id="drawing" Type="${documentRels}/drawing" Target="../drawings/drawing${number}.xml"/></Relationships>`);
                const anchors = drawings.map((image, i) => {
                    const col = Math.max(0, xPositions.findIndex(x => x > image.x) - 1);
                    const row = Math.max(0, yPositions.findIndex(y => y > image.y) - 1);
                    return `<xdr:oneCellAnchor><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>${Math.round((image.x - xPositions[col]) * 36000)}</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>${Math.round((image.y - yPositions[row]) * 36000)}</xdr:rowOff></xdr:from><xdr:ext cx="${Math.round(image.width * 36000)}" cy="${Math.round(image.height * 36000)}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${i + 1}" name="Logo sekolah"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="image${i + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${Math.round(image.width * 36000)}" cy="${Math.round(image.height * 36000)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
                }).join('');
                addXml(`xl/drawings/drawing${number}.xml`, `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${documentRels}">${anchors}</xdr:wsDr>`);
                addXml(`xl/drawings/_rels/drawing${number}.xml.rels`, `<Relationships xmlns="${relationships}">${drawings.map((image, i) => `<Relationship Id="image${i + 1}" Type="${documentRels}/image" Target="../media/${xml(image.name)}"/>`).join('')}</Relationships>`);
                contentTypes.push(`<Override PartName="/xl/drawings/drawing${number}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
            }
            await new Promise(resolve => setTimeout(resolve, 0));
        }
        for (const image of layout.images) files.push({ name: 'xl/media/' + image.name, bytes: image.bytes });
        addXml('xl/styles.xml', `<styleSheet xmlns="${namespace}"><fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="${borders.length}">${borders.join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${styles.length}">${styles.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
        addXml('xl/workbook.xml', `<workbook xmlns="${namespace}" xmlns:r="${documentRels}"><bookViews><workbookView/></bookViews><sheets>${sheets.join('')}</sheets><definedNames>${printAreas.join('')}</definedNames></workbook>`);
        addXml('xl/_rels/workbook.xml.rels', `<Relationships xmlns="${relationships}">${layout.pages.map((_, i) => `<Relationship Id="sheet${i + 1}" Type="${documentRels}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="styles" Type="${documentRels}/styles" Target="styles.xml"/></Relationships>`);
        addXml('_rels/.rels', `<Relationships xmlns="${relationships}"><Relationship Id="workbook" Type="${documentRels}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
        addXml('[Content_Types].xml', `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${contentTypes.join('')}</Types>`);
        return ReportZip.pack(files, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }
    return { build };
})();
