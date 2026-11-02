// The reused visual utilities store diagnostics on window. In this lane that
// name is the Worker global, never the application's Window or its capabilities.
(globalThis as unknown as {window:unknown}).window=globalThis;
