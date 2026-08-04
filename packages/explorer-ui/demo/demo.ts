import type { BridgeMessage, BridgeRequest, ObjectBridge, TreeNodeInput } from "../src/types";

const rootEntries: TreeNodeInput[] = [
  { name: "src", relativePath: "src", kind: "directory" },
  { name: "demo", relativePath: "demo", kind: "directory" },
  { name: "vendor-index", relativePath: "vendor-index", kind: "directory" },
  { name: ".git", relativePath: ".git", kind: "directory" },
  { name: ".env", relativePath: ".env", kind: "file" },
  { name: "coverage.json", relativePath: "coverage.json", kind: "file" },
  { name: "preview-image.png", relativePath: "preview-image.png", kind: "file" },
  { name: "preview-video.mp4", relativePath: "preview-video.mp4", kind: "file" },
  { name: "preview-document.pdf", relativePath: "preview-document.pdf", kind: "file" },
  { name: "preview-audio.wav", relativePath: "preview-audio.wav", kind: "file" },
  { name: "preview-document.docx", relativePath: "preview-document.docx", kind: "file" },
  { name: "preview-spreadsheet.xlsx", relativePath: "preview-spreadsheet.xlsx", kind: "file" },
  { name: "preview-presentation.pptx", relativePath: "preview-presentation.pptx", kind: "file" },
  { name: "package.json", relativePath: "package.json", kind: "file" },
  { name: "README.md", relativePath: "README.md", kind: "file" },
];

const directories = new Map<string, TreeNodeInput[]>([
  ["", rootEntries],
  [".git", [{ name: "config", relativePath: ".git/config", kind: "file" }]],
  [
    "src",
    [
      { name: "adapters", relativePath: "src/adapters", kind: "directory" },
      { name: "bridge.ts", relativePath: "src/bridge.ts", kind: "file" },
      { name: "explorer-element.ts", relativePath: "src/explorer-element.ts", kind: "file" },
      { name: ".cache", relativePath: "src/.cache", kind: "directory" },
      { name: "tree-model.ts", relativePath: "src/tree-model.ts", kind: "file" },
    ],
  ],
  ["src/adapters", [{ name: "codex-26.715.ts", relativePath: "src/adapters/codex-26.715.ts", kind: "file" }]],
  [
    "demo",
    [
      { name: "demo.ts", relativePath: "demo/demo.ts", kind: "file" },
      { name: "index.html", relativePath: "demo/index.html", kind: "file" },
    ],
  ],
  [
    "vendor-index",
    Array.from({ length: 1250 }, (_, index) => {
      const name = `entry-${String(index + 1).padStart(4, "0")}.d.ts`;
      return { name, relativePath: `vendor-index/${name}`, kind: "file" as const };
    }),
  ],
]);

const listeners = new Set<(message: BridgeMessage) => void>();
const previewText = new Map<string, string>([
  ["README.md", "# Code-Codex\n\nA project tree with bounded file preview and editing in Codex Desktop.\n"],
  ["package.json", '{\n  "name": "@code-codex/explorer-ui",\n  "private": true\n}\n'],
  ["src/explorer-element.ts", "export class CodeCodexElement extends HTMLElement {\n  // Local demo preview\n}\n"],
  ["src/bridge.ts", "export class ExplorerBridge extends EventTarget {}\n"],
  ["src/tree-model.ts", "export class TreeModel {\n  // Lazy, virtualized file tree model\n}\n"],
]);
const demoMedia = new Map<string, { readonly kind: "image" | "video" | "pdf" | "audio" | "office"; readonly mimeType: string; readonly bytes: Uint8Array }>([
  [
    "preview-image.png",
    {
      kind: "image",
      mimeType: "image/png",
      bytes: decodeBase64("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg=="),
    },
  ],
  [
    "preview-video.mp4",
    {
      kind: "video",
      mimeType: "video/mp4",
      bytes: decodeBase64("AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAAhtZGF0AAAA1m1vb3YAAABsbXZoZAAAAAAAAAAAAAAAAAAAA+gAAAAAAAEAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAABidWR0YQAAAFptZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAAC1pbHN0AAAAJal0b28AAAAdZGF0YQAAAAEAAAAATGF2ZjU3LjQxLjEwMA=="),
    },
  ],
  [
    "preview-document.pdf",
    { kind: "pdf", mimeType: "application/pdf", bytes: createDemoPdf() },
  ],
  [
    "preview-audio.wav",
    { kind: "audio", mimeType: "audio/wav", bytes: createDemoWave() },
  ],
  [
    "preview-document.docx",
    {
      kind: "office",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      bytes: createDemoDocx(),
    },
  ],
  [
    "preview-spreadsheet.xlsx",
    {
      kind: "office",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes: createDemoXlsx(),
    },
  ],
  [
    "preview-presentation.pptx",
    {
      kind: "office",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      bytes: createDemoPptx(),
    },
  ],
]);
const DEMO_MEDIA_VERSION = "d".repeat(64);
const DEMO_MEDIA_CHUNK_BYTES = 2 * 1024 * 1024;
let settings = { width: 270, collapsed: false, showHidden: true, showIgnored: true };
let watching = false;

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function createDemoPdf(): Uint8Array {
  const encoder = new TextEncoder();
  const content = "BT\n/F1 20 Tf\n72 720 Td\n(Code-Codex PDF Preview) Tj\nET\n";
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n",
    `4 0 obj\n<< /Length ${encoder.encode(content).byteLength} >>\nstream\n${content}endstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];
  let source = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const object of objects) {
    offsets.push(encoder.encode(source).byteLength);
    source += object;
  }
  const xrefOffset = encoder.encode(source).byteLength;
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) source += `${String(offset).padStart(10, "0")} 00000 n \n`;
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return encoder.encode(source);
}

function createDemoWave(): Uint8Array {
  const sampleRate = 8_000;
  const sampleCount = 2_000;
  const bytes = new Uint8Array(44 + sampleCount * 2);
  const view = new DataView(bytes.buffer);
  const writeAscii = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index);
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, bytes.byteLength - 8, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, sampleCount * 2, true);
  for (let index = 0; index < sampleCount; index += 1) {
    view.setInt16(44 + index * 2, Math.round(Math.sin((index * 2 * Math.PI * 440) / sampleRate) * 5_000), true);
  }
  return bytes;
}

function demoXml(...parts: string[]): string {
  return parts.join("");
}

function createDemoDocx(): Uint8Array {
  return createDemoZip([
    {
      path: "[Content_Types].xml",
      text: demoXml(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
        '<Default Extension="xml" ContentType="application/xml"/>',
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>',
        "</Types>",
      ),
    },
    {
      path: "_rels/.rels",
      text: demoXml(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>',
        "</Relationships>",
      ),
    },
    {
      path: "word/document.xml",
      text: demoXml(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
        "<w:body>",
        '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>Code-Codex Office Preview</w:t></w:r></w:p>',
        "<w:p><w:r><w:t>This DOCX file is generated entirely in memory for the local preview demo.</w:t></w:r></w:p>",
        '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>',
        "</w:body>",
        "</w:document>",
      ),
    },
    {
      path: "word/_rels/document.xml.rels",
      text: demoXml(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
        "</Relationships>",
      ),
    },
    {
      path: "word/styles.xml",
      text: demoXml(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
        "<w:docDefaults>",
        '<w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>',
        "<w:pPrDefault/>",
        "</w:docDefaults>",
        '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>',
        "</w:styles>",
      ),
    },
  ]);
}

function createDemoXlsx(): Uint8Array {
  return createDemoZip([
    {
      path: "[Content_Types].xml",
      text: demoXml(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
        '<Default Extension="xml" ContentType="application/xml"/>',
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
        "</Types>",
      ),
    },
    {
      path: "_rels/.rels",
      text: demoXml(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
        "</Relationships>",
      ),
    },
    {
      path: "xl/workbook.xml",
      text: demoXml(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
        '<bookViews><workbookView activeTab="0"/></bookViews>',
        '<sheets><sheet name="Preview" sheetId="1" r:id="rId1"/></sheets>',
        "</workbook>",
      ),
    },
    {
      path: "xl/_rels/workbook.xml.rels",
      text: demoXml(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>',
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
        "</Relationships>",
      ),
    },
    {
      path: "xl/worksheets/sheet1.xml",
      text: demoXml(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
        '<dimension ref="A1:B3"/>',
        '<sheetViews><sheetView workbookViewId="0"/></sheetViews>',
        '<sheetFormatPr defaultRowHeight="15"/>',
        "<sheetData>",
        '<row r="1"><c r="A1" t="inlineStr"><is><t>Code-Codex Office Preview</t></is></c><c r="B1"><v>40</v></c></row>',
        '<row r="2"><c r="A2" t="inlineStr"><is><t>Format</t></is></c><c r="B2" t="inlineStr"><is><t>XLSX</t></is></c></row>',
        '<row r="3"><c r="A3" t="inlineStr"><is><t>Rendering</t></is></c><c r="B3" t="inlineStr"><is><t>Offline</t></is></c></row>',
        "</sheetData>",
        "</worksheet>",
      ),
    },
    {
      path: "xl/styles.xml",
      text: demoXml(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
        '<fonts count="1"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>',
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>',
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>',
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
        '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>',
        "</styleSheet>",
      ),
    },
  ]);
}

function createDemoPptx(): Uint8Array {
  return createDemoZip([
    {
      path: "[Content_Types].xml",
      text: demoXml(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
        '<Default Extension="xml" ContentType="application/xml"/>',
        '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>',
        '<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>',
        '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>',
        '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>',
        '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>',
        "</Types>",
      ),
    },
    {
      path: "_rels/.rels",
      text: demoXml(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>',
        "</Relationships>",
      ),
    },
    {
      path: "ppt/presentation.xml",
      text: demoXml(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">',
        '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>',
        '<p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>',
        '<p:sldSz cx="12192000" cy="6858000" type="screen16x9"/>',
        '<p:notesSz cx="6858000" cy="9144000"/>',
        "</p:presentation>",
      ),
    },
    {
      path: "ppt/_rels/presentation.xml.rels",
      text: demoXml(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>',
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>',
        "</Relationships>",
      ),
    },
    {
      path: "ppt/slides/slide1.xml",
      text: demoXml(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">',
        "<p:cSld>",
        '<p:bg><p:bgPr><a:solidFill><a:srgbClr val="F5F7FB"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>',
        "<p:spTree>",
        '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>',
        '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>',
        "<p:sp>",
        '<p:nvSpPr><p:cNvPr id="2" name="Preview title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>',
        '<p:spPr><a:xfrm><a:off x="1219200" y="2057400"/><a:ext cx="9753600" cy="2057400"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="2563EB"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr>',
        '<p:txBody><a:bodyPr anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="en-US" sz="2800" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr><a:t>Code-Codex Office Preview</a:t></a:r><a:endParaRPr lang="en-US" sz="2800"/></a:p></p:txBody>',
        "</p:sp>",
        "</p:spTree>",
        "</p:cSld>",
        '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>',
        "</p:sld>",
      ),
    },
    {
      path: "ppt/slides/_rels/slide1.xml.rels",
      text: demoXml(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>',
        "</Relationships>",
      ),
    },
    {
      path: "ppt/slideLayouts/slideLayout1.xml",
      text: demoXml(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">',
        '<p:cSld name="Blank"><p:spTree>',
        '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>',
        '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>',
        "</p:spTree></p:cSld>",
        '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>',
        "</p:sldLayout>",
      ),
    },
    {
      path: "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
      text: demoXml(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>',
        "</Relationships>",
      ),
    },
    {
      path: "ppt/slideMasters/slideMaster1.xml",
      text: demoXml(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">',
        "<p:cSld><p:spTree>",
        '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>',
        '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>',
        "</p:spTree></p:cSld>",
        '<p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/>',
        '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>',
        '<p:txStyles><p:titleStyle><a:lvl1pPr algn="ctr"><a:defRPr sz="3200" b="1"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr></p:otherStyle></p:txStyles>',
        "</p:sldMaster>",
      ),
    },
    {
      path: "ppt/slideMasters/_rels/slideMaster1.xml.rels",
      text: demoXml(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>',
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>',
        "</Relationships>",
      ),
    },
    {
      path: "ppt/theme/theme1.xml",
      text: demoXml(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Code-Codex">',
        "<a:themeElements>",
        '<a:clrScheme name="Code-Codex"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F2937"/></a:dk2><a:lt2><a:srgbClr val="F3F4F6"/></a:lt2><a:accent1><a:srgbClr val="2563EB"/></a:accent1><a:accent2><a:srgbClr val="0EA5E9"/></a:accent2><a:accent3><a:srgbClr val="14B8A6"/></a:accent3><a:accent4><a:srgbClr val="8B5CF6"/></a:accent4><a:accent5><a:srgbClr val="F59E0B"/></a:accent5><a:accent6><a:srgbClr val="EF4444"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>',
        '<a:fontScheme name="Code-Codex"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>',
        '<a:fmtScheme name="Code-Codex">',
        '<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="50000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="50000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>',
        '<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln></a:lnStyleLst>',
        '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>',
        '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>',
        "</a:fmtScheme>",
        "</a:themeElements>",
        "</a:theme>",
      ),
    },
  ]);
}

function createDemoZip(entries: readonly { readonly path: string; readonly text: string }[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const data = encoder.encode(entry.text);
    const crc = demoCrc32(data);

    const localHeader = new Uint8Array(30);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0x5821, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.byteLength, true);
    localView.setUint32(22, data.byteLength, true);
    localView.setUint16(26, name.byteLength, true);
    localParts.push(localHeader, name, data);

    const centralHeader = new Uint8Array(46);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0x5821, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.byteLength, true);
    centralView.setUint32(24, data.byteLength, true);
    centralView.setUint16(28, name.byteLength, true);
    centralView.setUint32(42, localOffset, true);
    centralParts.push(centralHeader, name);

    localOffset += localHeader.byteLength + name.byteLength + data.byteLength;
  }

  const centralSize = centralParts.reduce((total, part) => total + part.byteLength, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, localOffset, true);
  return concatDemoBytes([...localParts, ...centralParts, end]);
}

function demoCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatDemoBytes(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function encodeBase64Bytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function demoText(path: string): string {
  return previewText.get(path) ?? `// Preview for ${path}\n`;
}

function demoVersion(text: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ (text.charCodeAt(index) || 0), 16_777_619);
  return (hash >>> 0).toString(16).padStart(8, "0").repeat(8);
}

function demoLineEnding(text: string): "lf" | "crlf" | "none" | "mixed" {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/(?<!\r)\n/g) ?? []).length;
  if (crlf && lf) return "mixed";
  if (crlf) return "crlf";
  if (lf) return "lf";
  return "none";
}

function demoPreview(path: string): Record<string, unknown> {
  const text = demoText(path);
  const lineEnding = demoLineEnding(text);
  return {
    kind: "text",
    text,
    sizeBytes: new TextEncoder().encode(text).byteLength,
    truncated: false,
    editable: lineEnding !== "mixed",
    version: demoVersion(text),
    lineEnding,
  };
}

function demoParentPath(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

function moveDemoEntry(sourcePath: string, destinationParentPath: string): TreeNodeInput {
  const sourceParentPath = demoParentPath(sourcePath);
  const sourceEntries = directories.get(sourceParentPath);
  const destinationEntries = directories.get(destinationParentPath);
  const sourceIndex = sourceEntries?.findIndex((entry) => entry.relativePath === sourcePath) ?? -1;
  if (!sourceEntries || !destinationEntries || sourceIndex < 0) throw new Error("NOT_FOUND");
  const source = sourceEntries[sourceIndex];
  if (!source) throw new Error("NOT_FOUND");
  const movedPath = destinationParentPath ? `${destinationParentPath}/${source.name}` : source.name;
  if (destinationEntries.some((entry) => entry.relativePath === movedPath)) throw new Error("CONFLICT");
  if (source.kind === "directory" && (destinationParentPath === sourcePath || destinationParentPath.startsWith(`${sourcePath}/`))) {
    throw new Error("INVALID_PATH");
  }

  sourceEntries.splice(sourceIndex, 1);
  const moved = { ...source, id: movedPath, relativePath: movedPath };
  destinationEntries.push(moved);
  if (source.kind === "directory") {
    const subtree = [...directories.entries()].filter(([path]) => path === sourcePath || path.startsWith(`${sourcePath}/`));
    for (const [path] of subtree) directories.delete(path);
    for (const [path, entries] of subtree) {
      const nextDirectoryPath = `${movedPath}${path.slice(sourcePath.length)}`;
      directories.set(nextDirectoryPath, entries.map((entry) => ({
        ...entry,
        id: `${movedPath}${entry.relativePath.slice(sourcePath.length)}`,
        relativePath: `${movedPath}${entry.relativePath.slice(sourcePath.length)}`,
      })));
    }
  }
  for (const [path, text] of [...previewText.entries()]) {
    if (path !== sourcePath && !path.startsWith(`${sourcePath}/`)) continue;
    previewText.delete(path);
    previewText.set(`${movedPath}${path.slice(sourcePath.length)}`, text);
  }
  return moved;
}

const bridge: ObjectBridge = {
  request(message: BridgeRequest): unknown {
    const { method, params } = message;
    if (method === "explorer.settings.get") {
      return { panelWidth: settings.width, collapsed: settings.collapsed, showHidden: settings.showHidden, showIgnored: settings.showIgnored };
    }
    if (method === "explorer.settings.set") {
      settings = {
        width: Number(params.panelWidth),
        collapsed: params.collapsed === true,
        showHidden: true,
        showIgnored: true,
      };
      return { panelWidth: settings.width, ...settings };
    }
    if (method === "explorer.context") {
      return {
        threadId: String(params.threadId),
        projectName: "Code-Codex",
        rootName: "Code-Codex",
        compatible: true,
      };
    }
    if (method === "explorer.list") {
      const path = String(params.relativePath ?? "");
      const offset = Number(params.cursor ?? 0);
      const limit = Number(params.limit ?? 500);
      const all = directories.get(path) ?? [];
      const entries = all.slice(offset, offset + limit);
      const next = offset + entries.length;
      return { entries, ...(next < all.length ? { nextCursor: String(next) } : {}) };
    }
    if (method === "explorer.preview") {
      const path = String(params.relativePath ?? "");
      if (path === ".env") {
        return { kind: "unsupported", sizeBytes: 0, truncated: false, reason: "sensitive" };
      }
      return demoPreview(path);
    }
    if (method === "explorer.media.info") {
      const path = String(params.relativePath ?? "");
      const media = demoMedia.get(path);
      if (!media) throw new Error("NOT_EDITABLE");
      return {
        kind: media.kind,
        mimeType: media.mimeType,
        sizeBytes: media.bytes.byteLength,
        chunkSize: DEMO_MEDIA_CHUNK_BYTES,
        chunkCount: Math.ceil(media.bytes.byteLength / DEMO_MEDIA_CHUNK_BYTES),
        version: DEMO_MEDIA_VERSION,
      };
    }
    if (method === "explorer.media.chunk") {
      const path = String(params.relativePath ?? "");
      const media = demoMedia.get(path);
      if (!media || params.expectedVersion !== DEMO_MEDIA_VERSION) throw new Error("CONFLICT");
      const offset = Number(params.offset);
      const length = Number(params.length);
      if (Number(params.expectedSizeBytes) !== media.bytes.byteLength || offset < 0 || length < 1) {
        throw new Error("INVALID_REQUEST");
      }
      const chunk = media.bytes.subarray(offset, Math.min(media.bytes.byteLength, offset + length));
      return {
        offset,
        dataBase64: encodeBase64Bytes(chunk),
        eof: offset + chunk.byteLength === media.bytes.byteLength,
      };
    }
    if (method === "explorer.preview.save") {
      const path = String(params.relativePath ?? "");
      const current = demoText(path);
      if (params.expectedVersion !== demoVersion(current)) throw new Error("CONFLICT");
      const binary = atob(String(params.contentBase64 ?? ""));
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      previewText.set(path, new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      return demoPreview(path);
    }
    if (method === "explorer.entry.move") {
      return moveDemoEntry(
        String(params.relativePath ?? ""),
        String(params.destinationParentRelativePath ?? ""),
      );
    }
    if (method === "explorer.watch.start") {
      watching = true;
      return { watching };
    }
    if (method === "explorer.watch.stop") {
      watching = false;
      return { watching };
    }
    if (method === "explorer.context.clear") {
      watching = false;
      return { cleared: true };
    }
    throw new Error(`Unsupported demo method: ${method}`);
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

window.__CODE_CODEX_BOOTSTRAP__ = {
  token: "local-demo-token",
  codexVersion: "26.715.10079.0",
  channel: "demo",
};
window.__codeCodex = bridge;

await import("../src/index");
window.dispatchEvent(new CustomEvent("code-codex:thread-change", {
  detail: { threadId: "11111111-1111-4111-8111-111111111111", hostId: "local", kind: "local" },
}));

function notify(message: BridgeMessage): void {
  for (const listener of listeners) listener(message);
}

let added = false;
document.querySelector('[data-demo="add"]')?.addEventListener("click", () => {
  if (!added) {
    added = true;
    rootEntries.push({ name: "field-notes.md", relativePath: "field-notes.md", kind: "file" });
  }
  notify({ method: "explorer.changed", params: { changes: [{ relativePath: "field-notes.md", kind: "added", node: { name: "field-notes.md", relativePath: "field-notes.md", kind: "file" } }] } });
});

document.querySelector('[data-demo="modify"]')?.addEventListener("click", () => {
  notify({ method: "explorer.changed", params: { changes: [{ relativePath: "package.json", kind: "modified" }] } });
});

document.querySelector('[data-demo="rename"]')?.addEventListener("click", () => {
  const index = rootEntries.findIndex((entry) => entry.relativePath === "README.md");
  if (index >= 0) rootEntries[index] = { name: "FIELD-GUIDE.md", relativePath: "FIELD-GUIDE.md", kind: "file" };
  notify({ method: "explorer.changed", params: { changes: [{ relativePath: "FIELD-GUIDE.md", fromRelativePath: "README.md", kind: "renamed" }] } });
});

document.querySelector('[data-demo="delete"]')?.addEventListener("click", () => {
  const index = rootEntries.findIndex((entry) => entry.relativePath === "field-notes.md");
  if (index >= 0) rootEntries.splice(index, 1);
  notify({ method: "explorer.changed", params: { changes: [{ relativePath: "field-notes.md", kind: "deleted" }] } });
});

document.querySelector('[data-demo="theme"]')?.addEventListener("click", (event) => {
  const dark = document.documentElement.dataset.theme !== "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  (event.currentTarget as HTMLButtonElement).textContent = dark ? "Light theme" : "Dark theme";
});
