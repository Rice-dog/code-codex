//! Unicode Shell link I/O. Transaction and ownership policy stay in the caller.
use super::{Path, ShortcutMetadata};
use windows::{
    Win32::{
        System::Com::{
            CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx,
            CoTaskMemFree, CoUninitialize, IPersistFile, STGM_READ,
        },
        UI::{
            Shell::{
                IShellItem2, IShellLinkW, PropertiesSystem::PSGetPropertyKeyFromName,
                SHCreateItemFromParsingName, SLGP_RAWPATH, ShellLink,
            },
            WindowsAndMessaging::SW_SHOWNORMAL,
        },
    },
    core::{HSTRING, Interface},
};

struct Apartment;
impl Apartment {
    fn new() -> windows::core::Result<Self> {
        // This synchronous CLI owns its thread. Balance S_OK and S_FALSE alike.
        unsafe {
            CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok()?;
        }
        Ok(Self)
    }
}
impl Drop for Apartment {
    fn drop(&mut self) {
        unsafe {
            CoUninitialize();
        }
    }
}

fn wide(path: &Path) -> HSTRING {
    HSTRING::from(path.as_os_str())
}
fn text(buffer: &[u16]) -> String {
    String::from_utf16_lossy(&buffer[..buffer.iter().position(|&c| c == 0).unwrap_or(buffer.len())])
}

pub(super) fn create(
    path: &Path,
    target: &Path,
    directory: &Path,
    icon: &Path,
    description: &str,
) -> windows::core::Result<()> {
    let _apartment = Apartment::new()?;
    // All input strings are owned through the synchronous COM calls.
    unsafe {
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
        link.SetPath(&wide(target))?;
        link.SetWorkingDirectory(&wide(directory))?;
        link.SetIconLocation(&wide(icon), 0)?;
        link.SetDescription(&HSTRING::from(description))?;
        link.SetShowCmd(SW_SHOWNORMAL)?;
        link.cast::<IPersistFile>()?.Save(&wide(path), true)
    }
}

pub(super) fn inspect(path: &Path) -> windows::core::Result<ShortcutMetadata> {
    let _apartment = Apartment::new()?;
    unsafe {
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
        let path = wide(path);
        link.cast::<IPersistFile>()?.Load(&path, STGM_READ)?;
        // Windows paths and Shell link strings are bounded by 32K UTF-16 units.
        let mut target = vec![0u16; 32768];
        let mut description = vec![0u16; 32768];
        let mut icon = vec![0u16; 32768];
        let mut icon_index = 0;
        // Do not Resolve: inspection must not search for or launch a target.
        link.GetPath(&mut target, std::ptr::null_mut(), SLGP_RAWPATH.0 as u32)?;
        link.GetDescription(&mut description)?;
        link.GetIconLocation(&mut icon, &mut icon_index)?;
        // Packaged-app shortcuts may have an AUMID instead of an EXE target.
        let item: IShellItem2 = SHCreateItemFromParsingName(&path, None)?;
        let mut key = Default::default();
        PSGetPropertyKeyFromName(windows::core::w!("System.Link.TargetParsingPath"), &mut key)?;
        let value = item.GetString(&key)?;
        let parsing_path = value.to_string();
        CoTaskMemFree(Some(value.0.cast()));
        let icon_path = text(&icon);
        Ok(ShortcutMetadata {
            target: text(&target),
            description: text(&description),
            target_parsing_path: parsing_path?,
            icon_location: if icon_path.is_empty() {
                String::new()
            } else {
                format!("{icon_path},{icon_index}")
            },
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unicode_working_directory_and_packaged_target_roundtrip() {
        let temporary = tempfile::tempdir().unwrap();
        let directory = temporary.path().join("中文 😀 مجلد");
        std::fs::create_dir(&directory).unwrap();
        let target = directory.join("程序.exe");
        std::fs::write(&target, b"target fixture").unwrap();
        let path = directory.join("入口.lnk");
        create(&path, &target, &directory, &target, "Unicode 😀").unwrap();
        let metadata = inspect(&path).unwrap();
        assert_eq!(metadata.target, target.to_string_lossy());
        assert_eq!(metadata.target_parsing_path, target.to_string_lossy());
        let _apartment = Apartment::new().unwrap();
        unsafe {
            let link: IShellLinkW =
                CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).unwrap();
            link.cast::<IPersistFile>()
                .unwrap()
                .Load(&wide(&path), STGM_READ)
                .unwrap();
            let mut working = vec![0u16; 32768];
            link.GetWorkingDirectory(&mut working).unwrap();
            assert_eq!(text(&working), directory.to_string_lossy());
            // Use a real Shell namespace link, rather than substituting an EXE path
            // for the official packaged application's target contract.
            let mut id = std::ptr::null_mut();
            windows::Win32::UI::Shell::SHParseDisplayName(
                windows::core::w!("shell:AppsFolder\\OpenAI.Codex_2p2nqsd0c76g0!App"),
                None,
                &mut id,
                0,
                None,
            )
            .unwrap();
            let packaged: IShellLinkW =
                CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).unwrap();
            let assigned = packaged.SetIDList(id);
            CoTaskMemFree(Some(id.cast()));
            assigned.unwrap();
            let packaged_path = directory.join("官方.lnk");
            packaged
                .cast::<IPersistFile>()
                .unwrap()
                .Save(&wide(&packaged_path), true)
                .unwrap();
            assert_eq!(
                inspect(&packaged_path).unwrap().target_parsing_path,
                "OpenAI.Codex_2p2nqsd0c76g0!App"
            );
        }
        // Malformed files remain errors rather than becoming adoptable empty links.
        let malformed = directory.join("invalid.lnk");
        std::fs::write(&malformed, b"not a Shell link").unwrap();
        assert!(inspect(&malformed).is_err());
    }
}
