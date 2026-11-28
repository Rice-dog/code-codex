//! Hold only this launch's native window presentation until the existing
//! player reports its first frame. A nonzero alpha lets Chromium keep painting.
use std::{
    cell::RefCell,
    os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle},
    sync::{Arc, OnceLock, atomic::{AtomicBool, AtomicU8, Ordering}},
};
use windows_sys::Win32::{
    Foundation::{HWND, LPARAM, WAIT_TIMEOUT},
    System::Threading::{GetCurrentThreadId, OpenProcess, PROCESS_SYNCHRONIZE, WaitForSingleObject},
    UI::{
        Accessibility::{HWINEVENTHOOK, SetWinEventHook, UnhookWinEvent},
        WindowsAndMessaging::*,
    },
};

thread_local! { static WINDOW: RefCell<Option<Window>> = const { RefCell::new(None) }; }
const MARKER: windows_sys::core::PCWSTR = windows_sys::w!("CodeCodexStartupPresentation");

#[derive(Default)]
struct Control {
    thread: OnceLock<u32>,
    released: AtomicBool,
    held: AtomicU8,
}
pub(super) struct Gate(Arc<Control>);
impl Gate {
    pub(super) fn held(&self) -> u8 { self.0.held.load(Ordering::Acquire) }
    pub(super) fn start(pid: u32) -> Option<Self> {
        let handle = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, 0, pid) };
        if handle.is_null() { return None; }
        let process = unsafe { OwnedHandle::from_raw_handle(handle) };
        let state = Arc::new(Control::default());
        let control = state.clone();
        std::thread::Builder::new().name("startup-window-presentation".into())
            .spawn(move || run(control, pid, process)).ok()?;
        Some(Self(state))
    }
}
impl Drop for Gate {
    fn drop(&mut self) {
        self.0.released.store(true, Ordering::SeqCst);
        if let Some(thread) = self.0.thread.get() {
            unsafe { PostThreadMessageW(*thread, WM_QUIT, 0, 0); }
        }
    }
}

struct Window {
    pid: u32,
    process: OwnedHandle,
    held: HWND,
    control: Arc<Control>,
}
impl Window {
    fn matches(&self, window: HWND) -> bool {
        if window.is_null() || unsafe { WaitForSingleObject(self.process.as_raw_handle(),0) } != WAIT_TIMEOUT {
            return false;
        }
        let mut pid = 0;
        unsafe { GetWindowThreadProcessId(window, &mut pid); }
        pid == self.pid && unsafe { GetWindow(window, GW_OWNER) }.is_null()
    }
    fn hold(&mut self, window: HWND) {
        if !self.held.is_null() || !self.matches(window) { return; }
        let mut class = [0u16; 64];
        let len = unsafe { GetClassNameW(window, class.as_mut_ptr(), class.len() as i32) };
        let style = unsafe { GetWindowLongPtrW(window, GWL_STYLE) } as u32;
        let extended = unsafe { GetWindowLongPtrW(window, GWL_EXSTYLE) } as u32;
        // The official Chromium frame applies WS_CAPTION after creation.
        // Requiring it here defers interception to EVENT_OBJECT_SHOW.
        if len <= 0 || String::from_utf16_lossy(&class[..len as usize]) != "Chrome_WidgetWin_1"
            || style & WS_CHILD != 0 || extended & (WS_EX_LAYERED | WS_EX_TOOLWINDOW) != 0
        { return; }
        let previously_visible = unsafe { IsWindowVisible(window) } != 0;
        unsafe {
            if SetPropW(window, MARKER, 1usize as _) == 0 { return; }
            SetWindowLongPtrW(window, GWL_EXSTYLE, (extended | WS_EX_LAYERED) as isize);
            if SetLayeredWindowAttributes(window, 0, 1, LWA_ALPHA) == 0 {
                SetWindowLongPtrW(window, GWL_EXSTYLE, extended as isize);
                RemovePropW(window, MARKER);
                super::event("native first window", "unavailable", serde_json::json!({"stage":"layer-alpha"}));
                return;
            }
        }
        self.held = window;
        self.control.held.store(if previously_visible { 2 } else { 1 }, Ordering::Release);
        super::event("native first window", "held", serde_json::json!({
            "previouslyVisible":previously_visible,"captionPresent":style & WS_CAPTION == WS_CAPTION
        }));
    }
    fn check_show(&self, window: HWND) {
        if self.held != window || self.control.held.load(Ordering::Acquire) != 1 { return; }
        let mut alpha = 0;
        let mut flags = 0;
        let retained = unsafe {
            GetPropW(window, MARKER) as usize == 1
                && GetLayeredWindowAttributes(window, std::ptr::null_mut(), &mut alpha, &mut flags) != 0
        } && flags & LWA_ALPHA != 0 && alpha == 1;
        if !retained { self.control.held.store(2, Ordering::Release); }
        super::event("native first window", "show-observed", serde_json::json!({"presentationHeld":retained}));
    }
}
impl Drop for Window {
    fn drop(&mut self) {
        let window = self.held;
        if !self.matches(window) || unsafe { GetPropW(window, MARKER) } as usize != 1 { return; }
        unsafe {
            let current = GetWindowLongPtrW(window, GWL_EXSTYLE);
            SetLayeredWindowAttributes(window, 0, 255, LWA_ALPHA);
            SetWindowLongPtrW(window, GWL_EXSTYLE, current & !(WS_EX_LAYERED as isize));
            RemovePropW(window, MARKER);
        }
        super::event("native first window", "restored", serde_json::json!({}));
    }
}

fn run(control: Arc<Control>, pid: u32, process: OwnedHandle) {
    let mut message = MSG::default();
    unsafe { PeekMessageW(&mut message, std::ptr::null_mut(), 0, 0, PM_NOREMOVE); }
    let _ = control.thread.set(unsafe { GetCurrentThreadId() });
    if control.released.load(Ordering::SeqCst) { return; }
    WINDOW.with(|slot| slot.replace(Some(Window { pid, process, held: std::ptr::null_mut(), control })));
    unsafe {
        let hook = SetWinEventHook(EVENT_OBJECT_CREATE, EVENT_OBJECT_SHOW, std::ptr::null_mut(),
            Some(on_event), pid, 0, WINEVENT_OUTOFCONTEXT);
        if hook.is_null() {
            super::event("native first window", "unavailable", serde_json::json!({"stage":"window-events"}));
        } else {
            let timer = SetTimer(std::ptr::null_mut(), 0, 25_000, None);
            if timer == 0 {
                UnhookWinEvent(hook);
                WINDOW.with(|slot| drop(slot.take()));
                return;
            }
            EnumWindows(Some(existing_window), 0);
            while GetMessageW(&mut message, std::ptr::null_mut(), 0, 0) > 0 {
                if message.message == WM_TIMER && message.wParam == timer { break; }
                DispatchMessageW(&message);
            }
            KillTimer(std::ptr::null_mut(), timer);
            UnhookWinEvent(hook);
        }
    }
    WINDOW.with(|slot| drop(slot.take()));
}

unsafe extern "system" fn existing_window(window: HWND, _: LPARAM) -> i32 {
    WINDOW.with(|slot| {
        if let Some(state) = slot.borrow_mut().as_mut() { state.hold(window); }
    });
    1
}
unsafe extern "system" fn on_event(_: HWINEVENTHOOK, event: u32, window: HWND, object: i32,
    child: i32, _: u32, _: u32) {
    if object == OBJID_WINDOW && child == 0 && matches!(event, EVENT_OBJECT_CREATE | EVENT_OBJECT_SHOW) {
        WINDOW.with(|slot| {
            if let Some(state) = slot.borrow_mut().as_mut() {
                state.hold(window);
                if event == EVENT_OBJECT_SHOW { state.check_show(window); }
            }
        });
    }
}

#[cfg(test)]
#[test]
fn presentation_only_restores_the_style_it_owns() {
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    unsafe {
        let name = windows_sys::w!("Chrome_WidgetWin_1");
        let instance = GetModuleHandleW(std::ptr::null());
        let registered = RegisterClassW(&WNDCLASSW {
            lpszClassName: name, hInstance: instance, lpfnWndProc: Some(DefWindowProcW),
            ..WNDCLASSW::default()
        });
        assert_ne!(registered,0);
        let window = CreateWindowExW(WS_EX_APPWINDOW,name,name,WS_THICKFRAME,
            0,0,320,200,std::ptr::null_mut(),std::ptr::null_mut(),instance,std::ptr::null());
        assert!(!window.is_null());
        let pid = std::process::id();
        let control = Arc::new(Control::default());
        let mut gate = Window { pid, process:OwnedHandle::from_raw_handle(OpenProcess(PROCESS_SYNCHRONIZE,0,pid)),
            held: std::ptr::null_mut(), control:control.clone() };
        gate.hold(window);
        assert_eq!(control.held.load(Ordering::Acquire),1);
        let mut alpha=0;
        assert_ne!(GetLayeredWindowAttributes(window,std::ptr::null_mut(),&mut alpha,std::ptr::null_mut()),0);
        assert_eq!(alpha,1);
        SetWindowLongPtrW(window, GWL_STYLE, WS_OVERLAPPEDWINDOW as isize);
        gate.check_show(window);
        assert_eq!(control.held.load(Ordering::Acquire),1);
        let current=GetWindowLongPtrW(window,GWL_EXSTYLE);
        SetWindowLongPtrW(window,GWL_EXSTYLE,current|WS_EX_NOACTIVATE as isize);
        drop(gate);
        let style=GetWindowLongPtrW(window,GWL_EXSTYLE) as u32;
        assert_eq!(style & (WS_EX_APPWINDOW|WS_EX_NOACTIVATE|WS_EX_LAYERED),WS_EX_APPWINDOW|WS_EX_NOACTIVATE);
        assert!(GetPropW(window,MARKER).is_null());
        DestroyWindow(window);
        UnregisterClassW(name,instance);
    }
}
