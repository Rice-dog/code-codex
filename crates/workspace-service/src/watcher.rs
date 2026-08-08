use std::collections::{BTreeMap, HashSet};
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::time::Duration;

use notify::event::{CreateKind, ModifyKind, RemoveKind, RenameMode};
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

use crate::Workspace;
use crate::error::WorkspaceError;
use crate::listing::is_default_ignored_path;
use crate::path_guard::relative_for_event;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ChangeKind {
    Added,
    Modified,
    Deleted,
    Renamed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Change {
    pub relative_path: String,
    pub kind: ChangeKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_relative_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ChangeBatch {
    pub changes: Vec<Change>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub resync: bool,
}

const fn is_false(value: &bool) -> bool {
    !*value
}

const MAX_RAW_EVENTS_PER_WINDOW: usize = 2_048;
const MAX_CHANGES_PER_BATCH: usize = 1_024;
const SHOW_HIDDEN_BIT: u8 = 0x1;
const SHOW_IGNORED_BIT: u8 = 0x2;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct WatchVisibility {
    pub show_hidden: bool,
    pub show_ignored: bool,
}

impl WatchVisibility {
    const fn bits(self) -> u8 {
        (if self.show_hidden { SHOW_HIDDEN_BIT } else { 0 })
            | (if self.show_ignored {
                SHOW_IGNORED_BIT
            } else {
                0
            })
    }

    const fn from_bits(bits: u8) -> Self {
        Self {
            show_hidden: bits & SHOW_HIDDEN_BIT != 0,
            show_ignored: bits & SHOW_IGNORED_BIT != 0,
        }
    }
}

enum RawWatchInput {
    Event(Event),
    Resync,
}

#[derive(Clone)]
pub struct WatchVisibilityHandle {
    bits: Arc<AtomicU8>,
    raw_sender: mpsc::Sender<RawWatchInput>,
    overflowed: Arc<AtomicBool>,
}

impl WatchVisibilityHandle {
    #[must_use]
    pub fn current(&self) -> WatchVisibility {
        WatchVisibility::from_bits(self.bits.load(Ordering::Acquire))
    }

    /// Applies visibility changes to the active callback without recreating
    /// the platform watcher. A resync marker makes already-rendered state
    /// converge to the new policy.
    pub fn update(&self, visibility: WatchVisibility) {
        let previous = self.bits.swap(visibility.bits(), Ordering::AcqRel);
        if previous != visibility.bits() && self.raw_sender.try_send(RawWatchInput::Resync).is_err()
        {
            self.overflowed.store(true, Ordering::Release);
        }
    }
}

#[derive(Default)]
struct ChangeAccumulator {
    raw_events: usize,
    changes: Vec<Change>,
    resync_only: bool,
}

impl ChangeAccumulator {
    fn push(&mut self, root: &std::path::Path, event: &Event) {
        if self.resync_only {
            return;
        }
        if self.raw_events >= MAX_RAW_EVENTS_PER_WINDOW {
            self.switch_to_resync();
            return;
        }
        self.raw_events += 1;

        let remaining = MAX_CHANGES_PER_BATCH.saturating_sub(self.changes.len());
        match normalize_event_bounded(root, event, remaining) {
            Ok(changes) => self.changes.extend(changes),
            Err(()) => self.switch_to_resync(),
        }
    }

    fn switch_to_resync(&mut self) {
        self.changes.clear();
        self.resync_only = true;
    }
}

pub struct WatchSubscription {
    pub receiver: mpsc::Receiver<ChangeBatch>,
    pub visibility: WatchVisibilityHandle,
    _watcher: RecommendedWatcher,
    cancellation: CancellationToken,
    task: JoinHandle<()>,
}

impl Drop for WatchSubscription {
    fn drop(&mut self) {
        self.cancellation.cancel();
        self.task.abort();
    }
}

pub struct WorkspaceWatcher;

impl WorkspaceWatcher {
    pub fn subscribe(
        workspace: Arc<Workspace>,
        debounce: Duration,
    ) -> Result<WatchSubscription, WorkspaceError> {
        Self::subscribe_with_visibility(workspace, debounce, WatchVisibility::default())
    }

    pub fn subscribe_with_visibility(
        workspace: Arc<Workspace>,
        debounce: Duration,
        visibility: WatchVisibility,
    ) -> Result<WatchSubscription, WorkspaceError> {
        if !workspace.root_is_valid() {
            return Err(WorkspaceError::OutsideWorkspace);
        }
        let debounce = debounce.clamp(Duration::from_millis(100), Duration::from_millis(250));
        let (raw_sender, raw_receiver) = mpsc::channel(2_048);
        let overflowed = Arc::new(AtomicBool::new(false));
        let callback_overflowed = overflowed.clone();
        let visibility_bits = Arc::new(AtomicU8::new(visibility.bits()));
        let callback_visibility = visibility_bits.clone();
        let callback_root = workspace.root_path().to_path_buf();
        let callback_workspace = workspace.clone();
        let visibility = WatchVisibilityHandle {
            bits: visibility_bits,
            raw_sender: raw_sender.clone(),
            overflowed: overflowed.clone(),
        };
        let mut watcher = notify::recommended_watcher(move |result: notify::Result<Event>| {
            // A full channel means an event storm. Sending a rescan marker is
            // preferable to blocking notify's platform callback thread.
            let input = match result {
                Ok(event) => match filter_event_with_active_staging(
                    &callback_root,
                    &event,
                    WatchVisibility::from_bits(callback_visibility.load(Ordering::Acquire)),
                    &callback_workspace.active_import_staging_names(),
                ) {
                    FilteredEvent::Drop => return,
                    FilteredEvent::Resync => RawWatchInput::Resync,
                    FilteredEvent::Event(event) => RawWatchInput::Event(event),
                },
                Err(_) => RawWatchInput::Resync,
            };
            if raw_sender.try_send(input).is_err() {
                callback_overflowed.store(true, Ordering::Release);
            }
        })
        .map_err(|_| WorkspaceError::Internal)?;
        watcher
            .watch(workspace.root_path(), RecursiveMode::Recursive)
            .map_err(|_| WorkspaceError::AccessDenied)?;

        let (batch_sender, batch_receiver) = mpsc::channel(128);
        let cancellation = CancellationToken::new();
        let task_cancellation = cancellation.clone();
        let task = tokio::spawn(async move {
            debounce_events(
                workspace,
                raw_receiver,
                batch_sender,
                debounce,
                task_cancellation,
                overflowed,
            )
            .await;
        });

        Ok(WatchSubscription {
            receiver: batch_receiver,
            visibility,
            _watcher: watcher,
            cancellation,
            task,
        })
    }
}

async fn debounce_events(
    workspace: Arc<Workspace>,
    mut raw_receiver: mpsc::Receiver<RawWatchInput>,
    batch_sender: mpsc::Sender<ChangeBatch>,
    debounce: Duration,
    cancellation: CancellationToken,
    overflowed: Arc<AtomicBool>,
) {
    loop {
        if !workspace.root_is_valid() {
            let _ = batch_sender
                .send(ChangeBatch {
                    changes: Vec::new(),
                    resync: true,
                })
                .await;
            break;
        }
        let first = tokio::select! {
            () = cancellation.cancelled() => break,
            event = raw_receiver.recv() => match event {
                Some(event) => event,
                None => break,
            },
        };
        let mut accumulator = ChangeAccumulator::default();
        match first {
            RawWatchInput::Event(event) => accumulator.push(workspace.root_path(), &event),
            RawWatchInput::Resync => accumulator.switch_to_resync(),
        }
        let timer = tokio::time::sleep(debounce);
        tokio::pin!(timer);
        loop {
            if accumulator.resync_only {
                tokio::select! {
                    () = cancellation.cancelled() => return,
                    () = &mut timer => {},
                }
                break;
            }
            tokio::select! {
                () = cancellation.cancelled() => return,
                () = &mut timer => break,
                event = raw_receiver.recv() => match event {
                    Some(RawWatchInput::Event(event)) => accumulator.push(workspace.root_path(), &event),
                    Some(RawWatchInput::Resync) => accumulator.switch_to_resync(),
                    None => break,
                }
            }
        }
        let callback_overflowed = overflowed.swap(false, Ordering::AcqRel);
        let root_valid = workspace.root_is_valid();
        let resync = accumulator.resync_only || callback_overflowed || !root_valid;
        if resync {
            for _ in 0..MAX_RAW_EVENTS_PER_WINDOW {
                if raw_receiver.try_recv().is_err() {
                    break;
                }
            }
        }
        let changes = if resync {
            Vec::new()
        } else {
            coalesce(accumulator.changes)
        };
        if (!changes.is_empty() || resync)
            && batch_sender
                .send(ChangeBatch { changes, resync })
                .await
                .is_err()
        {
            break;
        }
        if !root_valid {
            break;
        }
    }
}

enum FilteredEvent {
    Drop,
    Resync,
    Event(Event),
}

#[cfg(test)]
fn filter_event(root: &Path, event: &Event, visibility: WatchVisibility) -> FilteredEvent {
    filter_event_with_active_staging(root, event, visibility, &HashSet::new())
}

fn filter_event_with_active_staging(
    root: &Path,
    event: &Event,
    visibility: WatchVisibility,
    active_staging_names: &HashSet<String>,
) -> FilteredEvent {
    if event.paths.len() > MAX_CHANGES_PER_BATCH || matches!(event.kind, EventKind::Other) {
        return FilteredEvent::Resync;
    }

    let relative_paths: Vec<_> = event
        .paths
        .iter()
        .map(|path| relative_for_event(root, path))
        .collect();
    if relative_paths
        .iter()
        .flatten()
        .any(|path| is_ignore_control_path(path))
    {
        return FilteredEvent::Resync;
    }

    if matches!(
        event.kind,
        EventKind::Modify(ModifyKind::Name(RenameMode::Both))
    ) && event.paths.len() >= 2
    {
        let old_visible = relative_paths
            .first()
            .and_then(Option::as_deref)
            .is_some_and(|path| path_is_visible(path, visibility, active_staging_names));
        let new_visible = relative_paths
            .get(1)
            .and_then(Option::as_deref)
            .is_some_and(|path| path_is_visible(path, visibility, active_staging_names));
        let mut filtered = event.clone();
        match (old_visible, new_visible) {
            (true, true) => {
                filtered.paths.truncate(2);
                return FilteredEvent::Event(filtered);
            }
            (true, false) => {
                filtered.kind = EventKind::Remove(RemoveKind::Any);
                filtered.paths = vec![event.paths[0].clone()];
                return FilteredEvent::Event(filtered);
            }
            (false, true) => {
                filtered.kind = EventKind::Create(CreateKind::Any);
                filtered.paths = vec![event.paths[1].clone()];
                return FilteredEvent::Event(filtered);
            }
            (false, false) => return FilteredEvent::Drop,
        }
    }

    let paths: Vec<_> = event
        .paths
        .iter()
        .zip(relative_paths)
        .filter_map(|(path, relative)| {
            relative
                .is_some_and(|relative| {
                    path_is_visible(&relative, visibility, active_staging_names)
                })
                .then(|| path.clone())
        })
        .collect();
    if paths.is_empty() {
        FilteredEvent::Drop
    } else {
        let mut filtered = event.clone();
        filtered.paths = paths;
        FilteredEvent::Event(filtered)
    }
}

fn path_is_visible(
    relative_path: &str,
    visibility: WatchVisibility,
    active_staging_names: &HashSet<String>,
) -> bool {
    !relative_path
        .split('/')
        .next()
        .is_some_and(|component| active_staging_names.contains(component))
        && (visibility.show_hidden
            || !relative_path
                .split('/')
                .any(|component| component.starts_with('.')))
        && (visibility.show_ignored || !is_default_ignored_path(relative_path))
}

fn is_ignore_control_path(relative_path: &str) -> bool {
    let components: Vec<_> = relative_path.split('/').collect();
    components.last() == Some(&".gitignore")
        || components
            .windows(3)
            .any(|parts| parts[0] == ".git" && parts[1] == "info" && parts[2] == "exclude")
}

#[cfg(test)]
fn normalize_event(root: &std::path::Path, event: &Event) -> Vec<Change> {
    normalize_event_bounded(root, event, usize::MAX).unwrap_or_default()
}

fn normalize_event_bounded(
    root: &std::path::Path,
    event: &Event,
    limit: usize,
) -> Result<Vec<Change>, ()> {
    if matches!(
        event.kind,
        EventKind::Access(_) | EventKind::Modify(ModifyKind::Metadata(_))
    ) {
        return Ok(Vec::new());
    }

    if matches!(
        event.kind,
        EventKind::Modify(ModifyKind::Name(RenameMode::Both))
    ) && event.paths.len() >= 2
    {
        let old = relative_for_event(root, &event.paths[0]);
        let new = relative_for_event(root, &event.paths[1]);
        if let (Some(old_relative_path), Some(relative_path)) = (old, new) {
            if limit == 0 {
                return Err(());
            }
            return Ok(vec![Change {
                relative_path,
                kind: ChangeKind::Renamed,
                old_relative_path: Some(old_relative_path),
            }]);
        }
    }

    let kind = match event.kind {
        EventKind::Create(_) => ChangeKind::Added,
        EventKind::Remove(_) => ChangeKind::Deleted,
        EventKind::Modify(ModifyKind::Name(RenameMode::From)) => ChangeKind::Deleted,
        EventKind::Modify(ModifyKind::Name(RenameMode::To)) => ChangeKind::Added,
        EventKind::Modify(_) => ChangeKind::Modified,
        _ => ChangeKind::Modified,
    };
    let mut changes = Vec::new();
    for relative_path in event
        .paths
        .iter()
        .filter_map(|path| relative_for_event(root, path))
        .filter(|path| !path.is_empty())
    {
        if changes.len() >= limit {
            return Err(());
        }
        changes.push(Change {
            relative_path,
            kind,
            old_relative_path: None,
        });
    }
    Ok(changes)
}

fn coalesce(changes: Vec<Change>) -> Vec<Change> {
    let mut by_path = BTreeMap::new();
    for change in changes {
        by_path
            .entry(change.relative_path.clone())
            .and_modify(|existing: &mut Change| {
                if precedence(change.kind) >= precedence(existing.kind) {
                    *existing = change.clone();
                }
            })
            .or_insert(change);
    }
    by_path.into_values().collect()
}

const fn precedence(kind: ChangeKind) -> u8 {
    match kind {
        ChangeKind::Modified => 0,
        ChangeKind::Added => 1,
        ChangeKind::Deleted => 2,
        ChangeKind::Renamed => 3,
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use notify::event::{CreateKind, DataChange, MetadataKind, RemoveKind};
    use tempfile::TempDir;

    use super::*;

    async fn receive_change(
        receiver: &mut mpsc::Receiver<ChangeBatch>,
        relative_path: &str,
        expected: ChangeKind,
    ) -> Change {
        let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
        loop {
            let batch = tokio::time::timeout_at(deadline, receiver.recv())
                .await
                .expect("watch timeout")
                .expect("watch closed");
            if let Some(change) = batch
                .changes
                .into_iter()
                .find(|change| change.relative_path == relative_path && change.kind == expected)
            {
                return change;
            }
        }
    }

    #[test]
    fn normalizes_and_coalesces_event_storms() {
        let directory = TempDir::new().expect("temp dir");
        let path = directory.path().join("src/lib.rs");
        let create = Event::new(EventKind::Create(CreateKind::File)).add_path(path.clone());
        let modify = Event::new(EventKind::Modify(ModifyKind::Data(DataChange::Content)))
            .add_path(path.clone());
        let remove = Event::new(EventKind::Remove(RemoveKind::File)).add_path(path);
        let changes = [create, modify, remove]
            .iter()
            .flat_map(|event| normalize_event(directory.path(), event))
            .collect();
        let coalesced = coalesce(changes);
        assert_eq!(coalesced.len(), 1);
        assert_eq!(coalesced[0].kind, ChangeKind::Deleted);
    }

    #[test]
    fn normalizes_paired_rename_with_old_and_new_paths() {
        let directory = TempDir::new().expect("temp dir");
        let event = Event::new(EventKind::Modify(ModifyKind::Name(RenameMode::Both)))
            .add_path(directory.path().join("old.txt"))
            .add_path(directory.path().join("new.txt"));
        let changes = normalize_event(directory.path(), &event);
        assert_eq!(
            changes,
            vec![Change {
                relative_path: "new.txt".to_owned(),
                kind: ChangeKind::Renamed,
                old_relative_path: Some("old.txt".to_owned()),
            }]
        );
    }

    fn filtered_event(root: &Path, event: &Event, visibility: WatchVisibility) -> Event {
        match filter_event(root, event, visibility) {
            FilteredEvent::Event(event) => event,
            FilteredEvent::Drop => panic!("event was unexpectedly filtered"),
            FilteredEvent::Resync => panic!("event unexpectedly requested resync"),
        }
    }

    #[test]
    fn filters_hidden_and_default_ignored_storms_before_the_raw_queue() {
        let directory = TempDir::new().expect("temp dir");
        for index in 0..(MAX_RAW_EVENTS_PER_WINDOW * 4) {
            let hidden = Event::new(EventKind::Modify(ModifyKind::Data(DataChange::Any)))
                .add_path(directory.path().join(format!(".cache/item-{index}.txt")));
            assert!(matches!(
                filter_event(directory.path(), &hidden, WatchVisibility::default()),
                FilteredEvent::Drop
            ));
        }
        let ignored = Event::new(EventKind::Create(CreateKind::File))
            .add_path(directory.path().join("node_modules/package/index.js"));
        assert!(matches!(
            filter_event(directory.path(), &ignored, WatchVisibility::default()),
            FilteredEvent::Drop
        ));
    }

    #[test]
    fn visibility_crossing_renames_become_truthful_adds_or_deletes() {
        let directory = TempDir::new().expect("temp dir");
        let into_hidden = Event::new(EventKind::Modify(ModifyKind::Name(RenameMode::Both)))
            .add_path(directory.path().join("visible.txt"))
            .add_path(directory.path().join(".hidden.txt"));
        let changes = normalize_event(
            directory.path(),
            &filtered_event(directory.path(), &into_hidden, WatchVisibility::default()),
        );
        assert_eq!(
            changes,
            vec![Change {
                relative_path: "visible.txt".to_owned(),
                kind: ChangeKind::Deleted,
                old_relative_path: None,
            }]
        );

        let out_of_ignored = Event::new(EventKind::Modify(ModifyKind::Name(RenameMode::Both)))
            .add_path(directory.path().join("target/generated.txt"))
            .add_path(directory.path().join("kept.txt"));
        let changes = normalize_event(
            directory.path(),
            &filtered_event(
                directory.path(),
                &out_of_ignored,
                WatchVisibility::default(),
            ),
        );
        assert_eq!(
            changes,
            vec![Change {
                relative_path: "kept.txt".to_owned(),
                kind: ChangeKind::Added,
                old_relative_path: None,
            }]
        );

        let visible = filtered_event(
            directory.path(),
            &into_hidden,
            WatchVisibility {
                show_hidden: true,
                show_ignored: false,
            },
        );
        assert_eq!(
            normalize_event(directory.path(), &visible)[0].kind,
            ChangeKind::Renamed
        );
    }

    #[test]
    fn watcher_hides_only_registered_root_import_staging() {
        let directory = TempDir::new().expect("temp dir");
        let active_name = format!("{}active", crate::mutation::IMPORT_STAGING_PREFIX);
        let event = Event::new(EventKind::Create(CreateKind::File))
            .add_path(directory.path().join(&active_name));
        let active = HashSet::from([active_name.clone()]);
        assert!(matches!(
            filter_event_with_active_staging(
                directory.path(),
                &event,
                WatchVisibility {
                    show_hidden: true,
                    show_ignored: true,
                },
                &active,
            ),
            FilteredEvent::Drop
        ));

        assert!(matches!(
            filter_event_with_active_staging(
                directory.path(),
                &event,
                WatchVisibility {
                    show_hidden: true,
                    show_ignored: true,
                },
                &HashSet::new(),
            ),
            FilteredEvent::Event(_)
        ));

        let nested = Event::new(EventKind::Create(CreateKind::File))
            .add_path(directory.path().join("container").join(&active_name));
        assert!(matches!(
            filter_event_with_active_staging(
                directory.path(),
                &nested,
                WatchVisibility {
                    show_hidden: true,
                    show_ignored: true,
                },
                &active,
            ),
            FilteredEvent::Event(_)
        ));
    }

    #[test]
    fn ignore_control_changes_request_resync_even_when_hidden() {
        let directory = TempDir::new().expect("temp dir");
        for relative in [".gitignore", "nested/.gitignore", ".git/info/exclude"] {
            let event = Event::new(EventKind::Modify(ModifyKind::Data(DataChange::Any)))
                .add_path(directory.path().join(relative));
            assert!(matches!(
                filter_event(directory.path(), &event, WatchVisibility::default()),
                FilteredEvent::Resync
            ));
        }
    }

    #[tokio::test]
    async fn visibility_policy_updates_without_recreating_the_subscription() {
        let directory = TempDir::new().expect("temp dir");
        let (raw_sender, mut raw_receiver) = mpsc::channel(4);
        let overflowed = Arc::new(AtomicBool::new(false));
        let handle = WatchVisibilityHandle {
            bits: Arc::new(AtomicU8::new(WatchVisibility::default().bits())),
            raw_sender,
            overflowed: overflowed.clone(),
        };
        handle.update(WatchVisibility {
            show_hidden: true,
            show_ignored: false,
        });
        assert!(matches!(
            raw_receiver.recv().await,
            Some(RawWatchInput::Resync)
        ));
        let hidden = Event::new(EventKind::Create(CreateKind::File))
            .add_path(directory.path().join(".visible-now.txt"));
        assert!(matches!(
            filter_event(directory.path(), &hidden, handle.current()),
            FilteredEvent::Event(_)
        ));

        handle.update(WatchVisibility {
            show_hidden: true,
            show_ignored: true,
        });
        assert!(matches!(
            raw_receiver.recv().await,
            Some(RawWatchInput::Resync)
        ));
        let ignored = Event::new(EventKind::Create(CreateKind::File))
            .add_path(directory.path().join("target/output.bin"));
        assert!(matches!(
            filter_event(directory.path(), &ignored, handle.current()),
            FilteredEvent::Event(_)
        ));
        assert!(!overflowed.load(Ordering::Acquire));
    }

    #[test]
    fn synthetic_hot_stream_switches_to_resync_only_at_event_cap() {
        let directory = TempDir::new().expect("temp dir");
        let event = Event::new(EventKind::Modify(ModifyKind::Metadata(MetadataKind::Any)))
            .add_path(directory.path().join("metadata-only.txt"));
        let mut accumulator = ChangeAccumulator::default();
        for _ in 0..=MAX_RAW_EVENTS_PER_WINDOW {
            accumulator.push(directory.path(), &event);
        }
        assert!(accumulator.resync_only);
        assert!(accumulator.changes.is_empty());
        assert_eq!(accumulator.raw_events, MAX_RAW_EVENTS_PER_WINDOW);
    }

    #[test]
    fn oversized_normalized_event_cannot_create_an_unbounded_batch() {
        let directory = TempDir::new().expect("temp dir");
        let mut event = Event::new(EventKind::Modify(ModifyKind::Data(DataChange::Content)));
        for index in 0..=MAX_CHANGES_PER_BATCH {
            event = event.add_path(directory.path().join(format!("file-{index}.txt")));
        }
        let mut accumulator = ChangeAccumulator::default();
        accumulator.push(directory.path(), &event);
        assert!(accumulator.resync_only);
        assert!(accumulator.changes.is_empty());
    }

    #[tokio::test]
    async fn callback_overflow_emits_resync_without_partial_changes() {
        let directory = TempDir::new().expect("temp dir");
        let workspace = Arc::new(Workspace::open(directory.path()).expect("workspace"));
        let (raw_sender, raw_receiver) = mpsc::channel(2);
        raw_sender
            .send(RawWatchInput::Event(
                Event::new(EventKind::Create(CreateKind::File))
                    .add_path(directory.path().join("partial.txt")),
            ))
            .await
            .expect("queue event");
        drop(raw_sender);
        let (batch_sender, mut batch_receiver) = mpsc::channel(1);
        debounce_events(
            workspace,
            raw_receiver,
            batch_sender,
            Duration::from_millis(1),
            CancellationToken::new(),
            Arc::new(AtomicBool::new(true)),
        )
        .await;

        let batch = batch_receiver.recv().await.expect("resync batch");
        assert!(batch.resync);
        assert!(batch.changes.is_empty());
    }

    #[cfg(any(unix, windows))]
    #[tokio::test]
    async fn stale_root_identity_emits_one_resync_and_stops() {
        let parent = TempDir::new().expect("parent");
        let root = parent.path().join("workspace");
        let moved = parent.path().join("moved");
        fs::create_dir(&root).expect("root");
        let workspace = Arc::new(Workspace::open(&root).expect("workspace"));
        fs::rename(&root, &moved).expect("root move");
        let (_raw_sender, raw_receiver) = mpsc::channel(1);
        let (batch_sender, mut batch_receiver) = mpsc::channel(1);

        debounce_events(
            workspace,
            raw_receiver,
            batch_sender,
            Duration::from_millis(1),
            CancellationToken::new(),
            Arc::new(AtomicBool::new(false)),
        )
        .await;

        let batch = batch_receiver
            .recv()
            .await
            .expect("root invalidation batch");
        assert!(batch.resync);
        assert!(batch.changes.is_empty());
        assert!(batch_receiver.recv().await.is_none());
    }

    #[tokio::test]
    async fn emits_real_filesystem_changes() {
        let directory = TempDir::new().expect("temp dir");
        let workspace = Arc::new(Workspace::open(directory.path()).expect("workspace"));
        let mut subscription =
            WorkspaceWatcher::subscribe(workspace, Duration::from_millis(100)).expect("watch");
        fs::write(directory.path().join("created.txt"), "x").expect("create");
        receive_change(&mut subscription.receiver, "created.txt", ChangeKind::Added).await;
    }

    #[tokio::test]
    async fn emits_real_modify_and_delete_kinds() {
        let directory = TempDir::new().expect("temp dir");
        let path = directory.path().join("lifecycle.txt");
        fs::write(&path, "initial").expect("initial file");
        let workspace = Arc::new(Workspace::open(directory.path()).expect("workspace"));
        let mut subscription =
            WorkspaceWatcher::subscribe(workspace, Duration::from_millis(100)).expect("watch");

        fs::write(&path, "modified contents").expect("modify");
        receive_change(
            &mut subscription.receiver,
            "lifecycle.txt",
            ChangeKind::Modified,
        )
        .await;

        fs::remove_file(&path).expect("delete");
        receive_change(
            &mut subscription.receiver,
            "lifecycle.txt",
            ChangeKind::Deleted,
        )
        .await;
    }

    #[tokio::test]
    async fn emits_truthful_real_rename() {
        let directory = TempDir::new().expect("temp dir");
        let old = directory.path().join("before.txt");
        let new = directory.path().join("after.txt");
        fs::write(&old, "rename me").expect("initial file");
        let workspace = Arc::new(Workspace::open(directory.path()).expect("workspace"));
        let mut subscription =
            WorkspaceWatcher::subscribe(workspace, Duration::from_millis(100)).expect("watch");

        fs::rename(&old, &new).expect("rename");
        let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
        let mut saw_from = false;
        let mut saw_to = false;
        loop {
            let batch = tokio::time::timeout_at(deadline, subscription.receiver.recv())
                .await
                .expect("watch timeout")
                .expect("watch closed");
            for change in batch.changes {
                if change.kind == ChangeKind::Renamed
                    && change.relative_path == "after.txt"
                    && change.old_relative_path.as_deref() == Some("before.txt")
                {
                    return;
                }
                saw_from |=
                    change.kind == ChangeKind::Deleted && change.relative_path == "before.txt";
                saw_to |= change.kind == ChangeKind::Added && change.relative_path == "after.txt";
            }
            if saw_from && saw_to {
                // Some platform backends report the two truthful halves of a
                // rename instead of a paired notification.
                return;
            }
        }
    }
}
