// @ts-expect-error This library subpath does not publish declarations.
import { AnnotationMode, VerbosityLevel, getDocument } from "pdfjs-dist/build/pdf.mjs";
import type { PDFPageProxy } from "pdfjs-dist/types/src/pdf.d.ts";
import type { CodeCodexMainPreviewElement as PreviewHost } from "../main-preview";
import type { MainPreviewMediaView, PdfPreviewJob } from './contracts';
import 'pdfjs-dist/build/pdf.worker.mjs';
const MAX_PDF_CANVAS_PIXELS = 16_777_216;

const MAX_PDF_CANVAS_DIMENSION = 16_384;

const MAX_PDF_CSS_SCALE = 2;

const MAX_PDF_OUTPUT_SCALE = 2;

export const methods = {
  _pdfPreview(this: PreviewHost, view: MainPreviewMediaView): HTMLElement {
    const container = this.ownerDocument.createElement("div");
    container.className = "media-preview";
    container.dataset.kind = "pdf";
    container.setAttribute("aria-label", `PDF preview: ${view.name}`);
    container.setAttribute("aria-busy", "true");

    const documentPreview = this.ownerDocument.createElement("div");
    documentPreview.className = "media-preview-pdf";

    const toolbar = this.ownerDocument.createElement("nav");
    toolbar.className = "pdf-preview-toolbar";
    toolbar.setAttribute("aria-label", "PDF page navigation");

    const previous = this.ownerDocument.createElement("button");
    previous.type = "button";
    previous.textContent = "Previous";
    previous.setAttribute("aria-label", "Show previous PDF page");
    previous.setAttribute("aria-disabled", "true");

    const pageStatus = this.ownerDocument.createElement("span");
    pageStatus.className = "pdf-page-status";
    pageStatus.setAttribute("role", "status");
    pageStatus.setAttribute("aria-live", "polite");
    pageStatus.textContent = "Loading PDF";

    const next = this.ownerDocument.createElement("button");
    next.type = "button";
    next.textContent = "Next";
    next.setAttribute("aria-label", "Show next PDF page");
    next.setAttribute("aria-disabled", "true");
    toolbar.append(previous, pageStatus, next);

    const stage = this.ownerDocument.createElement("div");
    stage.className = "pdf-page-stage";
    stage.setAttribute("aria-label", `${view.name} page preview`);
    const loading = this._textSpan("Loading PDF…", "pdf-preview-loading");
    loading.setAttribute("role", "status");
    stage.append(loading);
    documentPreview.append(toolbar, stage);
    container.append(documentPreview);

    const job: PdfPreviewJob = {
      generation: ++this._pdfGeneration,
      data: null,
      loadingTask: null,
      document: null,
      renderTask: null,
      pageGeneration: 0,
    };
    this._pdfJob = job;
    let pageNumber = 1;
    let pageCount = 0;
    let pageBusy = true;

    const isCurrent = (): boolean =>
      this._connected && this._pdfJob === job && this._pdfGeneration === job.generation && container.isConnected;

    const updateControls = (busy: boolean): void => {
      pageBusy = busy;
      previous.setAttribute("aria-disabled", String(busy || pageNumber <= 1));
      next.setAttribute("aria-disabled", String(busy || pageNumber >= pageCount));
      pageStatus.textContent = pageCount > 0 ? `Page ${pageNumber} of ${pageCount}` : "Loading PDF";
      container.setAttribute("aria-busy", String(busy));
    };

    const releaseJob = (): void => {
      job.pageGeneration += 1;
      job.renderTask?.cancel();
      job.renderTask = null;
      job.data = null;
      const cleanup = job.loadingTask?.destroy() ?? job.document?.destroy();
      job.loadingTask = null;
      job.document = null;
      if (cleanup) void cleanup.catch(() => undefined);
    };

    const showError = (message: string): void => {
      if (!isCurrent()) return;
      const error = this._textSpan(message, "pdf-page-error");
      error.setAttribute("role", "alert");
      stage.replaceChildren(error);
      pageStatus.textContent = "Preview unavailable";
      pageBusy = true;
      previous.setAttribute("aria-disabled", "true");
      next.setAttribute("aria-disabled", "true");
      container.setAttribute("aria-busy", "false");
      releaseJob();
    };

    const renderPage = async (requestedPage: number): Promise<void> => {
      const document = job.document;
      if (!document || !isCurrent()) return;
      const targetPage = Math.max(1, Math.min(pageCount, requestedPage));
      const pageGeneration = ++job.pageGeneration;
      job.renderTask?.cancel();
      job.renderTask = null;
      pageNumber = targetPage;
      updateControls(true);
      const rendering = this._textSpan(`Rendering page ${targetPage}…`, "pdf-preview-loading");
      rendering.setAttribute("role", "status");
      stage.replaceChildren(rendering);

      let page: PDFPageProxy | undefined;
      try {
        page = await document.getPage(targetPage);
        if (!isCurrent() || pageGeneration !== job.pageGeneration) return;

        if (stage.clientWidth <= 0) {
          await new Promise<void>((resolve) => {
            const window = this.ownerDocument.defaultView;
            if (window) window.requestAnimationFrame(() => resolve());
            else setTimeout(resolve, 0);
          });
        }
        if (!isCurrent() || pageGeneration !== job.pageGeneration) return;

        const baseViewport = page.getViewport({ scale: 1 });
        if (
          !Number.isFinite(baseViewport.width) ||
          !Number.isFinite(baseViewport.height) ||
          baseViewport.width <= 0 ||
          baseViewport.height <= 0
        ) {
          throw new Error("Invalid PDF page dimensions");
        }
        const window = this.ownerDocument.defaultView;
        const computed = window?.getComputedStyle(stage);
        const horizontalPadding = computed
          ? (Number.parseFloat(computed.paddingLeft) || 0) + (Number.parseFloat(computed.paddingRight) || 0)
          : 0;
        const availableWidth = Math.max(1, stage.clientWidth - horizontalPadding);
        const fitScale = availableWidth / baseViewport.width;
        const baseArea = baseViewport.width * baseViewport.height;
        if (!Number.isFinite(baseArea) || baseArea <= 0) throw new Error("Invalid PDF page area");
        const canvasAreaScale = Math.sqrt(MAX_PDF_CANVAS_PIXELS / baseArea);
        const canvasDimensionScale = Math.min(
          MAX_PDF_CANVAS_DIMENSION / baseViewport.width,
          MAX_PDF_CANVAS_DIMENSION / baseViewport.height,
        );
        const cssScale = Math.min(MAX_PDF_CSS_SCALE, fitScale, canvasAreaScale, canvasDimensionScale);
        if (!Number.isFinite(cssScale) || cssScale <= 0) throw new Error("Invalid PDF page scale");
        const viewport = page.getViewport({ scale: cssScale });
        const viewportArea = viewport.width * viewport.height;
        if (
          !Number.isFinite(viewport.width) ||
          !Number.isFinite(viewport.height) ||
          !Number.isFinite(viewportArea) ||
          viewport.width <= 0 ||
          viewport.height <= 0 ||
          viewportArea <= 0
        ) {
          throw new Error("Invalid PDF canvas dimensions");
        }
        const requestedOutputScale = Math.min(MAX_PDF_OUTPUT_SCALE, Math.max(1, window?.devicePixelRatio ?? 1));
        const outputAreaScale = Math.sqrt(MAX_PDF_CANVAS_PIXELS / viewportArea);
        const outputDimensionScale = Math.min(
          MAX_PDF_CANVAS_DIMENSION / viewport.width,
          MAX_PDF_CANVAS_DIMENSION / viewport.height,
        );
        const outputScale = Math.min(requestedOutputScale, outputAreaScale, outputDimensionScale);
        if (!Number.isFinite(outputScale) || outputScale <= 0) throw new Error("Invalid PDF output scale");
        const bitmapWidth = Math.floor(viewport.width * outputScale);
        const bitmapHeight = Math.floor(viewport.height * outputScale);
        const bitmapArea = bitmapWidth * bitmapHeight;
        if (
          !Number.isSafeInteger(bitmapWidth) ||
          !Number.isSafeInteger(bitmapHeight) ||
          !Number.isSafeInteger(bitmapArea) ||
          bitmapWidth < 1 ||
          bitmapHeight < 1 ||
          bitmapWidth > MAX_PDF_CANVAS_DIMENSION ||
          bitmapHeight > MAX_PDF_CANVAS_DIMENSION ||
          bitmapArea > MAX_PDF_CANVAS_PIXELS
        ) {
          throw new Error("PDF canvas exceeds preview limits");
        }

        const canvas = this.ownerDocument.createElement("canvas");
        canvas.className = "pdf-page-canvas";
        canvas.width = bitmapWidth;
        canvas.height = bitmapHeight;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", `${view.name}, page ${targetPage} of ${pageCount}`);
        stage.replaceChildren(canvas);

        const renderTask = page.render({
          canvas,
          viewport,
          annotationMode: AnnotationMode.DISABLE,
          ...(outputScale === 1 ? {} : { transform: [outputScale, 0, 0, outputScale, 0, 0] }),
        });
        job.renderTask = renderTask;
        await renderTask.promise;
        if (!isCurrent() || pageGeneration !== job.pageGeneration) return;
        job.renderTask = null;
        updateControls(false);
      } catch (error) {
        const cancelled = error instanceof Error && error.name === "RenderingCancelledException";
        if (!cancelled && isCurrent() && pageGeneration === job.pageGeneration) {
          showError("This PDF page could not be rendered.");
        }
      } finally {
        page?.cleanup();
      }
    };

    previous.addEventListener("click", () => {
      if (!pageBusy && pageNumber > 1) void renderPage(pageNumber - 1);
    });
    next.addEventListener("click", () => {
      if (!pageBusy && pageNumber < pageCount) void renderPage(pageNumber + 1);
    });

    queueMicrotask(() => {
      void (async () => {
        if (!isCurrent()) return;
        try {
          const data = view.bytes.slice();
          job.data = data;
          const loadingTask = getDocument({
            data,
            ownerDocument: this.ownerDocument,
            verbosity: VerbosityLevel.ERRORS,
            isEvalSupported: false,
            enableXfa: false,
            useWorkerFetch: false,
            useWasm: false,
          });
          job.data = null;
          job.loadingTask = loadingTask;
          const document = await loadingTask.promise;
          if (!isCurrent()) {
            if (job.loadingTask === loadingTask) releaseJob();
            return;
          }
          job.document = document;
          pageCount = document.numPages;
          if (pageCount < 1) {
            showError("This PDF does not contain any pages.");
            return;
          }
          updateControls(true);
          await renderPage(1);
        } catch (error) {
          job.data = null;
          if (!isCurrent()) return;
          const passwordProtected = error instanceof Error && error.name === "PasswordException";
          showError(passwordProtected ? "Password-protected PDFs cannot be previewed." : "This PDF could not be opened.");
        }
      })();
    });
    return container;
  },

  _cancelPdfPreview(this: PreviewHost): void {
    this._pdfGeneration += 1;
    const job = this._pdfJob;
    this._pdfJob = null;
    if (!job) return;
    job.pageGeneration += 1;
    job.renderTask?.cancel();
    job.renderTask = null;
    job.data = null;
    const cleanup = job.loadingTask?.destroy() ?? job.document?.destroy();
    if (cleanup) void cleanup.catch(() => undefined);
    job.loadingTask = null;
    job.document = null;
  }
};
