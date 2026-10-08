import type { CodeCodexMainPreviewElement as PreviewHost } from "../main-preview";
import type { DiagramSourceKind, DrawioPageSource, DrawioCellGeometry, DrawioVertex, DrawioEdge, DiagramPoint, DiagramSvgBudget, PlantActivityStatement, PlantActivityModel, PlantLayoutNode, PlantLayoutEdge, PlantBlockLayout, MainPreviewTextView, DiagramPreviewJob } from './contracts';
const MAX_DRAWIO_INFLATED_BYTES = 2 * 1024 * 1024;

const MAX_DRAWIO_PAGES = 32;

const MAX_DRAWIO_CELLS = 5_000;

const MAX_DRAWIO_VERTICES = 1_500;

const MAX_DRAWIO_EDGES = 2_500;

const MAX_DRAWIO_XML_ELEMENTS = 20_000;

const MAX_DRAWIO_XML_NODES = 60_000;

const MAX_DRAWIO_XML_DEPTH = 64;

const MAX_DRAWIO_XML_ATTRIBUTES = 120_000;

const MAX_DRAWIO_XML_ATTRIBUTES_PER_ELEMENT = 128;

const MAX_DRAWIO_XML_ATTRIBUTE_UNITS = 1_500_000;

const MAX_DRAWIO_XML_TAG_UNITS = 65_536;

const MAX_DIAGRAM_LABEL_UNITS = 1_000;

const MAX_DIAGRAM_LINE_CHARACTERS = 160;

const MAX_DIAGRAM_SVG_NODES = 24_000;

const MAX_DIAGRAM_SVG_TEXT_UNITS = 256_000;

const MAX_DIAGRAM_COORDINATE = 1_000_000;

const MAX_DIAGRAM_VIEWBOX_SPAN = 100_000;

const MAX_DIAGRAM_VIEWBOX_ASPECT = 100;

const MIN_DIAGRAM_DISPLAY_WIDTH = 240;

const MIN_DIAGRAM_DISPLAY_HEIGHT = 180;

const MAX_DIAGRAM_DISPLAY_WIDTH = 1_800;

const MAX_DIAGRAM_DISPLAY_HEIGHT = 1_200;

const MAX_PLANTUML_STATEMENTS = 256;

const MAX_PLANTUML_NESTING = 16;

function diagramSourceKind(path: string): DiagramSourceKind | null {
  const normalized = path.replaceAll("\\", "/").toLowerCase();
  if (normalized.endsWith(".drawio")) return "drawio";
  if (normalized.endsWith(".plantuml")) return "plantuml";
  return null;
}

function boundedDiagramNumber(value: string | null, fallback: number, minimum: number, maximum: number): number {
  if (value === null || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function safeDiagramColor(value: string | undefined, fallback: string): string {
  const normalized = value?.trim().toLowerCase() ?? "";
  return /^#[0-9a-f]{6}$/.test(normalized) || /^#[0-9a-f]{3}$/.test(normalized) ? normalized : fallback;
}

function parseDrawioStyle(value: string | null): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  const source = (value ?? "").slice(0, 8_192);
  for (const token of source.split(";", 128)) {
    const separator = token.indexOf("=");
    const key = (separator < 0 ? token : token.slice(0, separator)).trim().toLowerCase();
    if (!key || !/^[a-z][a-z0-9_.-]{0,63}$/.test(key)) continue;
    result.set(key, separator < 0 ? "1" : token.slice(separator + 1).trim().slice(0, 256));
  }
  return result;
}

function decodedDrawioEntity(entity: string): string {
  const normalized = entity.toLowerCase();
  const named: Readonly<Record<string, string>> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  if (named[normalized] !== undefined) return named[normalized];
  const numeric = normalized.startsWith("#x")
    ? Number.parseInt(normalized.slice(2), 16)
    : normalized.startsWith("#")
      ? Number.parseInt(normalized.slice(1), 10)
      : Number.NaN;
  return Number.isInteger(numeric) && numeric >= 0 && numeric <= 0x10ffff && !(numeric >= 0xd800 && numeric <= 0xdfff)
    ? String.fromCodePoint(numeric)
    : `&${entity};`;
}

function plainDrawioLabel(value: string | null): string {
  return (value ?? "")
    .slice(0, MAX_DIAGRAM_LABEL_UNITS * 4)
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:div|p|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]{0,1024}>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);/gi, (_match, entity: string) => decodedDrawioEntity(entity))
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ")
    .slice(0, MAX_DIAGRAM_LABEL_UNITS)
    .trim();
}

function assertDiagramNotAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw signal.reason ?? new DOMException("The diagram preview was cancelled.", "AbortError");
}

function enforceDiagramXmlBudget(source: string, signal?: AbortSignal): void {
  let index = 0;
  let depth = 0;
  let elements = 0;
  let nodes = 0;
  let attributes = 0;
  let attributeUnits = 0;
  const countNode = (): void => {
    nodes += 1;
    if (nodes > MAX_DRAWIO_XML_NODES) throw new Error("The diagram XML has too many nodes to preview safely.");
  };
  while (index < source.length) {
    assertDiagramNotAborted(signal);
    const opening = source.indexOf("<", index);
    if (opening < 0) {
      if (index < source.length) countNode();
      break;
    }
    if (opening > index) countNode();
    if (source.startsWith("<!--", opening)) {
      const ending = source.indexOf("-->", opening + 4);
      if (ending < 0) throw new Error("The diagram XML contains an incomplete comment.");
      countNode();
      index = ending + 3;
      continue;
    }
    if (source.startsWith("<![CDATA[", opening)) {
      const ending = source.indexOf("]]>", opening + 9);
      if (ending < 0) throw new Error("The diagram XML contains an incomplete CDATA section.");
      countNode();
      index = ending + 3;
      continue;
    }
    if (source.startsWith("<?", opening)) {
      const ending = source.indexOf("?>", opening + 2);
      if (ending < 0 || ending - opening > MAX_DRAWIO_XML_TAG_UNITS) {
        throw new Error("The diagram XML declaration exceeds the safe preview limit.");
      }
      countNode();
      index = ending + 2;
      continue;
    }
    if (source.startsWith("</", opening)) {
      const ending = source.indexOf(">", opening + 2);
      if (ending < 0 || ending - opening > MAX_DRAWIO_XML_TAG_UNITS) {
        throw new Error("A diagram XML closing tag exceeds the safe preview limit.");
      }
      depth -= 1;
      if (depth < 0) throw new Error("The diagram XML nesting is malformed.");
      index = ending + 1;
      continue;
    }
    if (source.startsWith("<!", opening)) {
      throw new Error("Unsupported XML declarations are not allowed in diagram previews.");
    }
    let cursor = opening + 1;
    while (cursor < source.length && /\s/.test(source[cursor] ?? "")) cursor += 1;
    const nameStart = cursor;
    while (cursor < source.length && !/[\s/>]/.test(source[cursor] ?? "")) cursor += 1;
    if (cursor === nameStart) throw new Error("The diagram XML contains a malformed element.");
    elements += 1;
    if (elements > MAX_DRAWIO_XML_ELEMENTS) throw new Error("The diagram XML has too many elements to preview safely.");
    countNode();
    depth += 1;
    if (depth > MAX_DRAWIO_XML_DEPTH) throw new Error("The diagram XML nesting is too deep to preview safely.");
    let elementAttributes = 0;
    let closed = false;
    while (cursor < source.length) {
      assertDiagramNotAborted(signal);
      if (cursor - opening > MAX_DRAWIO_XML_TAG_UNITS) throw new Error("A diagram XML tag exceeds the safe preview limit.");
      while (cursor < source.length && /\s/.test(source[cursor] ?? "")) cursor += 1;
      if (source[cursor] === ">") {
        cursor += 1;
        closed = true;
        break;
      }
      if (source[cursor] === "/" && source[cursor + 1] === ">") {
        cursor += 2;
        depth -= 1;
        closed = true;
        break;
      }
      const attributeStart = cursor;
      while (cursor < source.length && !/[\s=/>]/.test(source[cursor] ?? "")) cursor += 1;
      if (cursor === attributeStart) throw new Error("The diagram XML contains a malformed attribute.");
      const attributeNameUnits = cursor - attributeStart;
      while (cursor < source.length && /\s/.test(source[cursor] ?? "")) cursor += 1;
      if (source[cursor] !== "=") throw new Error("The diagram XML contains an unquoted attribute.");
      cursor += 1;
      while (cursor < source.length && /\s/.test(source[cursor] ?? "")) cursor += 1;
      const quote = source[cursor];
      if (quote !== '"' && quote !== "'") throw new Error("The diagram XML contains an unquoted attribute value.");
      const valueStart = cursor + 1;
      const valueEnd = source.indexOf(quote, valueStart);
      if (valueEnd < 0) throw new Error("The diagram XML contains an incomplete attribute value.");
      const valueUnits = valueEnd - valueStart;
      cursor = valueEnd + 1;
      elementAttributes += 1;
      attributes += 1;
      attributeUnits += attributeNameUnits + valueUnits;
      if (elementAttributes > MAX_DRAWIO_XML_ATTRIBUTES_PER_ELEMENT) {
        throw new Error("A diagram XML element has too many attributes to preview safely.");
      }
      if (attributes > MAX_DRAWIO_XML_ATTRIBUTES || attributeUnits > MAX_DRAWIO_XML_ATTRIBUTE_UNITS) {
        throw new Error("The diagram XML attribute budget was exceeded.");
      }
    }
    if (!closed) throw new Error("The diagram XML contains an incomplete element.");
    index = cursor;
  }
  if (depth !== 0) throw new Error("The diagram XML nesting is malformed.");
  assertDiagramNotAborted(signal);
}

function parseSafeDiagramXml(Parser: typeof DOMParser, source: string, signal?: AbortSignal): XMLDocument {
  if (source.length === 0 || source.length > MAX_DRAWIO_INFLATED_BYTES) {
    throw new Error("The diagram XML exceeds the safe preview limit.");
  }
  assertDiagramNotAborted(signal);
  const withoutBom = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const declaration = withoutBom.match(/^\s*<\?xml\s+[^?]{0,512}\?>/i)?.[0] ?? "";
  const remaining = declaration ? withoutBom.slice(declaration.length) : withoutBom;
  if (
    /<\?/.test(remaining) ||
    /<\s*!(?:doctype|entity)\b/i.test(remaining) ||
    /<(?:[a-z][\w.-]*:)?include\b/i.test(remaining)
  ) {
    throw new Error("External resources and XML directives are not allowed in diagram previews.");
  }
  enforceDiagramXmlBudget(withoutBom, signal);
  assertDiagramNotAborted(signal);
  const document = new Parser().parseFromString(withoutBom, "application/xml");
  for (const element of document.getElementsByTagName("*")) {
    if (element.localName.toLowerCase() === "parsererror") throw new Error("The diagram XML is malformed.");
  }
  assertDiagramNotAborted(signal);
  return document;
}

function drawioPages(Parser: typeof DOMParser, source: string, signal?: AbortSignal): {
  readonly pages: readonly DrawioPageSource[];
  readonly limited: boolean;
} {
  const document = parseSafeDiagramXml(Parser, source, signal);
  const root = document.documentElement;
  const rootName = root.localName.toLowerCase();
  if (rootName === "mxgraphmodel") {
    return { pages: [{ name: "Page 1", model: root, encoded: null }], limited: false };
  }
  if (rootName !== "mxfile") throw new Error("This is not a Draw.io diagram.");
  const pageElements = Array.from(root.children).filter((element) => element.localName.toLowerCase() === "diagram");
  if (pageElements.length === 0) throw new Error("The Draw.io file has no pages.");
  const pages = pageElements.slice(0, MAX_DRAWIO_PAGES).map((page, index): DrawioPageSource => ({
    name: plainDrawioLabel(xmlAttribute(page, "name")) || `Page ${index + 1}`,
    model: directXmlChild(page, "mxGraphModel"),
    encoded: directXmlChild(page, "mxGraphModel") ? null : (page.textContent ?? "").trim(),
  }));
  return { pages, limited: pageElements.length > pages.length };
}

async function inflateDrawioPage(encoded: string, signal?: AbortSignal): Promise<string> {
  assertDiagramNotAborted(signal);
  const compact = encoded.replace(/\s+/g, "");
  if (!compact || compact.length > 128 * 1024 || !/^[a-z0-9+/]*={0,2}$/i.test(compact)) {
    throw new Error("The compressed Draw.io page is invalid.");
  }
  let binary: string;
  try {
    binary = atob(compact);
  } catch {
    throw new Error("The compressed Draw.io page is invalid.");
  }
  const compressed = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  const cancelReader = (): void => {
    void reader?.cancel(signal?.reason).catch(() => undefined);
  };
  signal?.addEventListener("abort", cancelReader, { once: true });
  try {
    assertDiagramNotAborted(signal);
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    reader = stream.getReader();
    assertDiagramNotAborted(signal);
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      assertDiagramNotAborted(signal);
      const result = await reader.read();
      assertDiagramNotAborted(signal);
      if (result.done) break;
      const chunk = result.value;
      length += chunk.byteLength;
      if (length > MAX_DRAWIO_INFLATED_BYTES) {
        await reader.cancel();
        throw new Error("The compressed Draw.io page expands beyond the safe preview limit.");
      }
      chunks.push(chunk);
    }
    const inflated = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      inflated.set(chunk, offset);
      offset += chunk.byteLength;
    }
    assertDiagramNotAborted(signal);
    const escaped = new TextDecoder("utf-8", { fatal: true }).decode(inflated);
    const xml = decodeURIComponent(escaped);
    if (xml.length > MAX_DRAWIO_INFLATED_BYTES) throw new Error("The diagram XML exceeds the safe preview limit.");
    return xml;
  } catch (error) {
    if (signal?.aborted) assertDiagramNotAborted(signal);
    if (error instanceof Error && error.message.includes("safe preview limit")) throw error;
    throw new Error("This compressed Draw.io page could not be decoded locally.");
  } finally {
    signal?.removeEventListener("abort", cancelReader);
    if (signal?.aborted) {
      try {
        await reader?.cancel(signal.reason);
      } catch {
        // Cancellation can race with a completed or errored stream.
      }
    }
    try {
      reader?.releaseLock();
    } catch {
      // The bounded reader may already have been cancelled.
    }
  }
}

async function drawioPageModel(
  Parser: typeof DOMParser,
  page: DrawioPageSource,
  signal?: AbortSignal,
): Promise<Element> {
  assertDiagramNotAborted(signal);
  if (page.model) return page.model;
  const encoded = page.encoded ?? "";
  const xml = encoded.trimStart().startsWith("<") ? encoded : await inflateDrawioPage(encoded, signal);
  assertDiagramNotAborted(signal);
  const document = parseSafeDiagramXml(Parser, xml, signal);
  if (document.documentElement.localName.toLowerCase() !== "mxgraphmodel") {
    throw new Error("The Draw.io page does not contain a graph model.");
  }
  return document.documentElement;
}

function drawioGeometry(cell: Element): DrawioCellGeometry | null {
  const geometry = directXmlChild(cell, "mxGeometry");
  if (!geometry) return null;
  return {
    x: boundedDiagramNumber(xmlAttribute(geometry, "x"), 0, -1_000_000, 1_000_000),
    y: boundedDiagramNumber(xmlAttribute(geometry, "y"), 0, -1_000_000, 1_000_000),
    width: boundedDiagramNumber(xmlAttribute(geometry, "width"), 120, 1, 100_000),
    height: boundedDiagramNumber(xmlAttribute(geometry, "height"), 50, 1, 100_000),
  };
}

function drawioPoint(element: Element): DiagramPoint {
  return {
    x: boundedDiagramNumber(xmlAttribute(element, "x"), 0, -1_000_000, 1_000_000),
    y: boundedDiagramNumber(xmlAttribute(element, "y"), 0, -1_000_000, 1_000_000),
  };
}

function drawioGraph(model: Element): {
  readonly vertices: readonly DrawioVertex[];
  readonly edges: readonly DrawioEdge[];
} {
  const cells: Element[] = [];
  for (const element of model.getElementsByTagName("*")) {
    if (element.localName.toLowerCase() !== "mxcell") continue;
    if (cells.length >= MAX_DRAWIO_CELLS) throw new Error("This Draw.io page has too many cells to preview safely.");
    cells.push(element);
  }
  const vertices: DrawioVertex[] = [];
  const edges: DrawioEdge[] = [];
  const ids = new Set<string>();
  for (const cell of cells) {
    const id = (xmlAttribute(cell, "id") ?? "").slice(0, 512);
    if (id && ids.has(id)) continue;
    if (id) ids.add(id);
    const style = parseDrawioStyle(xmlAttribute(cell, "style"));
    if (xmlAttribute(cell, "vertex") === "1") {
      if (vertices.length >= MAX_DRAWIO_VERTICES) throw new Error("This Draw.io page has too many shapes to preview safely.");
      const geometry = drawioGeometry(cell);
      if (!id || !geometry) continue;
      vertices.push({
        id,
        parentId: (xmlAttribute(cell, "parent") ?? "").slice(0, 512),
        label: plainDrawioLabel(xmlAttribute(cell, "value")),
        style,
        geometry,
        group: style.has("group") || style.get("shape")?.toLowerCase() === "group",
      });
      continue;
    }
    if (xmlAttribute(cell, "edge") !== "1") continue;
    if (edges.length >= MAX_DRAWIO_EDGES) throw new Error("This Draw.io page has too many connectors to preview safely.");
    const geometry = directXmlChild(cell, "mxGeometry");
    const points: DiagramPoint[] = [];
    let sourcePoint: DiagramPoint | null = null;
    let targetPoint: DiagramPoint | null = null;
    if (geometry) {
      for (const child of geometry.children) {
        const childName = child.localName.toLowerCase();
        if (childName === "mxpoint") {
          const purpose = (xmlAttribute(child, "as") ?? "").toLowerCase();
          if (purpose === "sourcepoint") sourcePoint = drawioPoint(child);
          else if (purpose === "targetpoint") targetPoint = drawioPoint(child);
        } else if (childName === "array" && (xmlAttribute(child, "as") ?? "").toLowerCase() === "points") {
          for (const point of Array.from(child.children).slice(0, 128)) {
            if (point.localName.toLowerCase() === "mxpoint") points.push(drawioPoint(point));
          }
        }
      }
    }
    edges.push({
      label: plainDrawioLabel(xmlAttribute(cell, "value")),
      sourceId: (xmlAttribute(cell, "source") ?? "").slice(0, 512),
      targetId: (xmlAttribute(cell, "target") ?? "").slice(0, 512),
      style,
      points,
      sourcePoint,
      targetPoint,
    });
  }
  return { vertices, edges };
}

function absoluteDrawioVertices(vertices: readonly DrawioVertex[]): ReadonlyMap<string, DrawioVertex> {
  const original = new Map(vertices.map((vertex) => [vertex.id, vertex]));
  const resolved = new Map<string, DrawioVertex>();
  const visiting = new Set<string>();
  const resolve = (vertex: DrawioVertex, depth: number): DrawioVertex => {
    const existing = resolved.get(vertex.id);
    if (existing) return existing;
    if (depth > 64 || visiting.has(vertex.id)) throw new Error("The Draw.io page contains cyclic group geometry.");
    visiting.add(vertex.id);
    const parent = original.get(vertex.parentId);
    const parentGeometry = parent ? resolve(parent, depth + 1).geometry : null;
    const absoluteX = vertex.geometry.x + (parentGeometry?.x ?? 0);
    const absoluteY = vertex.geometry.y + (parentGeometry?.y ?? 0);
    if (
      !Number.isFinite(absoluteX) ||
      !Number.isFinite(absoluteY) ||
      Math.abs(absoluteX) > MAX_DIAGRAM_COORDINATE ||
      Math.abs(absoluteY) > MAX_DIAGRAM_COORDINATE
    ) {
      throw new Error("The Draw.io group coordinates exceed the safe preview limit.");
    }
    const absolute: DrawioVertex = {
      ...vertex,
      geometry: {
        ...vertex.geometry,
        x: absoluteX,
        y: absoluteY,
      },
    };
    visiting.delete(vertex.id);
    resolved.set(vertex.id, absolute);
    return absolute;
  };
  for (const vertex of vertices) resolve(vertex, 0);
  return resolved;
}

function diagramSvgElement(document: Document, name: string, budget: DiagramSvgBudget): SVGElement {
  budget.nodes += 1;
  if (budget.nodes > MAX_DIAGRAM_SVG_NODES) throw new Error("The diagram SVG node budget was exceeded.");
  return document.createElementNS("http://www.w3.org/2000/svg", name);
}

function setDiagramSvgText(element: SVGElement, value: string, budget: DiagramSvgBudget): string {
  let text = value.slice(0, MAX_DIAGRAM_LABEL_UNITS);
  const finalCodeUnit = text.charCodeAt(text.length - 1);
  if (finalCodeUnit >= 0xd800 && finalCodeUnit <= 0xdbff) text = text.slice(0, -1);
  budget.textUnits += text.length;
  if (text) budget.nodes += 1;
  if (budget.textUnits > MAX_DIAGRAM_SVG_TEXT_UNITS || budget.nodes > MAX_DIAGRAM_SVG_NODES) {
    throw new Error("The diagram SVG text budget was exceeded.");
  }
  element.textContent = text;
  return text;
}

function setBoundedDiagramSvgViewport(
  svg: SVGSVGElement,
  minimumX: number,
  minimumY: number,
  viewWidth: number,
  viewHeight: number,
): void {
  if (
    !Number.isFinite(minimumX) ||
    !Number.isFinite(minimumY) ||
    !Number.isFinite(viewWidth) ||
    !Number.isFinite(viewHeight) ||
    viewWidth <= 0 ||
    viewHeight <= 0 ||
    viewWidth > MAX_DIAGRAM_VIEWBOX_SPAN ||
    viewHeight > MAX_DIAGRAM_VIEWBOX_SPAN
  ) {
    throw new Error("The diagram dimensions exceed the safe preview limit.");
  }
  const aspect = Math.max(viewWidth / viewHeight, viewHeight / viewWidth);
  if (!Number.isFinite(aspect) || aspect > MAX_DIAGRAM_VIEWBOX_ASPECT) {
    throw new Error("The diagram aspect ratio exceeds the safe preview limit.");
  }
  let displayWidth = Math.min(MAX_DIAGRAM_DISPLAY_WIDTH, Math.max(MIN_DIAGRAM_DISPLAY_WIDTH, viewWidth));
  let displayHeight = displayWidth * viewHeight / viewWidth;
  if (displayHeight > MAX_DIAGRAM_DISPLAY_HEIGHT) {
    displayHeight = MAX_DIAGRAM_DISPLAY_HEIGHT;
    displayWidth = Math.max(MIN_DIAGRAM_DISPLAY_WIDTH, displayHeight * viewWidth / viewHeight);
  }
  displayWidth = Math.min(MAX_DIAGRAM_DISPLAY_WIDTH, Math.max(MIN_DIAGRAM_DISPLAY_WIDTH, displayWidth));
  displayHeight = Math.min(MAX_DIAGRAM_DISPLAY_HEIGHT, Math.max(MIN_DIAGRAM_DISPLAY_HEIGHT, displayHeight));
  const boundedWidth = Math.ceil(displayWidth);
  const boundedHeight = Math.ceil(displayHeight);
  svg.setAttribute("viewBox", `${minimumX} ${minimumY} ${viewWidth} ${viewHeight}`);
  svg.setAttribute("width", String(boundedWidth));
  svg.setAttribute("height", String(boundedHeight));
  svg.style.width = `${boundedWidth}px`;
  svg.style.height = `${boundedHeight}px`;
}

function diagramPolylineMidpoint(points: readonly DiagramPoint[]): DiagramPoint {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0] ?? { x: 0, y: 0 };
  const lengths: number[] = [];
  let total = 0;
  for (let index = 1;index < points.length;index += 1) {
    const previous = points[index - 1] ?? points[0] ?? { x: 0, y: 0 };
    const point = points[index] ?? previous;
    const length = Math.hypot(point.x - previous.x, point.y - previous.y);
    lengths.push(length);
    total += length;
  }
  let remaining = total / 2;
  for (let index = 1;index < points.length;index += 1) {
    const length = lengths[index - 1] ?? 0;
    const previous = points[index - 1] ?? points[0] ?? { x: 0, y: 0 };
    const point = points[index] ?? previous;
    if (remaining <= length || index === points.length - 1) {
      const ratio = length > 0 ? remaining / length : 0;
      return { x: previous.x + (point.x - previous.x) * ratio, y: previous.y + (point.y - previous.y) * ratio };
    }
    remaining -= length;
  }
  return points[points.length - 1] ?? { x: 0, y: 0 };
}

function drawioBoundaryPoint(vertex: DrawioVertex, toward: DiagramPoint): DiagramPoint {
  const { x, y, width, height } = vertex.geometry;
  const center = { x: x + width / 2, y: y + height / 2 };
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  if (dx === 0 && dy === 0) return center;
  const scale = 1 / Math.max(Math.abs(dx) / Math.max(1, width / 2), Math.abs(dy) / Math.max(1, height / 2));
  return { x: center.x + dx * scale, y: center.y + dy * scale };
}

function wrappedDiagramLines(value: string, maximumCharacters: number, maximumLines: number): readonly string[] {
  const result: string[] = [];
  const width = Math.min(MAX_DIAGRAM_LINE_CHARACTERS, Math.max(4, Math.trunc(maximumCharacters)));
  for (const requestedLine of value.split(/\r?\n/)) {
    const words = requestedLine.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      result.push("");
      continue;
    }
    let line = "";
    let lineLength = 0;
    for (const word of words) {
      const characters = Array.from(word);
      if (characters.length > width) {
        if (line) {
          result.push(line);
          line = "";
          lineLength = 0;
        }
        for (let index = 0;index < characters.length;index += width) {
          result.push(characters.slice(index, index + width).join(""));
        }
      } else if (!line || lineLength + 1 + characters.length <= width) {
        line = line ? `${line} ${word}` : word;
        lineLength = lineLength === 0 ? characters.length : lineLength + 1 + characters.length;
      } else {
        result.push(line);
        line = word;
        lineLength = characters.length;
      }
    }
    if (line) result.push(line);
  }
  const normalized = result.slice(0, maximumLines);
  if (result.length > maximumLines && normalized.length > 0) {
    const final = normalized[normalized.length - 1] ?? "";
    normalized[normalized.length - 1] = `${Array.from(final).slice(0, Math.max(1, width - 1)).join("")}\u2026`;
  }
  return normalized;
}

function appendDiagramSvgText(
  document: Document,
  parent: SVGElement,
  label: string,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  fontSize: number,
  budget: DiagramSvgBudget,
): void {
  if (!label) return;
  const boundedLabel = label.slice(0, MAX_DIAGRAM_LABEL_UNITS);
  const text = diagramSvgElement(document, "text", budget);
  text.setAttribute("x", String(x + width / 2));
  text.setAttribute("y", String(y + height / 2));
  text.setAttribute("fill", color);
  text.setAttribute("font-family", "Segoe UI, sans-serif");
  text.setAttribute("font-size", String(fontSize));
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("dominant-baseline", "middle");
  const lines = wrappedDiagramLines(boundedLabel, Math.max(5, Math.floor(width / Math.max(6, fontSize * 0.56))), Math.max(1, Math.floor(height / (fontSize * 1.25))));
  const lineHeight = fontSize * 1.22;
  for (let index = 0;index < lines.length;index += 1) {
    const span = diagramSvgElement(document, "tspan", budget);
    span.setAttribute("x", String(x + width / 2));
    span.setAttribute("dy", index === 0 ? String(-((lines.length - 1) * lineHeight) / 2) : String(lineHeight));
    setDiagramSvgText(span, lines[index] ?? "", budget);
    text.append(span);
  }
  const title = diagramSvgElement(document, "title", budget);
  setDiagramSvgText(title, boundedLabel, budget);
  text.append(title);
  parent.append(text);
}

function drawioShapeKind(style: ReadonlyMap<string, string>): "rect" | "ellipse" | "rhombus" | "hexagon" | "parallelogram" | "cylinder" | "unsupported" {
  const shape = style.get("shape")?.trim().toLowerCase() ?? "";
  if (style.has("rhombus") || shape === "rhombus") return "rhombus";
  if (style.has("ellipse") || shape === "ellipse" || shape === "doubleellipse") return "ellipse";
  if (shape === "hexagon") return "hexagon";
  if (shape === "parallelogram") return "parallelogram";
  if (shape === "cylinder" || shape === "cylinder3") return "cylinder";
  if (!shape || shape === "rectangle" || shape === "label" || shape === "process") return "rect";
  return "unsupported";
}

function appendDrawioShape(document: Document, parent: SVGElement, vertex: DrawioVertex, budget: DiagramSvgBudget): boolean {
  const { x, y, width, height } = vertex.geometry;
  const fill = safeDiagramColor(vertex.style.get("fillcolor"), "var(--cle-main-raised)");
  const stroke = safeDiagramColor(vertex.style.get("strokecolor"), "var(--cle-main-muted)");
  const font = safeDiagramColor(vertex.style.get("fontcolor"), "var(--cle-main-text)");
  const strokeWidth = boundedDiagramNumber(vertex.style.get("strokewidth") ?? null, 1.2, 0.5, 8);
  const kind = drawioShapeKind(vertex.style);
  let shape: SVGElement;
  if (kind === "ellipse") {
    shape = diagramSvgElement(document, "ellipse", budget);
    shape.setAttribute("cx", String(x + width / 2));
    shape.setAttribute("cy", String(y + height / 2));
    shape.setAttribute("rx", String(width / 2));
    shape.setAttribute("ry", String(height / 2));
  } else if (kind === "rhombus" || kind === "hexagon" || kind === "parallelogram") {
    shape = diagramSvgElement(document, "polygon", budget);
    const points = kind === "rhombus"
      ? [[x + width / 2, y], [x + width, y + height / 2], [x + width / 2, y + height], [x, y + height / 2]]
      : kind === "hexagon"
        ? [[x + width * 0.22, y], [x + width * 0.78, y], [x + width, y + height / 2], [x + width * 0.78, y + height], [x + width * 0.22, y + height], [x, y + height / 2]]
        : [[x + width * 0.18, y], [x + width, y], [x + width * 0.82, y + height], [x, y + height]];
    shape.setAttribute("points", points.map((point) => point.join(",")).join(" "));
  } else {
    shape = diagramSvgElement(document, "rect", budget);
    shape.setAttribute("x", String(x));
    shape.setAttribute("y", String(y));
    shape.setAttribute("width", String(width));
    shape.setAttribute("height", String(height));
    if (vertex.style.get("rounded") === "1" || kind === "cylinder") {
      const radius = Math.min(14, width / 5, height / 3);
      shape.setAttribute("rx", String(radius));
      shape.setAttribute("ry", String(radius));
    }
  }
  shape.setAttribute("fill", fill);
  shape.setAttribute("stroke", stroke);
  shape.setAttribute("stroke-width", String(strokeWidth));
  if (vertex.style.get("dashed") === "1") shape.setAttribute("stroke-dasharray", "6 4");
  parent.append(shape);
  const fontSize = boundedDiagramNumber(vertex.style.get("fontsize") ?? null, 14, 8, 32);
  appendDiagramSvgText(document, parent, vertex.label, x + 5, y + 4, Math.max(1, width - 10), Math.max(1, height - 8), font, fontSize, budget);
  return kind !== "unsupported";
}

function renderDrawioSvg(document: Document, model: Element, accessibleName: string): {
  readonly svg: SVGSVGElement;
  readonly unsupportedShapes: number;
} {
  const budget: DiagramSvgBudget = { nodes: 0, textUnits: 0 };
  const graph = drawioGraph(model);
  const vertices = absoluteDrawioVertices(graph.vertices);
  const drawableVertices = [...vertices.values()].filter((vertex) => !vertex.group);
  if (drawableVertices.length === 0 && graph.edges.length === 0) throw new Error("This Draw.io page has no drawable cells.");
  const svg = diagramSvgElement(document, "svg", budget) as SVGSVGElement;
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", accessibleName);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  const title = diagramSvgElement(document, "title", budget);
  setDiagramSvgText(title, accessibleName, budget);
  svg.append(title);
  const definitions = diagramSvgElement(document, "defs", budget);
  const marker = diagramSvgElement(document, "marker", budget);
  const markerId = `cle-diagram-arrow-${++nextDiagramMarkerId}`;
  marker.setAttribute("id", markerId);
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "9");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerWidth", "7");
  marker.setAttribute("markerHeight", "7");
  marker.setAttribute("orient", "auto-start-reverse");
  const markerPath = diagramSvgElement(document, "path", budget);
  markerPath.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
  markerPath.setAttribute("fill", "context-stroke");
  marker.append(markerPath);
  definitions.append(marker);
  svg.append(definitions);
  const edgeLayer = diagramSvgElement(document, "g", budget);
  const shapeLayer = diagramSvgElement(document, "g", budget);
  let minimumX = Number.POSITIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  const includePoint = (point: DiagramPoint): void => {
    if (
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      Math.abs(point.x) > MAX_DIAGRAM_COORDINATE ||
      Math.abs(point.y) > MAX_DIAGRAM_COORDINATE
    ) {
      throw new Error("The Draw.io geometry exceeds the safe preview limit.");
    }
    minimumX = Math.min(minimumX, point.x);
    minimumY = Math.min(minimumY, point.y);
    maximumX = Math.max(maximumX, point.x);
    maximumY = Math.max(maximumY, point.y);
  };
  for (const vertex of drawableVertices) {
    includePoint({ x: vertex.geometry.x, y: vertex.geometry.y });
    includePoint({ x: vertex.geometry.x + vertex.geometry.width, y: vertex.geometry.y + vertex.geometry.height });
  }
  for (const edge of graph.edges) {
    const source = vertices.get(edge.sourceId);
    const target = vertices.get(edge.targetId);
    const sourceCenter = source
      ? { x: source.geometry.x + source.geometry.width / 2, y: source.geometry.y + source.geometry.height / 2 }
      : edge.sourcePoint;
    const targetCenter = target
      ? { x: target.geometry.x + target.geometry.width / 2, y: target.geometry.y + target.geometry.height / 2 }
      : edge.targetPoint;
    if (!sourceCenter || !targetCenter) continue;
    let points: DiagramPoint[] = [sourceCenter, ...edge.points, targetCenter];
    if (edge.points.length === 0 && (edge.style.get("edgestyle") ?? "").toLowerCase().includes("orthogonal")) {
      const middleX = (sourceCenter.x + targetCenter.x) / 2;
      points = [sourceCenter, { x: middleX, y: sourceCenter.y }, { x: middleX, y: targetCenter.y }, targetCenter];
    }
    if (source) points[0] = drawioBoundaryPoint(source, points[1] ?? targetCenter);
    if (target) points[points.length - 1] = drawioBoundaryPoint(target, points[points.length - 2] ?? sourceCenter);
    for (const point of points) includePoint(point);
    const path = diagramSvgElement(document, "path", budget);
    path.setAttribute("d", points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" "));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", safeDiagramColor(edge.style.get("strokecolor"), "var(--cle-main-muted)"));
    path.setAttribute("stroke-width", String(boundedDiagramNumber(edge.style.get("strokewidth") ?? null, 1.35, 0.5, 8)));
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-linecap", "round");
    if (edge.style.get("dashed") === "1") path.setAttribute("stroke-dasharray", "6 4");
    if ((edge.style.get("endarrow") ?? "block").toLowerCase() !== "none") path.setAttribute("marker-end", `url(#${markerId})`);
    if ((edge.style.get("startarrow") ?? "none").toLowerCase() !== "none") path.setAttribute("marker-start", `url(#${markerId})`);
    edgeLayer.append(path);
    if (edge.label) {
      const midpoint = diagramPolylineMidpoint(points);
      appendDiagramSvgText(document, edgeLayer, edge.label, midpoint.x - 65, midpoint.y - 15, 130, 30, "var(--cle-main-text)", 12, budget);
    }
  }
  let unsupportedShapes = 0;
  for (const vertex of drawableVertices) {
    if (!appendDrawioShape(document, shapeLayer, vertex, budget)) unsupportedShapes += 1;
  }
  svg.append(edgeLayer, shapeLayer);
  if (!Number.isFinite(minimumX) || !Number.isFinite(minimumY) || !Number.isFinite(maximumX) || !Number.isFinite(maximumY)) {
    throw new Error("The Draw.io page has no visible geometry.");
  }
  const margin = 32;
  const viewWidth = Math.max(120, maximumX - minimumX + margin * 2);
  const viewHeight = Math.max(100, maximumY - minimumY + margin * 2);
  setBoundedDiagramSvgViewport(svg, minimumX - margin, minimumY - margin, viewWidth, viewHeight);
  return { svg, unsupportedShapes };
}

function plainPlantUmlLabel(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/<[^>]{0,1024}>/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ")
    .slice(0, MAX_DIAGRAM_LABEL_UNITS)
    .trim();
}

function parsePlantUmlActivity(source: string): PlantActivityModel {
  const withoutComments = source.replace(/\/\'[\s\S]*?(?:\'\/|$)/g, "");
  const body: string[] = [];
  let title = "PlantUML activity diagram";
  let background = "var(--cle-main-bg)";
  let fill = "var(--cle-main-raised)";
  let stroke = "var(--cle-main-muted)";
  let diamondFill = "var(--cle-main-raised)";
  let diamondStroke = "var(--cle-main-muted)";
  let font = "var(--cle-main-text)";
  let roundCorner = 12;
  let inActivitySkin = false;
  let unsupported = 0;
  const applySkinParameter = (key: string, value: string, activity: boolean): void => {
    const normalizedKey = key.trim().toLowerCase();
    const normalizedValue = value.trim().split(/\s+/, 1)[0] ?? "";
    if (!activity && normalizedKey === "backgroundcolor") background = safeDiagramColor(normalizedValue, background);
    else if (!activity && normalizedKey === "roundcorner") roundCorner = boundedDiagramNumber(normalizedValue, roundCorner, 0, 36);
    else if (activity && normalizedKey === "backgroundcolor") fill = safeDiagramColor(normalizedValue, fill);
    else if (activity && normalizedKey === "bordercolor") stroke = safeDiagramColor(normalizedValue, stroke);
    else if (activity && normalizedKey === "diamondbackgroundcolor") diamondFill = safeDiagramColor(normalizedValue, diamondFill);
    else if (activity && normalizedKey === "diamondbordercolor") diamondStroke = safeDiagramColor(normalizedValue, diamondStroke);
    else if (activity && normalizedKey === "fontcolor") font = safeDiagramColor(normalizedValue, font);
  };
  for (const requestedLine of withoutComments.replace(/\r\n?/g, "\n").split("\n")) {
    const line = requestedLine.trim();
    if (!line || line.startsWith("'")) continue;
    if (/^!(?:include|include_once|import|theme|pragma|function|procedure|unquoted)/i.test(line) || /^include\b/i.test(line)) {
      throw new Error("PlantUML includes, themes, imports, and preprocessors are disabled in local preview.");
    }
    if (/^@(?:startuml|enduml)\b/i.test(line)) continue;
    if (/^title\s+/i.test(line)) {
      title = plainPlantUmlLabel(line.replace(/^title\s+/i, "")) || title;
      continue;
    }
    if (inActivitySkin) {
      if (line === "}") {
        inActivitySkin = false;
        continue;
      }
      const match = line.match(/^([a-z][a-z0-9]*)\s+(.+)$/i);
      if (match?.[1] && match[2]) applySkinParameter(match[1], match[2], true);
      else unsupported += 1;
      continue;
    }
    if (/^skinparam\s+activity\s*\{$/i.test(line)) {
      inActivitySkin = true;
      continue;
    }
    const skinParameter = line.match(/^skinparam\s+([a-z][a-z0-9]*)\s+(.+)$/i);
    if (skinParameter?.[1] && skinParameter[2]) {
      applySkinParameter(skinParameter[1], skinParameter[2], false);
      continue;
    }
    body.push(line);
  }
  if (inActivitySkin) throw new Error("The PlantUML skinparam block is incomplete.");

  let index = 0;
  let statements = 0;
  const parseBlock = (depth: number): readonly PlantActivityStatement[] => {
    if (depth > MAX_PLANTUML_NESTING) throw new Error("The PlantUML activity nesting is too deep to preview safely.");
    const result: PlantActivityStatement[] = [];
    while (index < body.length) {
      const line = body[index] ?? "";
      if (/^(?:else\b|endif\b)/i.test(line)) break;
      index += 1;
      let statement: PlantActivityStatement | null = null;
      if (/^start$/i.test(line)) statement = { kind: "start" };
      else if (/^(?:stop|end)$/i.test(line)) statement = { kind: "stop" };
      else if (line.startsWith(":") && line.endsWith(";")) {
        const label = plainPlantUmlLabel(line.slice(1, -1));
        if (label) statement = { kind: "action", label };
      } else if (/^if\s*\(/i.test(line)) {
        const thenMarker = line.toLowerCase().lastIndexOf(") then");
        const opening = line.indexOf("(");
        if (opening < 0 || thenMarker <= opening) throw new Error("A PlantUML if statement is malformed.");
        const condition = plainPlantUmlLabel(line.slice(opening + 1, thenMarker));
        const tail = line.slice(thenMarker + 6).trim();
        const yesLabel = plainPlantUmlLabel(tail.replace(/^\((.*)\)$/, "$1")) || "yes";
        const thenBranch = parseBlock(depth + 1);
        let noLabel = "no";
        let elseBranch: readonly PlantActivityStatement[] = [];
        const delimiter = body[index] ?? "";
        if (/^else\b/i.test(delimiter)) {
          noLabel = plainPlantUmlLabel(delimiter.replace(/^else\s*(?:\((.*)\))?$/i, "$1")) || "no";
          index += 1;
          elseBranch = parseBlock(depth + 1);
        }
        if (!/^endif$/i.test(body[index] ?? "")) throw new Error("A PlantUML if statement is missing endif.");
        index += 1;
        statement = {
          kind: "if",
          label: condition || "Decision",
          yesLabel,
          noLabel,
          thenBranch,
          elseBranch,
        };
      } else {
        unsupported += 1;
      }
      if (!statement) continue;
      statements += 1;
      if (statements > MAX_PLANTUML_STATEMENTS) throw new Error("This PlantUML activity has too many statements to preview safely.");
      result.push(statement);
    }
    return result;
  };
  const parsed = parseBlock(0);
  if (index < body.length) unsupported += body.length - index;
  if (parsed.length === 0) throw new Error("No supported PlantUML activity statements were found.");
  return {
    title,
    statements: parsed,
    theme: { background, fill, stroke, diamondFill, diamondStroke, font, roundCorner },
    unsupported,
  };
}

function translatePlantLayout(layout: PlantBlockLayout, x: number, y: number): PlantBlockLayout {
  const translatePoint = (point: DiagramPoint): DiagramPoint => ({ x: point.x + x, y: point.y + y });
  return {
    width: layout.width,
    height: layout.height,
    entry: layout.entry ? translatePoint(layout.entry) : null,
    exit: layout.exit ? translatePoint(layout.exit) : null,
    nodes: layout.nodes.map((node) => ({ ...node, x: node.x + x, y: node.y + y })),
    edges: layout.edges.map((edge) => ({ ...edge, points: edge.points.map(translatePoint) })),
  };
}

function emptyPlantLayout(): PlantBlockLayout {
  return {
    width: 110,
    height: 1,
    entry: { x: 55, y: 0 },
    exit: { x: 55, y: 1 },
    nodes: [],
    edges: [],
  };
}

function layoutSimplePlantStatement(statement: Exclude<PlantActivityStatement, { readonly kind: "if" }>): PlantBlockLayout {
  if (statement.kind === "action") {
    const requestedLines = wrappedDiagramLines(statement.label, 34, 8);
    const longest = Math.max(10, ...requestedLines.map((line) => Array.from(line).length));
    const width = Math.min(330, Math.max(180, longest * 7.2 + 34));
    const height = Math.max(52, requestedLines.length * 18 + 24);
    return {
      width,
      height,
      entry: { x: width / 2, y: 0 },
      exit: { x: width / 2, y: height },
      nodes: [{ kind: "action", x: 0, y: 0, width, height, label: statement.label }],
      edges: [],
    };
  }
  const size = statement.kind === "start" ? 18 : 22;
  return {
    width: size,
    height: size,
    entry: { x: size / 2, y: 0 },
    exit: { x: size / 2, y: size },
    nodes: [{ kind: statement.kind, x: 0, y: 0, width: size, height: size, label: "" }],
    edges: [],
  };
}

function layoutPlantIf(statement: Extract<PlantActivityStatement, { readonly kind: "if" }>): PlantBlockLayout {
  const thenLayout = statement.thenBranch.length > 0 ? layoutPlantBlock(statement.thenBranch) : emptyPlantLayout();
  const elseLayout = statement.elseBranch.length > 0 ? layoutPlantBlock(statement.elseBranch) : emptyPlantLayout();
  const gap = 100;
  const branchWidth = thenLayout.width + gap + elseLayout.width;
  const width = Math.max(250, branchWidth);
  const diamondWidth = 180;
  const diamondHeight = 86;
  const centerX = width / 2;
  const branchTop = diamondHeight + 54;
  const branchStartX = (width - branchWidth) / 2;
  const translatedThen = translatePlantLayout(thenLayout, branchStartX, branchTop);
  const translatedElse = translatePlantLayout(elseLayout, branchStartX + thenLayout.width + gap, branchTop);
  const branchBottom = branchTop + Math.max(thenLayout.height, elseLayout.height);
  const joinY = branchBottom + 40;
  const joinSize = 12;
  const thenEntry = translatedThen.entry ?? { x: branchStartX + thenLayout.width / 2, y: branchTop };
  const elseEntry = translatedElse.entry ?? { x: branchStartX + thenLayout.width + gap + elseLayout.width / 2, y: branchTop };
  const thenExit = translatedThen.exit ?? thenEntry;
  const elseExit = translatedElse.exit ?? elseEntry;
  const leftStart = { x: centerX - diamondWidth / 2, y: diamondHeight / 2 };
  const rightStart = { x: centerX + diamondWidth / 2, y: diamondHeight / 2 };
  const join = { x: centerX, y: joinY + joinSize / 2 };
  const edges: PlantLayoutEdge[] = [
    ...translatedThen.edges,
    ...translatedElse.edges,
    { points: [leftStart, { x: thenEntry.x, y: leftStart.y }, thenEntry], label: statement.yesLabel },
    { points: [rightStart, { x: elseEntry.x, y: rightStart.y }, elseEntry], label: statement.noLabel },
    { points: [thenExit, { x: thenExit.x, y: join.y }, join], label: "" },
    { points: [elseExit, { x: elseExit.x, y: join.y }, join], label: "" },
  ];
  return {
    width,
    height: joinY + joinSize,
    entry: { x: centerX, y: 0 },
    exit: { x: centerX, y: joinY + joinSize },
    nodes: [
      { kind: "decision", x: centerX - diamondWidth / 2, y: 0, width: diamondWidth, height: diamondHeight, label: statement.label },
      ...translatedThen.nodes,
      ...translatedElse.nodes,
      { kind: "join", x: centerX - joinSize / 2, y: joinY, width: joinSize, height: joinSize, label: "" },
    ],
    edges,
  };
}

function layoutPlantBlock(statements: readonly PlantActivityStatement[]): PlantBlockLayout {
  if (statements.length === 0) return emptyPlantLayout();
  const layouts = statements.map((statement) => statement.kind === "if" ? layoutPlantIf(statement) : layoutSimplePlantStatement(statement));
  const width = Math.max(...layouts.map((layout) => layout.width));
  const nodes: PlantLayoutNode[] = [];
  const edges: PlantLayoutEdge[] = [];
  let y = 0;
  let entry: DiagramPoint | null = null;
  let previousExit: DiagramPoint | null = null;
  for (const layout of layouts) {
    const translated = translatePlantLayout(layout, (width - layout.width) / 2, y);
    if (!entry) entry = translated.entry;
    if (previousExit && translated.entry) edges.push({ points: [previousExit, translated.entry], label: "" });
    nodes.push(...translated.nodes);
    edges.push(...translated.edges);
    previousExit = translated.exit;
    y += layout.height + 38;
  }
  return {
    width,
    height: Math.max(1, y - 38),
    entry,
    exit: previousExit,
    nodes,
    edges,
  };
}

function renderPlantUmlActivitySvg(document: Document, model: PlantActivityModel, accessibleName: string): SVGSVGElement {
  const budget: DiagramSvgBudget = { nodes: 0, textUnits: 0 };
  const layout = layoutPlantBlock(model.statements);
  const titleHeight = model.title ? 48 : 0;
  const margin = 36;
  const viewWidth = Math.max(280, layout.width + margin * 2);
  const viewHeight = Math.max(180, layout.height + titleHeight + margin * 2);
  const offsetX = (viewWidth - layout.width) / 2;
  const offsetY = margin + titleHeight;
  const translated = translatePlantLayout(layout, offsetX, offsetY);
  const svg = diagramSvgElement(document, "svg", budget) as SVGSVGElement;
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", accessibleName);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  setBoundedDiagramSvgViewport(svg, 0, 0, viewWidth, viewHeight);
  const titleNode = diagramSvgElement(document, "title", budget);
  setDiagramSvgText(titleNode, accessibleName, budget);
  svg.append(titleNode);
  const background = diagramSvgElement(document, "rect", budget);
  background.setAttribute("x", "0");
  background.setAttribute("y", "0");
  background.setAttribute("width", String(viewWidth));
  background.setAttribute("height", String(viewHeight));
  background.setAttribute("fill", model.theme.background);
  svg.append(background);
  const definitions = diagramSvgElement(document, "defs", budget);
  const marker = diagramSvgElement(document, "marker", budget);
  const markerId = `cle-diagram-arrow-${++nextDiagramMarkerId}`;
  marker.setAttribute("id", markerId);
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "9");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerWidth", "7");
  marker.setAttribute("markerHeight", "7");
  marker.setAttribute("orient", "auto");
  const markerPath = diagramSvgElement(document, "path", budget);
  markerPath.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
  markerPath.setAttribute("fill", model.theme.stroke);
  marker.append(markerPath);
  definitions.append(marker);
  svg.append(definitions);
  if (model.title) appendDiagramSvgText(document, svg, model.title, margin, margin - 10, viewWidth - margin * 2, 38, model.theme.font, 17, budget);
  const edges = diagramSvgElement(document, "g", budget);
  for (const edge of translated.edges) {
    if (edge.points.length < 2) continue;
    const path = diagramSvgElement(document, "path", budget);
    path.setAttribute("d", edge.points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" "));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", model.theme.stroke);
    path.setAttribute("stroke-width", "1.5");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("marker-end", `url(#${markerId})`);
    edges.append(path);
    if (edge.label) {
      const midpoint = diagramPolylineMidpoint(edge.points);
      appendDiagramSvgText(document, edges, edge.label, midpoint.x - 42, midpoint.y - 21, 84, 24, model.theme.font, 11, budget);
    }
  }
  svg.append(edges);
  const nodes = diagramSvgElement(document, "g", budget);
  for (const node of translated.nodes) {
    let shape: SVGElement;
    if (node.kind === "start" || node.kind === "join") {
      shape = diagramSvgElement(document, "circle", budget);
      shape.setAttribute("cx", String(node.x + node.width / 2));
      shape.setAttribute("cy", String(node.y + node.height / 2));
      shape.setAttribute("r", String(node.width / 2));
      shape.setAttribute("fill", model.theme.stroke);
    } else if (node.kind === "stop") {
      shape = diagramSvgElement(document, "circle", budget);
      shape.setAttribute("cx", String(node.x + node.width / 2));
      shape.setAttribute("cy", String(node.y + node.height / 2));
      shape.setAttribute("r", String(node.width / 2 - 1));
      shape.setAttribute("fill", model.theme.background);
      shape.setAttribute("stroke", model.theme.stroke);
      shape.setAttribute("stroke-width", "2");
      const center = diagramSvgElement(document, "circle", budget);
      center.setAttribute("cx", String(node.x + node.width / 2));
      center.setAttribute("cy", String(node.y + node.height / 2));
      center.setAttribute("r", String(Math.max(3, node.width / 2 - 5)));
      center.setAttribute("fill", model.theme.stroke);
      nodes.append(shape, center);
      continue;
    } else if (node.kind === "decision") {
      shape = diagramSvgElement(document, "polygon", budget);
      shape.setAttribute("points", [
        `${node.x + node.width / 2},${node.y}`,
        `${node.x + node.width},${node.y + node.height / 2}`,
        `${node.x + node.width / 2},${node.y + node.height}`,
        `${node.x},${node.y + node.height / 2}`,
      ].join(" "));
      shape.setAttribute("fill", model.theme.diamondFill);
      shape.setAttribute("stroke", model.theme.diamondStroke);
      shape.setAttribute("stroke-width", "1.4");
    } else {
      shape = diagramSvgElement(document, "rect", budget);
      shape.setAttribute("x", String(node.x));
      shape.setAttribute("y", String(node.y));
      shape.setAttribute("width", String(node.width));
      shape.setAttribute("height", String(node.height));
      shape.setAttribute("rx", String(Math.min(model.theme.roundCorner, node.height / 3)));
      shape.setAttribute("fill", model.theme.fill);
      shape.setAttribute("stroke", model.theme.stroke);
      shape.setAttribute("stroke-width", "1.4");
    }
    nodes.append(shape);
    if (node.label) {
      appendDiagramSvgText(document, nodes, node.label, node.x + 7, node.y + 5, node.width - 14, node.height - 10, model.theme.font, 13, budget);
    }
  }
  svg.append(nodes);
  return svg;
}

let nextDiagramMarkerId = 0;

function xmlAttribute(element: Element, requestedName: string): string | null {
  const normalizedName = requestedName.toLowerCase();
  for (const attribute of element.attributes) {
    if (attribute.localName.toLowerCase() === normalizedName) return attribute.value;
  }
  return null;
}

function directXmlChild(element: Element, requestedName: string): Element | null {
  const normalizedName = requestedName.toLowerCase();
  for (const child of element.children) {
    if (child.localName.toLowerCase() === normalizedName) return child;
  }
  return null;
}

export const methods = {
  _isDiagramPreviewCurrent(this: PreviewHost, job: DiagramPreviewJob): boolean {
    return this._connected &&
      this._diagramJob === job &&
      this._diagramGeneration === job.generation &&
      !job.abortController.signal.aborted;
  },

  _cancelDiagramPreview(this: PreviewHost): void {
    this._diagramGeneration += 1;
    const job = this._diagramJob;
    this._diagramJob = null;
    job?.abortController.abort(new DOMException("The diagram preview was cancelled.", "AbortError"));
  },

  _startDiagramPreview(this: PreviewHost): DiagramPreviewJob {
    this._cancelDiagramPreview();
    const job = {
      generation: this._diagramGeneration,
      abortController: new AbortController(),
    };
    this._diagramJob = job;
    return job;
  },

  _diagramReader(this: PreviewHost, view: MainPreviewTextView): HTMLElement {
    const kind = diagramSourceKind(view.path);
    const container = this.ownerDocument.createElement("article");
    container.className = "diagram-preview";
    container.setAttribute("aria-label", `Diagram preview: ${view.name}`);
    const header = this.ownerDocument.createElement("header");
    header.className = "diagram-header";
    const headingCopy = this.ownerDocument.createElement("div");
    const title = this.ownerDocument.createElement("h2");
    title.className = "diagram-title";
    title.textContent = view.name;
    const summary = this.ownerDocument.createElement("div");
    summary.className = "diagram-summary";
    summary.textContent = kind === "drawio" ? "Draw.io diagram · Local preview" : "PlantUML activity · Local preview";
    headingCopy.append(title, summary);
    const controls = this.ownerDocument.createElement("div");
    controls.className = "diagram-controls";
    header.append(headingCopy, controls);
    const notices = this.ownerDocument.createElement("div");
    notices.className = "diagram-notices";
    const canvas = this.ownerDocument.createElement("div");
    canvas.className = "diagram-canvas";
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", `${view.name} rendered diagram`);
    const status = (message: string, error = false): HTMLElement => {
      const element = this.ownerDocument.createElement("div");
      element.className = `diagram-status${error ? " error" : ""}`;
      element.setAttribute(error ? "role" : "aria-live", error ? "alert" : "polite");
      element.textContent = message;
      return element;
    };
    const notice = (message: string): HTMLElement => this._textSpan(message, "diagram-notice");
    container.append(header);
    if (view.truncated) {
      notices.append(notice("Diagram rendering is disabled because this file exceeds the safe text-preview limit."));
      canvas.append(status("A truncated diagram cannot be parsed safely. Use the source file in a dedicated diagram editor.", true));
      container.append(notices, canvas);
      return container;
    }
    if (!kind) {
      canvas.append(status("This diagram format is not supported.", true));
      container.append(canvas);
      return container;
    }
    const initialJob = this._startDiagramPreview();
    if (kind === "plantuml") {
      try {
        assertDiagramNotAborted(initialJob.abortController.signal);
        const model = parsePlantUmlActivity(view.text);
        assertDiagramNotAborted(initialJob.abortController.signal);
        summary.textContent = "PlantUML activity · Bounded local renderer";
        if (model.unsupported > 0) {
          notices.append(notice(`Partial preview: ${model.unsupported.toLocaleString()} unsupported PlantUML ${model.unsupported === 1 ? "statement was" : "statements were"} omitted.`));
        }
        const svg = renderPlantUmlActivitySvg(this.ownerDocument, model, `${view.name} PlantUML activity diagram`);
        assertDiagramNotAborted(initialJob.abortController.signal);
        canvas.append(svg);
      } catch (error) {
        if (!this._isDiagramPreviewCurrent(initialJob)) return container;
        const message = error instanceof Error ? error.message : "The PlantUML activity could not be parsed.";
        canvas.append(status(`${message} Switch to editing mode to inspect the raw source.`, true));
      }
      if (notices.childElementCount > 0) container.append(notices);
      container.append(canvas);
      return container;
    }

    const Parser = this.ownerDocument.defaultView?.DOMParser;
    if (!Parser) {
      canvas.append(status("This Codex build cannot parse Draw.io XML locally.", true));
      container.append(canvas);
      return container;
    }
    let parsed: ReturnType<typeof drawioPages>;
    try {
      parsed = drawioPages(Parser, view.text, initialJob.abortController.signal);
    } catch (error) {
      if (!this._isDiagramPreviewCurrent(initialJob)) return container;
      const message = error instanceof Error ? error.message : "The Draw.io file could not be parsed.";
      canvas.append(status(`${message} Switch to editing mode to inspect the raw source.`, true));
      container.append(canvas);
      return container;
    }
    summary.textContent = `Draw.io · ${parsed.pages.length.toLocaleString()} ${parsed.pages.length === 1 ? "page" : "pages"} · Local renderer`;
    if (parsed.limited) notices.append(notice(`Only the first ${MAX_DRAWIO_PAGES.toLocaleString()} Draw.io pages are available in preview.`));
    let pageNotice: HTMLElement | null = null;
    const renderPage = async (index: number): Promise<void> => {
      const page = parsed.pages[index];
      if (!page) return;
      const pageJob = this._startDiagramPreview();
      pageNotice?.remove();
      pageNotice = null;
      canvas.replaceChildren(status(`Rendering ${page.name}…`));
      try {
        assertDiagramNotAborted(pageJob.abortController.signal);
        const model = await drawioPageModel(Parser, page, pageJob.abortController.signal);
        if (!this._isDiagramPreviewCurrent(pageJob) || !container.isConnected) return;
        const rendered = renderDrawioSvg(this.ownerDocument, model, `${view.name} · ${page.name}`);
        if (!this._isDiagramPreviewCurrent(pageJob) || !container.isConnected) return;
        canvas.replaceChildren(rendered.svg);
        canvas.setAttribute("aria-label", `${view.name} rendered Draw.io page: ${page.name}`);
        if (rendered.unsupportedShapes > 0) {
          pageNotice = notice(`${rendered.unsupportedShapes.toLocaleString()} unsupported Draw.io ${rendered.unsupportedShapes === 1 ? "shape uses" : "shapes use"} a safe rectangular fallback.`);
          notices.append(pageNotice);
          if (!notices.isConnected) container.insertBefore(notices, canvas);
        }
      } catch (error) {
        if (!this._isDiagramPreviewCurrent(pageJob) || !container.isConnected) return;
        const message = error instanceof Error ? error.message : "The Draw.io page could not be rendered.";
        canvas.replaceChildren(status(`${message} Switch to editing mode to inspect the raw source.`, true));
      }
    };
    if (parsed.pages.length > 1) {
      const label = this.ownerDocument.createElement("label");
      label.className = "diagram-page-label";
      label.textContent = "Page";
      const select = this.ownerDocument.createElement("select");
      select.className = "diagram-page-select";
      select.setAttribute("aria-label", `Select a Draw.io page for ${view.name}`);
      parsed.pages.forEach((page, index) => {
        const option = this.ownerDocument.createElement("option");
        option.value = String(index);
        option.textContent = page.name;
        select.append(option);
      });
      select.addEventListener("change", () => void renderPage(Number.parseInt(select.value, 10)));
      label.append(select);
      controls.append(label);
    }
    if (notices.childElementCount > 0) container.append(notices);
    container.append(canvas);
    void renderPage(0);
    return container;
  }
};
