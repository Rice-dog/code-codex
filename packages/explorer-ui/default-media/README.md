# Default background galleries

These are the nine original PNG images explicitly selected by the maintainer for distribution: six Particle Image images and three Pixel Sculpt images. `manifest.json` pins source bytes, thumbnails and per-image transforms/orders. The build never exports the running user's IndexedDB or adds arbitrary private media.

Build emits one bounded, hash-verified companion script per image. Core setup excludes these files; a background download or offline import installs all of its required companion scripts. Change this approved manifest deliberately when adding/replacing defaults, bump its gallery version and affected package versions, and verify old-gallery migration and explicit deletion behavior.

Default images remain editable/removable in the same user library. A reserved initialization marker is stored atomically with imported records and retained by the Pixel Sculpt save operation. The existing IndexedDB version remains 1; no gallery schema upgrade is required. Historical versions may clear the marker when saving a library, so returning from such a version may repeat deduplication during initialization.
