import type { ReactNode } from "react";
import {
  AbsoluteFill,
  Easing,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const colors = {
  graphite: "#15191d",
  graphiteRaised: "#1e2429",
  paper: "#edf0ec",
  paperMuted: "#aab3ad",
  rule: "#39434a",
  signal: "#f5b942",
  cyan: "#65c7c2",
  green: "#72c486",
  red: "#ef746f",
  blue: "#75a8e8",
};

const ease = Easing.bezier(0.16, 1, 0.3, 1);
const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

const fadeForScene = (frame: number, duration: number, fps: number) => {
  const edge = Math.round(0.65 * fps);
  return interpolate(frame, [0, edge, duration - edge, duration], [0, 1, 1, 0], {
    ...clamp,
    easing: ease,
  });
};

const rise = (frame: number, fps: number, delaySeconds = 0) =>
  interpolate(frame, [delaySeconds * fps, (delaySeconds + 0.8) * fps], [34, 0], {
    ...clamp,
    easing: ease,
  });

const Eyebrow = ({ children }: { children: ReactNode }) => (
  <div style={{ color: colors.signal, font: "600 19px 'Cascadia Mono', monospace", letterSpacing: 3.2, textTransform: "uppercase" }}>
    {children}
  </div>
);

const Scene = ({ duration, children }: { duration: number; children: ReactNode }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ opacity: fadeForScene(frame, duration, fps) }}>
      {children}
    </AbsoluteFill>
  );
};

const Shell = ({ children }: { children: ReactNode }) => {
  const frame = useCurrentFrame();
  const sweep = interpolate(frame % 240, [0, 240], [-200, 2120]);
  return (
    <AbsoluteFill style={{ background: colors.graphite, color: colors.paper, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, opacity: 0.34, backgroundImage: "linear-gradient(#2a3136 1px, transparent 1px), linear-gradient(90deg, #2a3136 1px, transparent 1px)", backgroundSize: "64px 64px" }} />
      <div style={{ position: "absolute", left: sweep, top: 0, bottom: 0, width: 2, background: colors.signal, opacity: 0.18 }} />
      <div style={{ position: "absolute", top: 34, left: 52, right: 52, display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${colors.rule}`, paddingBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 11, height: 11, borderRadius: "50%", background: colors.green, boxShadow: `0 0 18px ${colors.green}` }} />
          <span style={{ font: "600 19px Bahnschrift, sans-serif", letterSpacing: 1.8 }}>CODEX LIVE EXPLORER</span>
        </div>
        <span style={{ color: colors.paperMuted, font: "16px 'Cascadia Mono', monospace" }}>M0—M4 / WINDOWS 11 / READ ONLY</span>
      </div>
      <div style={{ position: "absolute", left: 52, right: 52, bottom: 30, display: "flex", justifyContent: "space-between", borderTop: `1px solid ${colors.rule}`, paddingTop: 15, color: colors.paperMuted, font: "14px 'Cascadia Mono', monospace", letterSpacing: 1.1 }}>
        <span>UNOFFICIAL COMMUNITY PROJECT · DOES NOT MODIFY CODEX DESKTOP</span>
        <span>0.1.0</span>
      </div>
      {children}
    </AbsoluteFill>
  );
};

const BigTitle = ({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ position: "absolute", left: 150, right: 150, top: 290, transform: `translateY(${rise(frame, fps)}px)` }}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <div style={{ marginTop: 22, maxWidth: 1500, font: "700 112px/0.95 Bahnschrift, sans-serif", letterSpacing: -4.5 }}>{title}</div>
      <div style={{ width: 170, height: 7, margin: "34px 0 30px", background: colors.signal }} />
      <div style={{ maxWidth: 1080, color: colors.paperMuted, font: "34px/1.4 Bahnschrift, sans-serif" }}>{copy}</div>
    </div>
  );
};

const Intro = ({ duration }: { duration: number }) => (
  <Scene duration={duration}>
    <BigTitle
      eyebrow="Project structure / inside the conversation"
      title="See the workspace while Codex works."
      copy="A local-first project tree that follows the selected task and updates as paths change—without repackaging the official app."
    />
  </Scene>
);

const ProcessCard = ({ index, title, detail, accent, progress }: { index: string; title: string; detail: string; accent: string; progress: number }) => (
  <div style={{ width: 410, minHeight: 235, border: `1px solid ${colors.rule}`, background: colors.graphiteRaised, padding: 30, opacity: progress, transform: `translateY(${(1 - progress) * 28}px)` }}>
    <div style={{ color: accent, font: "17px 'Cascadia Mono', monospace", letterSpacing: 2 }}>{index}</div>
    <div style={{ marginTop: 24, font: "600 31px Bahnschrift, sans-serif" }}>{title}</div>
    <div style={{ marginTop: 14, color: colors.paperMuted, font: "22px/1.45 Bahnschrift, sans-serif" }}>{detail}</div>
  </div>
);

const LaunchFlow = ({ duration }: { duration: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cards = [
    ["01", "Discover", "Find the verified Codex Beta package dynamically.", colors.cyan],
    ["02", "Launch", "Reserve a random loopback CDP port and own the process job.", colors.signal],
    ["03", "Qualify", "Inject only one top-frame app renderer with the expected layout.", colors.green],
    ["04", "Resolve", "Map the active local thread to its cwd through App Server.", colors.blue],
  ] as const;
  return (
    <Scene duration={duration}>
      <div style={{ position: "absolute", left: 110, right: 110, top: 170 }}>
        <Eyebrow>Launch path / verified boundaries</Eyebrow>
        <div style={{ marginTop: 16, font: "650 63px Bahnschrift, sans-serif" }}>Official Codex stays intact.</div>
        <div style={{ display: "flex", gap: 22, marginTop: 70 }}>
          {cards.map(([index, title, detail, accent], cardIndex) => {
            const progress = interpolate(frame, [(0.5 + cardIndex * 0.45) * fps, (1.2 + cardIndex * 0.45) * fps], [0, 1], { ...clamp, easing: ease });
            return <ProcessCard key={index} index={index} title={title} detail={detail} accent={accent} progress={progress} />;
          })}
        </div>
        <div style={{ marginTop: 45, display: "flex", alignItems: "center", gap: 18, color: colors.paperMuted, font: "20px 'Cascadia Mono', monospace" }}>
          <span style={{ color: colors.green }}>●</span> 127.0.0.1 only
          <span style={{ color: colors.rule }}>／</span> exact version allowlist
          <span style={{ color: colors.rule }}>／</span> kill-on-close job object
        </div>
      </div>
    </Scene>
  );
};

const treeRows = [
  { depth: 0, name: "src", kind: "dir", badge: "" },
  { depth: 1, name: "adapters", kind: "dir", badge: "" },
  { depth: 2, name: "codex-26.715.ts", kind: "file", badge: "M" },
  { depth: 1, name: "explorer-element.ts", kind: "file", badge: "M" },
  { depth: 1, name: "tree-model.ts", kind: "file", badge: "" },
  { depth: 0, name: "crates", kind: "dir", badge: "" },
  { depth: 1, name: "cdp-client", kind: "dir", badge: "" },
  { depth: 1, name: "workspace-service", kind: "dir", badge: "A" },
  { depth: 0, name: "README.md", kind: "file", badge: "R" },
];

const badgeColor: Record<string, string> = { A: colors.green, M: colors.signal, D: colors.red, R: colors.blue };

const AppMock = ({ frame }: { frame: number }) => {
  const { fps } = useVideoConfig();
  const reveal = interpolate(frame, [0.4 * fps, 1.2 * fps], [0, 1], { ...clamp, easing: ease });
  const cursorY = interpolate(frame, [3 * fps, 7 * fps, 10 * fps], [215, 325, 460], { ...clamp, easing: ease });
  return (
    <div style={{ position: "absolute", left: 92, right: 92, top: 145, bottom: 105, border: `1px solid ${colors.rule}`, background: "#101418", boxShadow: "0 30px 90px rgba(0,0,0,.35)", opacity: reveal, transform: `scale(${0.97 + reveal * 0.03})` }}>
      <div style={{ height: 50, borderBottom: `1px solid ${colors.rule}`, display: "flex", alignItems: "center", gap: 9, padding: "0 18px" }}>
        {[colors.red, colors.signal, colors.green].map((color) => <span key={color} style={{ width: 10, height: 10, borderRadius: "50%", background: color, opacity: 0.75 }} />)}
        <span style={{ marginLeft: 18, color: colors.paperMuted, font: "14px 'Cascadia Mono', monospace" }}>Codex Desktop · local task</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "260px 430px 1fr", height: "calc(100% - 51px)" }}>
        <div style={{ borderRight: `1px solid ${colors.rule}`, padding: 22 }}>
          <div style={{ color: colors.paperMuted, font: "13px 'Cascadia Mono', monospace", letterSpacing: 1.5 }}>TASKS</div>
          {["Release hardening", "Explorer filters", "Watcher tests", "Packaging"].map((task, index) => (
            <div key={task} style={{ marginTop: 15, padding: "12px 10px", background: index === 0 ? "#263039" : "transparent", borderLeft: index === 0 ? `3px solid ${colors.signal}` : "3px solid transparent", font: "18px Bahnschrift, sans-serif" }}>{task}</div>
          ))}
        </div>
        <div style={{ borderRight: `1px solid ${colors.rule}`, position: "relative", overflow: "hidden" }}>
          <div style={{ padding: "22px 24px", borderBottom: `1px solid ${colors.rule}` }}>
            <div style={{ color: colors.signal, font: "12px 'Cascadia Mono', monospace", letterSpacing: 1.5 }}>LIVE PROJECT / READ ONLY</div>
            <div style={{ marginTop: 8, font: "600 25px Bahnschrift, sans-serif" }}>Code-Codex</div>
            <div style={{ color: colors.paperMuted, font: "14px 'Cascadia Mono', monospace", marginTop: 5 }}>E:\…\Code-Codex</div>
          </div>
          <div style={{ paddingTop: 10 }}>
            {treeRows.map((row, index) => {
              const rowProgress = interpolate(frame, [(1.2 + index * 0.16) * fps, (1.6 + index * 0.16) * fps], [0, 1], { ...clamp, easing: ease });
              const activeBadge = frame > 6 * fps && row.name === "tree-model.ts" ? "D" : row.badge;
              return (
                <div key={row.name} style={{ height: 40, display: "flex", alignItems: "center", paddingLeft: 22 + row.depth * 22, paddingRight: 20, opacity: rowProgress, transform: `translateX(${(1 - rowProgress) * -16}px)`, color: activeBadge === "D" ? colors.paperMuted : colors.paper }}>
                  <span style={{ width: 25, color: row.kind === "dir" ? colors.signal : colors.paperMuted }}>{row.kind === "dir" ? "▾" : "·"}</span>
                  <span style={{ font: "17px 'Cascadia Mono', monospace", textDecoration: activeBadge === "D" ? "line-through" : "none" }}>{row.name}</span>
                  {activeBadge && <span style={{ marginLeft: "auto", color: badgeColor[activeBadge], font: "700 15px 'Cascadia Mono', monospace" }}>{activeBadge}</span>}
                </div>
              );
            })}
          </div>
          <div style={{ position: "absolute", left: 8, top: cursorY, width: 3, height: 32, background: colors.signal }} />
        </div>
        <div style={{ padding: "58px 72px" }}>
          <div style={{ font: "600 43px/1.15 Bahnschrift, sans-serif", maxWidth: 620 }}>Finish the release hardening and verify the artifacts.</div>
          <div style={{ marginTop: 36, color: colors.paperMuted, font: "24px/1.55 Bahnschrift, sans-serif", maxWidth: 720 }}>The tree stays beside the conversation. It loads one directory at a time, marks changes, and previews up to 64 KiB of selected UTF-8 text.</div>
          <div style={{ marginTop: 46, borderLeft: `3px solid ${colors.green}`, paddingLeft: 22, color: colors.green, font: "19px 'Cascadia Mono', monospace" }}>WATCHING · 150 ms coalescing window</div>
        </div>
      </div>
    </div>
  );
};

const LiveTree = ({ duration }: { duration: number }) => {
  const frame = useCurrentFrame();
  return (
    <Scene duration={duration}>
      <AppMock frame={frame} />
    </Scene>
  );
};

const TaskSwitch = ({ duration }: { duration: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const switchProgress = interpolate(frame, [3.8 * fps, 5.2 * fps], [0, 1], { ...clamp, easing: ease });
  const cloudProgress = interpolate(frame, [8.3 * fps, 9.2 * fps], [0, 1], { ...clamp, easing: ease });
  const rootA = interpolate(switchProgress, [0, 1], [0, -620]);
  const rootB = interpolate(switchProgress, [0, 1], [620, 0]);
  return (
    <Scene duration={duration}>
      <div style={{ position: "absolute", left: 135, right: 135, top: 190 }}>
        <Eyebrow>Context follows selection</Eyebrow>
        <div style={{ marginTop: 15, font: "650 68px Bahnschrift, sans-serif" }}>A → B, with the old watcher gone first.</div>
        <div style={{ marginTop: 80, height: 390, border: `1px solid ${colors.rule}`, position: "relative", overflow: "hidden", background: colors.graphiteRaised }}>
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", transform: `translateX(${rootA}px)`, opacity: 1 - cloudProgress }}>
            <RootCard label="TASK A" project="api-service" paths={["src", "migrations", "Cargo.toml"]} color={colors.signal} />
          </div>
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", transform: `translateX(${rootB}px)`, opacity: 1 - cloudProgress }}>
            <RootCard label="TASK B" project="web-client" paths={["app", "public", "package.json"]} color={colors.cyan} />
          </div>
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", opacity: cloudProgress }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ color: colors.paperMuted, font: "18px 'Cascadia Mono', monospace", letterSpacing: 2 }}>CLOUD TASK</div>
              <div style={{ marginTop: 18, font: "600 45px Bahnschrift, sans-serif" }}>No local project is exposed.</div>
              <div style={{ marginTop: 18, color: colors.green, font: "18px 'Cascadia Mono', monospace" }}>WATCHER STOPPED · CONTEXT REVOKED</div>
            </div>
          </div>
        </div>
      </div>
    </Scene>
  );
};

const RootCard = ({ label, project, paths, color }: { label: string; project: string; paths: string[]; color: string }) => (
  <div style={{ width: 760, display: "grid", gridTemplateColumns: "210px 1fr", border: `1px solid ${colors.rule}`, background: "#151a1f" }}>
    <div style={{ padding: 32, borderRight: `1px solid ${colors.rule}`, color, font: "18px 'Cascadia Mono', monospace" }}>{label}</div>
    <div style={{ padding: 32 }}>
      <div style={{ font: "600 37px Bahnschrift, sans-serif" }}>{project}</div>
      <div style={{ marginTop: 22, display: "flex", gap: 12 }}>{paths.map((path) => <span key={path} style={{ border: `1px solid ${colors.rule}`, padding: "9px 13px", color: colors.paperMuted, font: "15px 'Cascadia Mono', monospace" }}>{path}</span>)}</div>
    </div>
  </div>
);

const Controls = ({ duration }: { duration: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const panelWidth = interpolate(frame, [1 * fps, 4 * fps, 7 * fps], [310, 505, 390], { ...clamp, easing: ease });
  const showHidden = frame >= 4.5 * fps;
  const showIgnored = frame >= 6 * fps;
  const drawer = frame >= 9 * fps;
  return (
    <Scene duration={duration}>
      <div style={{ position: "absolute", left: 120, right: 120, top: 160 }}>
        <Eyebrow>Precision controls / preferences persist</Eyebrow>
        <div style={{ marginTop: 16, font: "650 64px Bahnschrift, sans-serif" }}>Quiet controls, explicit state.</div>
        <div style={{ marginTop: 60, display: "flex", gap: 55, alignItems: "stretch" }}>
          <div style={{ width: drawer ? 470 : panelWidth, height: 500, border: `1px solid ${colors.rule}`, background: colors.graphiteRaised, padding: 28, boxShadow: drawer ? "22px 0 60px rgba(0,0,0,.45)" : "none" }}>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${colors.rule}`, paddingBottom: 20 }}>
              <div><div style={{ color: colors.signal, font: "12px 'Cascadia Mono', monospace" }}>LIVE PROJECT</div><div style={{ marginTop: 8, font: "600 27px Bahnschrift, sans-serif" }}>web-client</div></div>
              <span style={{ color: colors.paperMuted, font: "22px sans-serif" }}>×</span>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
              <Toggle active={showHidden} label="Hidden" />
              <Toggle active={showIgnored} label="Ignored" />
            </div>
            {["app", "components", showHidden ? ".env.local" : "styles", showIgnored ? "dist" : "tests", "package.json"].map((name, index) => <div key={`${name}-${index}`} style={{ marginTop: 20, color: index < 2 ? colors.paper : colors.paperMuted, font: "18px 'Cascadia Mono', monospace" }}>{index < 2 ? "▾" : "·"} {name}</div>)}
          </div>
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <Feature label="180—480 px" title="Resizable" copy="The saved preference is never permanently clamped by a narrow window." />
            <Feature label="≤ 820 px" title="Drawer mode" copy="The conversation input stays visible when the host window narrows." />
            <Feature label="KEYBOARD" title="Navigable" copy="Arrows, Home/End, typeahead, focus rings, and Escape behavior." />
            <Feature label="REDUCED MOTION" title="Respectful" copy="Animation stops when the operating system asks for restraint." />
          </div>
        </div>
      </div>
    </Scene>
  );
};

const Toggle = ({ active, label }: { active: boolean; label: string }) => (
  <div style={{ padding: "10px 14px", border: `1px solid ${active ? colors.signal : colors.rule}`, color: active ? colors.signal : colors.paperMuted, font: "15px 'Cascadia Mono', monospace" }}>{active ? "■" : "□"} {label}</div>
);

const Feature = ({ label, title, copy }: { label: string; title: string; copy: string }) => (
  <div style={{ border: `1px solid ${colors.rule}`, padding: 25, background: "rgba(30,36,41,.72)" }}>
    <div style={{ color: colors.cyan, font: "14px 'Cascadia Mono', monospace", letterSpacing: 1.5 }}>{label}</div>
    <div style={{ marginTop: 12, font: "600 28px Bahnschrift, sans-serif" }}>{title}</div>
    <div style={{ marginTop: 10, color: colors.paperMuted, font: "19px/1.4 Bahnschrift, sans-serif" }}>{copy}</div>
  </div>
);

const Security = ({ duration }: { duration: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nodes = [
    ["Renderer", "relative paths only", colors.blue],
    ["Capability gate", "token · rate · queue", colors.signal],
    ["Workspace handle", "no-follow containment", colors.cyan],
    ["Text preview", "allowlist · UTF-8 · 64 KiB", colors.green],
  ] as const;
  return (
    <Scene duration={duration}>
      <div style={{ position: "absolute", left: 115, right: 115, top: 155 }}>
        <Eyebrow>Security boundary / deliberately narrow</Eyebrow>
        <div style={{ marginTop: 16, font: "650 66px Bahnschrift, sans-serif" }}>Selected text, tightly bounded.</div>
        <div style={{ display: "flex", gap: 26, marginTop: 80, alignItems: "center" }}>
          {nodes.map(([title, detail, color], index) => {
            const progress = interpolate(frame, [(0.6 + index * 0.55) * fps, (1.25 + index * 0.55) * fps], [0, 1], { ...clamp, easing: ease });
            return (
              <div key={title} style={{ display: "flex", alignItems: "center", gap: 26, opacity: progress }}>
                <div style={{ width: 330, minHeight: 180, border: `1px solid ${color}`, padding: 26, background: colors.graphiteRaised }}>
                  <div style={{ color, font: "14px 'Cascadia Mono', monospace", letterSpacing: 1.4 }}>0{index + 1}</div>
                  <div style={{ marginTop: 22, font: "600 28px Bahnschrift, sans-serif" }}>{title}</div>
                  <div style={{ marginTop: 10, color: colors.paperMuted, font: "17px 'Cascadia Mono', monospace" }}>{detail}</div>
                </div>
                {index < nodes.length - 1 && <div style={{ color: colors.rule, font: "34px 'Cascadia Mono', monospace" }}>→</div>}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 15, flexWrap: "wrap", marginTop: 65 }}>
          {["NO arbitrary readFile", "NO writeFile", "NO shell", "NO absolute root", "NO link traversal", "NO unknown Codex version"].map((item) => <span key={item} style={{ border: `1px solid ${colors.red}`, color: colors.red, padding: "12px 16px", font: "16px 'Cascadia Mono', monospace" }}>{item}</span>)}
        </div>
      </div>
    </Scene>
  );
};

const Release = ({ duration }: { duration: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = interpolate(frame, [0.4 * fps, 1.3 * fps], [0, 1], { ...clamp, easing: ease });
  const checks = ["62+ Rust checks", "16 UI tests", "10k / 100k bounds", "ZIP + per-user MSI", "SPDX + license texts"];
  return (
    <Scene duration={duration}>
      <div style={{ position: "absolute", left: 150, right: 150, top: 220, opacity: progress, transform: `translateY(${(1 - progress) * 30}px)` }}>
        <Eyebrow>Code-Codex 0.1.0</Eyebrow>
        <div style={{ marginTop: 18, font: "700 94px/1 Bahnschrift, sans-serif", letterSpacing: -3 }}>Read-only. Local-first. Live.</div>
        <div style={{ marginTop: 48, color: colors.paperMuted, font: "31px/1.45 Bahnschrift, sans-serif", maxWidth: 1120 }}>Launch the verified Codex Beta package. Select a local task. Keep the project structure in sight while the agent works.</div>
        <div style={{ marginTop: 58, display: "flex", gap: 14, flexWrap: "wrap" }}>
          {checks.map((check, index) => {
            const visible = interpolate(frame, [(1.6 + index * 0.3) * fps, (2.1 + index * 0.3) * fps], [0, 1], { ...clamp, easing: ease });
            return <div key={check} style={{ opacity: visible, border: `1px solid ${colors.rule}`, borderTop: `4px solid ${index === 4 ? colors.signal : colors.green}`, padding: "18px 22px", background: colors.graphiteRaised, font: "18px 'Cascadia Mono', monospace" }}>✓ {check}</div>;
          })}
        </div>
        <div style={{ marginTop: 55, color: colors.signal, font: "20px 'Cascadia Mono', monospace", letterSpacing: 1.7 }}>UNOFFICIAL COMMUNITY PROJECT · WINDOWS 11 X64</div>
      </div>
    </Scene>
  );
};

type Segment = { from: number; duration: number; component: ReactNode };

export const CodeCodexDemo: React.FC = () => {
  const { fps } = useVideoConfig();
  const seconds = (value: number) => Math.round(value * fps);
  const segments: Segment[] = [
    { from: 0, duration: seconds(8), component: <Intro duration={seconds(8)} /> },
    { from: seconds(8), duration: seconds(12), component: <LaunchFlow duration={seconds(12)} /> },
    { from: seconds(20), duration: seconds(20), component: <LiveTree duration={seconds(20)} /> },
    { from: seconds(40), duration: seconds(12), component: <TaskSwitch duration={seconds(12)} /> },
    { from: seconds(52), duration: seconds(13), component: <Controls duration={seconds(13)} /> },
    { from: seconds(65), duration: seconds(14), component: <Security duration={seconds(14)} /> },
    { from: seconds(79), duration: seconds(11), component: <Release duration={seconds(11)} /> },
  ];
  return (
    <Shell>
      {segments.map((segment) => (
        <Sequence key={segment.from} from={segment.from} durationInFrames={segment.duration} premountFor={fps}>
          {segment.component}
        </Sequence>
      ))}
    </Shell>
  );
};
