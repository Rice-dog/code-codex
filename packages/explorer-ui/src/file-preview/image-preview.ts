import type { CodeCodexMainPreviewElement as PreviewHost } from "../main-preview";
import type { MainPreviewMediaView, MainPreviewModelView } from './contracts';
export const IMAGE_PREVIEWER_ID = "code-codex.image-preview";

export const VIDEO_PREVIEWER_ID = "code-codex.video-preview";

export const PDF_PREVIEWER_ID = "code-codex.pdf-preview";

export const AUDIO_PREVIEWER_ID = "code-codex.audio-preview";

export const OFFICE_PREVIEWER_ID = "code-codex.office-preview";

export const NOTEBOOK_PREVIEWER_ID = "code-codex.notebook-preview";

export const MODEL_PREVIEWER_ID = "code-codex.model-preview";

function previewerIdForMediaKind(kind: MainPreviewMediaView["kind"] | MainPreviewModelView["kind"]): string {
  switch (kind) {
    case "image":
      return IMAGE_PREVIEWER_ID;
    case "video":
      return VIDEO_PREVIEWER_ID;
    case "pdf":
      return PDF_PREVIEWER_ID;
    case "audio":
      return AUDIO_PREVIEWER_ID;
    case "office":
      return OFFICE_PREVIEWER_ID;
    case "notebook":
      return NOTEBOOK_PREVIEWER_ID;
    case "model":
      return MODEL_PREVIEWER_ID;
  }
}

export const methods = {
  _mediaPreview(this: PreviewHost, view: MainPreviewMediaView | MainPreviewModelView): HTMLElement {
    const previewerId = previewerIdForMediaKind(view.kind);
    if (!this._state.enabledPreviewers?.includes(previewerId)) {
      return this._statePanel("Preview unavailable", "Enable this file preview extension in Preview Market.", "unsupported", view);
    }

    if (view.kind === "pdf") return this._pdfPreview(view);
    if (view.kind === "notebook") return this._notebookPreview(view);
    if (view.kind === "office") return this._officePreview(view);
    if (view.kind === "model") return this._modelPreview(view);

    let audioPreview: HTMLAudioElement | undefined;
    if (view.kind === "audio") {
      audioPreview = this.ownerDocument.createElement("audio");
      if (!audioPreview.canPlayType(view.mimeType)) {
        return this._statePanel(
          "Audio preview unavailable",
          "This Codex build cannot play this audio format.",
          "unsupported",
          view,
        );
      }
    }

    const url = this._mediaObjectUrl(view);
    if (!url) {
      return this._statePanel("Media preview failed", "This file could not be prepared for preview.", "error", view);
    }

    const container = this.ownerDocument.createElement("div");
    container.className = "media-preview";
    container.dataset.kind = view.kind;
    if (view.kind === "image") {
      const image = this.ownerDocument.createElement("img");
      image.className = "media-preview-image";
      image.src = url;
      image.alt = view.name;
      image.draggable = false;
      container.append(image);
      return container;
    }

    if (view.kind === "audio") {
      const audio = audioPreview ?? this.ownerDocument.createElement("audio");
      audio.className = "media-preview-audio";
      audio.src = url;
      audio.controls = true;
      audio.preload = "metadata";
      audio.autoplay = false;
      audio.setAttribute("aria-label", `Play ${view.name}`);
      audio.addEventListener("error", () => {
        if (!container.isConnected || this._mediaObjectUrls.get(view.path)?.url !== url) return;
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
        this._revokeMediaObjectUrl(view.path);
        container.replaceWith(
          this._statePanel("Audio preview failed", "This audio file could not be played.", "error", view),
        );
      }, { once: true });
      container.append(audio);
      return container;
    }

    const video = this.ownerDocument.createElement("video");
    video.className = "media-preview-video";
    video.src = url;
    video.controls = true;
    video.preload = "metadata";
    video.playsInline = true;
    video.autoplay = false;
    video.setAttribute("aria-label", `Preview ${view.name}`);
    container.append(video);
    return container;
  }
};
