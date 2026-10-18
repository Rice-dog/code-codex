#define WIN32_LEAN_AND_MEAN
#define NOMINMAX

#include <windows.h>
#include <msiquery.h>
#include <shlobj.h>
#include <tlhelp32.h>

#include <array>
#include <string>
#include <string_view>
#include <utility>
#include <vector>
#include <regex>
#include "LanguageResources.h"

namespace {

constexpr std::array<std::wstring_view, 2> blockedProcessNames{
    L"CodeCodex.exe",
    L"code-codex.exe",
};

enum class ProcessCheckResult {
    NotRunning,
    Running,
    Failed,
};

enum class InstallOwnershipResult {
    Missing,
    Msi,
    Portable,
    Invalid,
    Failed,
};

class ScopedHandle final {
public:
    explicit ScopedHandle(HANDLE handle = INVALID_HANDLE_VALUE) noexcept : handle_(handle) {}
    ~ScopedHandle() {
        if (handle_ != INVALID_HANDLE_VALUE) {
            CloseHandle(handle_);
        }
    }

    ScopedHandle(const ScopedHandle&) = delete;
    ScopedHandle& operator=(const ScopedHandle&) = delete;
    ScopedHandle(ScopedHandle&& other) noexcept : handle_(other.handle_) {
        other.handle_ = INVALID_HANDLE_VALUE;
    }
    ScopedHandle& operator=(ScopedHandle&& other) noexcept {
        if (this != &other) {
            if (handle_ != INVALID_HANDLE_VALUE) {
                CloseHandle(handle_);
            }
            handle_ = other.handle_;
            other.handle_ = INVALID_HANDLE_VALUE;
        }
        return *this;
    }

    HANDLE get() const noexcept { return handle_; }
    bool valid() const noexcept { return handle_ != INVALID_HANDLE_VALUE; }

private:
    HANDLE handle_;
};

class ScopedFindHandle final {
public:
    explicit ScopedFindHandle(HANDLE handle = INVALID_HANDLE_VALUE) noexcept : handle_(handle) {}
    ~ScopedFindHandle() {
        if (handle_ != INVALID_HANDLE_VALUE) {
            FindClose(handle_);
        }
    }

    ScopedFindHandle(const ScopedFindHandle&) = delete;
    ScopedFindHandle& operator=(const ScopedFindHandle&) = delete;

    HANDLE get() const noexcept { return handle_; }
    bool valid() const noexcept { return handle_ != INVALID_HANDLE_VALUE; }

private:
    HANDLE handle_;
};

void LogMessage(MSIHANDLE install, const std::wstring& message) noexcept {
    if (install == 0) {
        return;
    }

    const MSIHANDLE record = MsiCreateRecord(0);
    if (record == 0) {
        return;
    }
    if (MsiRecordSetStringW(record, 0, message.c_str()) == ERROR_SUCCESS) {
        MsiProcessMessage(install, INSTALLMESSAGE_INFO, record);
    }
    MsiCloseHandle(record);
}

const wchar_t* LocalizeMsiMessage(MSIHANDLE install,const wchar_t* message) noexcept {
    wchar_t language[32]={};DWORD length=31;
    const UINT result=MsiGetPropertyW(install,L"CODECODEXUILANGUAGE",language,&length);
    const bool chinese=(result==ERROR_SUCCESS && std::wstring_view(language)==L"zh-CN") || (length==0 && (GetUserDefaultUILanguage() & 0x3ff)==4);
    if(chinese){for(const auto& entry:CodeCodexLanguageEntries){if(entry.first==message){return entry.second.data();}}}
    return message;
}

UINT SetMsiLanguageLabels(MSIHANDLE install) noexcept {
    constexpr std::array<std::pair<const wchar_t*,const wchar_t*>,10> labels{{
        {L"CCLANGYES",L"Yes"},{L"CCLANGNO",L"No"},{L"CCLANGIGNORE",L"Ignore"},{L"CCLANGOK",L"OK"},{L"CCLANGRETRY",L"Retry"},
        {L"CCLANGCANCEL",L"Cancel"},{L"CCLANGFINISH",L"Finish"},
        {L"CCLANGFILEINUSE",L"Close the applications below, then retry."},
        {L"CCLANGDOWNGRADE",L"A newer version of Code-Codex is already installed."},
        {L"CCLANGCROSSFORMAT",L"A standalone installation of Code-Codex is already present. Uninstall it through Windows Installed apps before installing the MSI."}
    }};
    for(const auto& entry:labels){const UINT result=MsiSetPropertyW(install,entry.first,LocalizeMsiMessage(install,entry.second));if(result!=ERROR_SUCCESS){return result;}}
    return ERROR_SUCCESS;
}

void ReportInstallerError(MSIHANDLE install, const wchar_t* message) noexcept {
    if (install == 0) {
        return;
    }

    const MSIHANDLE record = MsiCreateRecord(0);
    if (record == 0) {
        return;
    }
    if (MsiRecordSetStringW(record, 0, LocalizeMsiMessage(install,message)) == ERROR_SUCCESS) {
        MsiProcessMessage(install, INSTALLMESSAGE_ERROR, record);
    }
    MsiCloseHandle(record);
}

wchar_t FoldAsciiCase(wchar_t character) noexcept {
    if (character >= L'A' && character <= L'Z') {
        return static_cast<wchar_t>(character + (L'a' - L'A'));
    }
    return character;
}

bool EqualsAsciiCaseInsensitive(
    std::wstring_view left,
    std::wstring_view right) noexcept {
    if (left.size() != right.size()) {
        return false;
    }
    for (size_t index = 0; index < left.size(); ++index) {
        if (FoldAsciiCase(left[index]) != FoldAsciiCase(right[index])) {
            return false;
        }
    }
    return true;
}

bool IsBlockedProcessName(std::wstring_view processName) noexcept {
    for (const std::wstring_view blockedName : blockedProcessNames) {
        if (EqualsAsciiCaseInsensitive(processName, blockedName)) {
            return true;
        }
    }
    return false;
}

ProcessCheckResult CheckForRunningExplorer() noexcept {
    // Toolhelp snapshots can transiently fail with ERROR_BAD_LENGTH. Retry a
    // bounded number of times, then fail closed before MSI mutates the install.
    constexpr unsigned int maximumSnapshotAttempts = 4;
    ScopedHandle snapshot;
    for (unsigned int attempt = 0; attempt < maximumSnapshotAttempts; ++attempt) {
        snapshot = ScopedHandle(CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0));
        if (snapshot.valid()) {
            break;
        }
        if (GetLastError() != ERROR_BAD_LENGTH) {
            return ProcessCheckResult::Failed;
        }
    }
    if (!snapshot.valid()) {
        return ProcessCheckResult::Failed;
    }

    PROCESSENTRY32W process{};
    process.dwSize = sizeof(process);
    if (!Process32FirstW(snapshot.get(), &process)) {
        return GetLastError() == ERROR_NO_MORE_FILES
            ? ProcessCheckResult::NotRunning
            : ProcessCheckResult::Failed;
    }

    do {
        if (IsBlockedProcessName(process.szExeFile)) {
            return ProcessCheckResult::Running;
        }
        process.dwSize = sizeof(process);
    } while (Process32NextW(snapshot.get(), &process));

    return GetLastError() == ERROR_NO_MORE_FILES
        ? ProcessCheckResult::NotRunning
        : ProcessCheckResult::Failed;
}

bool IsMissingError(DWORD error) noexcept {
    return error == ERROR_FILE_NOT_FOUND || error == ERROR_PATH_NOT_FOUND;
}

bool ValidateSelectedInstallRoot(const std::wstring& path) noexcept {
    if(path.size()<4 || path.size()>180 || path[1]!=L':' || path[2]!=L'\\' || path.find(L"..")!=std::wstring::npos || path.find(L'"')!=std::wstring::npos)return false;
    const std::wstring drive=path.substr(0,3);
    if(GetDriveTypeW(drive.c_str())!=DRIVE_FIXED)return false;
    for(const KNOWNFOLDERID* folder : {&FOLDERID_Profile,&FOLDERID_LocalAppData,&FOLDERID_RoamingAppData,&FOLDERID_Desktop,&FOLDERID_Documents,&FOLDERID_Windows,&FOLDERID_ProgramFiles,&FOLDERID_ProgramFilesX86}) {
        PWSTR known=nullptr;
        if(SUCCEEDED(SHGetKnownFolderPath(*folder,KF_FLAG_DEFAULT,nullptr,&known)) && known) {
            const size_t n=wcslen(known);
            const bool match=path.size()>=n && _wcsnicmp(path.c_str(),known,n)==0;
            const bool system=folder==&FOLDERID_Windows || folder==&FOLDERID_ProgramFiles || folder==&FOLDERID_ProgramFilesX86;
            const bool reject=match && (path.size()==n || (system && path.size()>n && path[n]==L'\\'));
            CoTaskMemFree(known);if(reject)return false;
        }
    }
    auto ancestor=path;
    while(ancestor.size()>3) {
        DWORD attr=GetFileAttributesW(ancestor.c_str());
        if(attr!=INVALID_FILE_ATTRIBUTES && (!(attr&FILE_ATTRIBUTE_DIRECTORY) || (attr&FILE_ATTRIBUTE_REPARSE_POINT)))return false;
        if(attr==INVALID_FILE_ATTRIBUTES && !IsMissingError(GetLastError()))return false;
        auto slash=ancestor.find_last_of(L'\\');if(slash==std::wstring::npos)break;ancestor.resize(slash);
    }
    return true;
}

InstallOwnershipResult CheckInstallOwnership(const std::wstring& installRoot) noexcept {
    const size_t separator = installRoot.find_last_of(L"\\/");
    if (separator == std::wstring::npos || separator == 0) {
        return InstallOwnershipResult::Invalid;
    }
    const std::wstring parentPath = installRoot.substr(0, separator);
    ScopedHandle parent(CreateFileW(
        parentPath.c_str(),
        FILE_READ_ATTRIBUTES,
        FILE_SHARE_READ | FILE_SHARE_WRITE,
        nullptr,
        OPEN_EXISTING,
        FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT,
        nullptr));
    if (!parent.valid()) {
        return IsMissingError(GetLastError())
            ? InstallOwnershipResult::Missing
            : InstallOwnershipResult::Failed;
    }
    FILE_ATTRIBUTE_TAG_INFO parentAttributes{};
    if (!GetFileInformationByHandleEx(
            parent.get(),
            FileAttributeTagInfo,
            &parentAttributes,
            sizeof(parentAttributes))) {
        return InstallOwnershipResult::Failed;
    }
    if ((parentAttributes.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) == 0 ||
        (parentAttributes.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0) {
        return InstallOwnershipResult::Invalid;
    }

    ScopedHandle root(CreateFileW(
        installRoot.c_str(),
        FILE_READ_ATTRIBUTES,
        FILE_SHARE_READ | FILE_SHARE_WRITE,
        nullptr,
        OPEN_EXISTING,
        FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT,
        nullptr));
    if (!root.valid()) {
        return IsMissingError(GetLastError())
            ? InstallOwnershipResult::Missing
            : InstallOwnershipResult::Failed;
    }

    FILE_ATTRIBUTE_TAG_INFO rootAttributes{};
    if (!GetFileInformationByHandleEx(
            root.get(),
            FileAttributeTagInfo,
            &rootAttributes,
            sizeof(rootAttributes))) {
        return InstallOwnershipResult::Failed;
    }
    if ((rootAttributes.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) == 0 ||
        (rootAttributes.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0) {
        return InstallOwnershipResult::Invalid;
    }

    const std::wstring markerPath = installRoot + L"\\install-type";
    ScopedHandle marker(CreateFileW(
        markerPath.c_str(),
        GENERIC_READ | FILE_READ_ATTRIBUTES,
        FILE_SHARE_READ,
        nullptr,
        OPEN_EXISTING,
        FILE_FLAG_OPEN_REPARSE_POINT,
        nullptr));
    if (!marker.valid()) {
        return IsMissingError(GetLastError())
            ? InstallOwnershipResult::Invalid
            : InstallOwnershipResult::Failed;
    }

    FILE_ATTRIBUTE_TAG_INFO markerAttributes{};
    if (!GetFileInformationByHandleEx(
            marker.get(),
            FileAttributeTagInfo,
            &markerAttributes,
            sizeof(markerAttributes))) {
        return InstallOwnershipResult::Failed;
    }
    if ((markerAttributes.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0 ||
        (markerAttributes.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0) {
        return InstallOwnershipResult::Invalid;
    }

    LARGE_INTEGER markerSize{};
    if (!GetFileSizeEx(marker.get(), &markerSize) ||
        markerSize.QuadPart <= 0 ||
        markerSize.QuadPart > 16) {
        return InstallOwnershipResult::Invalid;
    }

    std::array<char, 16> contents{};
    DWORD bytesRead = 0;
    const DWORD expected = static_cast<DWORD>(markerSize.QuadPart);
    if (!ReadFile(marker.get(), contents.data(), expected, &bytesRead, nullptr) ||
        bytesRead != expected) {
        return InstallOwnershipResult::Failed;
    }

    std::string_view owner(contents.data(), bytesRead);
    while (!owner.empty() && (owner.back() == '\r' || owner.back() == '\n')) {
        owner.remove_suffix(1);
    }
    if (owner == "msi") {
        return InstallOwnershipResult::Msi;
    }
    if (owner == "portable") {
        return InstallOwnershipResult::Portable;
    }
    return InstallOwnershipResult::Invalid;
}

std::wstring ExtendedPath(const std::wstring& path) {
    if (path.rfind(LR"(\\?\)", 0) == 0) {
        return path;
    }
    if (path.rfind(LR"(\\)", 0) == 0) {
        return LR"(\\?\UNC\)" + path.substr(2);
    }
    return LR"(\\?\)" + path;
}

ScopedHandle OpenWithoutFollowing(
    const std::wstring& path,
    DWORD desiredAccess,
    DWORD& error,
    DWORD shareMode = FILE_SHARE_READ) noexcept {
    const HANDLE handle = CreateFileW(
        path.c_str(),
        desiredAccess,
        shareMode,
        nullptr,
        OPEN_EXISTING,
        FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT,
        nullptr);
    if (handle == INVALID_HANDLE_VALUE) {
        error = GetLastError();
    }
    else {
        error = ERROR_SUCCESS;
    }
    return ScopedHandle(handle);
}

bool QueryAttributes(HANDLE handle, DWORD& attributes) noexcept {
    FILE_ATTRIBUTE_TAG_INFO info{};
    if (!GetFileInformationByHandleEx(handle, FileAttributeTagInfo, &info, sizeof(info))) {
        return false;
    }
    attributes = info.FileAttributes;
    return true;
}

bool CanonicalDrivePath(const std::wstring& path, std::wstring& canonical) {
    const DWORD required = GetFullPathNameW(path.c_str(), 0, nullptr, nullptr);
    if (required == 0) {
        return false;
    }
    std::vector<wchar_t> buffer(static_cast<size_t>(required) + 1);
    const DWORD written = GetFullPathNameW(
        path.c_str(),
        static_cast<DWORD>(buffer.size()),
        buffer.data(),
        nullptr);
    if (written == 0 || written >= buffer.size()) {
        return false;
    }
    canonical.assign(buffer.data(), written);
    for (wchar_t& character : canonical) {
        if (character == L'/') {
            character = L'\\';
        }
    }
    while (canonical.size() > 3 && canonical.back() == L'\\') {
        canonical.pop_back();
    }
    return canonical.size() >= 3 &&
           ((canonical[0] >= L'A' && canonical[0] <= L'Z') ||
            (canonical[0] >= L'a' && canonical[0] <= L'z')) &&
           canonical[1] == L':' &&
           canonical[2] == L'\\';
}

struct LockedSettingsPath final {
    std::vector<ScopedHandle> ancestors;
    ScopedHandle root;
    std::wstring rootPath;
    BY_HANDLE_FILE_INFORMATION identity{};
};

bool LockSettingsPath(
    MSIHANDLE install,
    const std::wstring& requestedRoot,
    LockedSettingsPath& locked) {
    std::wstring canonical;
    if (!CanonicalDrivePath(requestedRoot, canonical) || canonical.size() <= 3) {
        LogMessage(install, L"Code-Codex settings were left in place because the settings path was not a canonical drive path.");
        return false;
    }

    std::vector<std::wstring> components;
    components.push_back(canonical.substr(0, 3));
    size_t cursor = 3;
    while (cursor < canonical.size()) {
        const size_t separator = canonical.find(L'\\', cursor);
        if (separator == cursor) {
            LogMessage(install, L"Code-Codex settings were left in place because the settings path was malformed.");
            return false;
        }
        if (separator == std::wstring::npos) {
            components.push_back(canonical);
            break;
        }
        components.push_back(canonical.substr(0, separator));
        cursor = separator + 1;
    }

    for (size_t index = 0; index < components.size(); ++index) {
        const bool isRoot = index + 1 == components.size();
        const std::wstring extendedComponent = ExtendedPath(components[index]);
        DWORD error = ERROR_SUCCESS;
        DWORD access = FILE_READ_ATTRIBUTES | SYNCHRONIZE;
        if (isRoot) {
            access |= DELETE | FILE_WRITE_ATTRIBUTES;
        }
        ScopedHandle component = OpenWithoutFollowing(extendedComponent, access, error);
        if (!component.valid()) {
            if (!isRoot || !IsMissingError(error)) {
                LogMessage(install, L"Code-Codex settings were left in place because a settings-path component could not be locked safely.");
            }
            return false;
        }

        DWORD attributes = 0;
        if (!QueryAttributes(component.get(), attributes)) {
            LogMessage(install, L"Code-Codex settings were left in place because a settings-path component could not be verified.");
            return false;
        }
        const bool isDirectory = (attributes & FILE_ATTRIBUTE_DIRECTORY) != 0;
        const bool isReparsePoint = (attributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0;
        if (!isRoot && (!isDirectory || isReparsePoint)) {
            LogMessage(install, L"Code-Codex settings were left in place because a settings-path ancestor was not a regular directory.");
            return false;
        }

        if (isRoot) {
            locked.rootPath = extendedComponent;
            locked.root = std::move(component);
            if (!GetFileInformationByHandle(locked.root.get(), &locked.identity)) {
                LogMessage(install, L"Code-Codex settings were left in place because the settings-root identity could not be captured.");
                return false;
            }
        }
        else {
            locked.ancestors.push_back(std::move(component));
        }
    }
    return locked.root.valid();
}

bool RecheckRootIdentity(const LockedSettingsPath& locked) noexcept {
    DWORD error = ERROR_SUCCESS;
    ScopedHandle current = OpenWithoutFollowing(
        locked.rootPath,
        FILE_READ_ATTRIBUTES | SYNCHRONIZE,
        error,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE);
    if (!current.valid()) {
        return false;
    }

    BY_HANDLE_FILE_INFORMATION identity{};
    if (!GetFileInformationByHandle(current.get(), &identity)) {
        return false;
    }
    DWORD attributes = 0;
    if (!QueryAttributes(current.get(), attributes) ||
        (attributes & FILE_ATTRIBUTE_DIRECTORY) == 0 ||
        (attributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0) {
        return false;
    }
    return identity.dwVolumeSerialNumber == locked.identity.dwVolumeSerialNumber &&
           identity.nFileIndexHigh == locked.identity.nFileIndexHigh &&
           identity.nFileIndexLow == locked.identity.nFileIndexLow;
}

bool MarkForDeletion(HANDLE handle) noexcept {
    FILE_BASIC_INFO basic{};
    if (GetFileInformationByHandleEx(handle, FileBasicInfo, &basic, sizeof(basic)) &&
        (basic.FileAttributes & FILE_ATTRIBUTE_READONLY) != 0) {
        basic.FileAttributes &= ~FILE_ATTRIBUTE_READONLY;
        if (basic.FileAttributes == 0) {
            basic.FileAttributes = FILE_ATTRIBUTE_NORMAL;
        }
        if (!SetFileInformationByHandle(handle, FileBasicInfo, &basic, sizeof(basic))) {
            return false;
        }
    }

    FILE_DISPOSITION_INFO disposition{};
    disposition.DeleteFile = TRUE;
    return SetFileInformationByHandle(
               handle,
               FileDispositionInfo,
               &disposition,
               sizeof(disposition)) != FALSE;
}

void RemoveKnownChild(
    MSIHANDLE install,
    const std::wstring& root,
    const wchar_t* name,
    bool regularFilesOnly = false) {
    const std::wstring childPath = root + L"\\" + name;
    DWORD error = ERROR_SUCCESS;
    ScopedHandle child = OpenWithoutFollowing(
        childPath,
        DELETE | FILE_READ_ATTRIBUTES | FILE_WRITE_ATTRIBUTES | SYNCHRONIZE,
        error);
    if (!child.valid()) {
        if (!IsMissingError(error)) {
            LogMessage(install, L"Code-Codex left a settings file in place because it could not be opened safely.");
        }
        return;
    }

    DWORD attributes = 0;
    if (!QueryAttributes(child.get(), attributes)) {
        LogMessage(install, L"Code-Codex left a settings file in place because its attributes could not be verified.");
        return;
    }

    const bool isDirectory = (attributes & FILE_ATTRIBUTE_DIRECTORY) != 0;
    const bool isReparsePoint = (attributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0;
    if (regularFilesOnly && (isDirectory || isReparsePoint)) {
        LogMessage(install, L"Code-Codex left a non-regular crash-candidate entry in place.");
        return;
    }
    if (isDirectory && !isReparsePoint) {
        LogMessage(install, L"Code-Codex left an unexpected settings directory in place.");
        return;
    }

    if (!MarkForDeletion(child.get())) {
        LogMessage(install, L"Code-Codex could not remove a settings file; it was left in place.");
    }
}

bool IsAsciiAlphanumeric(wchar_t character) noexcept {
    return (character >= L'0' && character <= L'9') ||
           (character >= L'A' && character <= L'Z') ||
           (character >= L'a' && character <= L'z');
}

bool IsCrashOrphanName(std::wstring_view name) noexcept {
    constexpr std::wstring_view prefix = L".settings.json.";
    constexpr std::wstring_view suffix = L".tmp";
    constexpr size_t tokenLength = 16;
    if (name.size() != prefix.size() + tokenLength + suffix.size() ||
        name.substr(0, prefix.size()) != prefix ||
        name.substr(name.size() - suffix.size()) != suffix) {
        return false;
    }

    const std::wstring_view token = name.substr(prefix.size(), tokenLength);
    for (const wchar_t character : token) {
        if (!IsAsciiAlphanumeric(character)) {
            return false;
        }
    }
    return true;
}

void RemoveCrashOrphans(MSIHANDLE install, const std::wstring& root) {
    constexpr size_t maximumCandidates = 64;
    WIN32_FIND_DATAW findData{};
    ScopedFindHandle find(FindFirstFileExW(
        (root + L"\\.settings.json.*.tmp").c_str(),
        FindExInfoBasic,
        &findData,
        FindExSearchNameMatch,
        nullptr,
        FIND_FIRST_EX_LARGE_FETCH));
    if (!find.valid()) {
        const DWORD error = GetLastError();
        if (!IsMissingError(error) && error != ERROR_NO_MORE_FILES) {
            LogMessage(install, L"Code-Codex could not enumerate settings crash candidates safely.");
        }
        return;
    }

    size_t inspected = 0;
    do {
        if (inspected >= maximumCandidates) {
            LogMessage(install, L"Code-Codex bounded settings crash-candidate cleanup at 64 entries.");
            break;
        }
        ++inspected;
        if (IsCrashOrphanName(findData.cFileName)) {
            RemoveKnownChild(install, root, findData.cFileName, true);
        }
    } while (FindNextFileW(find.get(), &findData));
}

#ifdef SETTINGS_CLEANUP_TEST
const wchar_t* testReadyEventName = nullptr;
const wchar_t* testContinueEventName = nullptr;

void PauseForAncestorRaceTest() noexcept {
    if (testReadyEventName == nullptr || testContinueEventName == nullptr) {
        return;
    }
    const HANDLE ready = OpenEventW(EVENT_MODIFY_STATE, FALSE, testReadyEventName);
    const HANDLE proceed = OpenEventW(SYNCHRONIZE, FALSE, testContinueEventName);
    if (ready != nullptr && proceed != nullptr) {
        SetEvent(ready);
        WaitForSingleObject(proceed, 10000);
    }
    if (ready != nullptr) {
        CloseHandle(ready);
    }
    if (proceed != nullptr) {
        CloseHandle(proceed);
    }
}
#else
void PauseForAncestorRaceTest() noexcept {}
#endif

void CleanupSettingsRoot(MSIHANDLE install, const std::wstring& rootPath) {
    LockedSettingsPath locked;
    if (!LockSettingsPath(install, rootPath, locked)) {
        return;
    }

    DWORD attributes = 0;
    if (!QueryAttributes(locked.root.get(), attributes)) {
        LogMessage(install, L"Code-Codex settings were left in place because the settings root could not be verified.");
        return;
    }

    const bool isDirectory = (attributes & FILE_ATTRIBUTE_DIRECTORY) != 0;
    const bool isReparsePoint = (attributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0;
    if (isReparsePoint) {
        if (!MarkForDeletion(locked.root.get())) {
            LogMessage(install, L"Code-Codex could not unlink the settings reparse point; it was left in place.");
        }
        return;
    }
    if (!isDirectory) {
        LogMessage(install, L"Code-Codex left an unexpected non-directory settings root in place.");
        return;
    }

    PauseForAncestorRaceTest();
    if (!RecheckRootIdentity(locked)) {
        LogMessage(install, L"Code-Codex settings were left in place because the settings-root identity changed.");
        return;
    }

    constexpr std::array<const wchar_t*, 4> knownFiles{
        L"settings.json",
        L"settings.json.tmp",
        L"ui-language.json",
        L".ui-language.lock",
    };
    for (const wchar_t* name : knownFiles) {
        RemoveKnownChild(install, locked.rootPath, name);
    }
    if (!RecheckRootIdentity(locked)) {
        LogMessage(install, L"Code-Codex stopped before crash-candidate cleanup because the settings-root identity changed.");
        return;
    }
    RemoveCrashOrphans(install, locked.rootPath);

    // This succeeds only when the regular settings directory is now empty.
    // Unknown files and directories are intentionally preserved.
    if (RecheckRootIdentity(locked)) {
        MarkForDeletion(locked.root.get());
    }
}

}  // namespace

#ifdef SETTINGS_CLEANUP_TEST

int wmain(int argc, wchar_t** argv) {
    if (argc == 3 && std::wstring_view(argv[1]) == L"--blocked-process-name") {
        return IsBlockedProcessName(argv[2]) ? 0 : 1;
    }
    if (argc == 2 && std::wstring_view(argv[1]) == L"--check-running-explorer") {
        switch (CheckForRunningExplorer()) {
        case ProcessCheckResult::Running:
            return 0;
        case ProcessCheckResult::NotRunning:
            return 1;
        case ProcessCheckResult::Failed:
            return 3;
        }
        return 3;
    }
    if (argc == 3 && std::wstring_view(argv[1]) == L"--check-install-ownership") {
        switch (CheckInstallOwnership(argv[2])) {
        case InstallOwnershipResult::Missing:
            return 0;
        case InstallOwnershipResult::Msi:
            return 1;
        case InstallOwnershipResult::Portable:
            return 2;
        case InstallOwnershipResult::Invalid:
        case InstallOwnershipResult::Failed:
            return 3;
        }
        return 3;
    }
    if (argc != 2 && argc != 4) {
        return 2;
    }
    try {
#ifdef SETTINGS_CLEANUP_TEST
        if (argc == 4) {
            testReadyEventName = argv[2];
            testContinueEventName = argv[3];
        }
#endif
        CleanupSettingsRoot(0, argv[1]);
        return 0;
    }
    catch (...) {
        return 3;
    }
}

#else

extern "C" __declspec(dllexport) UINT __stdcall InitializeUiLanguage(MSIHANDLE install) noexcept {
    try {
        wchar_t supplied[32] = {}; DWORD length = 31;
        const UINT suppliedResult = MsiGetPropertyW(install,L"CODECODEXUILANGUAGE",supplied,&length);
        if (suppliedResult != ERROR_SUCCESS) { return ERROR_INSTALL_FAILURE; }
        if (length > 0) {
            const std::wstring_view value(supplied);
            if (value != L"zh-CN" && value != L"en") {
                ReportInstallerError(install,L"CC-LANG-INVALID-001: CODECODEXUILANGUAGE must be zh-CN or en.");
                return ERROR_INSTALL_FAILURE;
            }
        }
        wchar_t initialized[4] = {}; DWORD initializedLength=3;
        if (MsiGetPropertyW(install,L"CODECODEXUILANGUAGEINITIALIZED",initialized,&initializedLength)==ERROR_SUCCESS && std::wstring_view(initialized)==L"1") { return SetMsiLanguageLabels(install); }
        std::wstring revision=L"0";
        const std::wstring explicitLocale(supplied);
        std::wstring locale = ((GetUserDefaultUILanguage() & 0x3ff) == 4) ? L"zh-CN" : L"en";
        wchar_t registered[2048] = {}; DWORD count = 2047;
        if (MsiGetPropertyW(install,L"REGISTEREDINSTALLFOLDER",registered,&count) == ERROR_SUCCESS && count > 0) {
            LockedSettingsPath locked;
            const std::wstring dataRoot = std::wstring(registered) + L"\\data";
            if (LockSettingsPath(install,dataRoot,locked) && RecheckRootIdentity(locked)) {
                const std::wstring path = dataRoot + L"\\ui-language.json";
                ScopedHandle file(CreateFileW(path.c_str(),GENERIC_READ,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,nullptr,OPEN_EXISTING,FILE_FLAG_OPEN_REPARSE_POINT,nullptr));
                if (file.get() != INVALID_HANDLE_VALUE) {
                    BY_HANDLE_FILE_INFORMATION info = {}; LARGE_INTEGER size = {};
                    if (GetFileInformationByHandle(file.get(),&info) && (info.dwFileAttributes & (FILE_ATTRIBUTE_REPARSE_POINT|FILE_ATTRIBUTE_DIRECTORY)) == 0 &&
                        GetFileSizeEx(file.get(),&size) && size.QuadPart > 0 && size.QuadPart <= 4096) {
                        std::string body(static_cast<size_t>(size.QuadPart),'\0'); DWORD read = 0;
                        if (ReadFile(file.get(),body.data(),static_cast<DWORD>(body.size()),&read,nullptr) && read == body.size()) {
                            const std::regex pattern(R"cc("locale"\s*:\s*"(zh-CN|en)")cc");
                            std::smatch found;
                            if (std::regex_search(body,found,pattern)) { locale = found[1].str() == "zh-CN" ? L"zh-CN" : L"en"; }
                            const std::regex revisionPattern(R"cc("revision"\s*:\s*([0-9]{1,10}))cc");
                            if (std::regex_search(body,found,revisionPattern)) { const std::string value=found[1].str();revision.assign(value.begin(),value.end()); }
                        }
                    }
                }
            }
        }
        if (!explicitLocale.empty()) { locale=explicitLocale; }
        if (MsiSetPropertyW(install,L"CODECODEXUILANGUAGEREVISION",revision.c_str())!=ERROR_SUCCESS || MsiSetPropertyW(install,L"CODECODEXUILANGUAGEINITIALIZED",L"1")!=ERROR_SUCCESS) { return ERROR_INSTALL_FAILURE; }
        const UINT selected=MsiSetPropertyW(install,L"CODECODEXUILANGUAGE",locale.c_str());
        return selected==ERROR_SUCCESS ? SetMsiLanguageLabels(install) : selected;
    } catch (...) {
        LogMessage(install,L"CC-LANG-DETECT-001: UI language detection fell back to English.");
        MsiSetPropertyW(install,L"CODECODEXUILANGUAGEREVISION",L"0");
        return MsiSetPropertyW(install,L"CODECODEXUILANGUAGE",L"en");
    }
}

extern "C" __declspec(dllexport) UINT __stdcall BlockCrossFormatInstall(
    MSIHANDLE install) noexcept {
    try {
        PWSTR localAppData = nullptr;
        const HRESULT result = SHGetKnownFolderPath(
            FOLDERID_LocalAppData,
            KF_FLAG_DEFAULT,
            nullptr,
            &localAppData);
        if (FAILED(result) || localAppData == nullptr) {
            if (localAppData != nullptr) {
                CoTaskMemFree(localAppData);
            }
            ReportInstallerError(
                install,
                L"Setup could not verify the existing Code-Codex installation owner. No files were changed.");
            return ERROR_INSTALL_FAILURE;
        }

        wchar_t selectedRoot[2048] = {}; DWORD rootLength = 2047;
        const UINT selectedResult=MsiGetPropertyW(install,L"INSTALLFOLDER",selectedRoot,&rootLength);
        std::wstring installRoot = selectedResult==ERROR_SUCCESS && rootLength>0 ? std::wstring(selectedRoot) : std::wstring(localAppData) + L"\\Programs\\Code-Codex";
        while(!installRoot.empty() && (installRoot.back()==L'\\' || installRoot.back()==L'/'))installRoot.pop_back();
        CoTaskMemFree(localAppData);
        if(!ValidateSelectedInstallRoot(installRoot)) {
            ReportInstallerError(install,L"Select a dedicated user-writable folder on a fixed local drive without linked ancestors. No files were changed.");
            return ERROR_INSTALL_FAILURE;
        }
        switch (CheckInstallOwnership(installRoot)) {
        case InstallOwnershipResult::Missing:
        case InstallOwnershipResult::Msi:
            return ERROR_SUCCESS;
        case InstallOwnershipResult::Portable:
            ReportInstallerError(
                install,
                L"A standalone installation of Code-Codex is already present. Uninstall it through Windows Installed apps before installing the MSI.");
            return ERROR_INSTALL_FAILURE;
        case InstallOwnershipResult::Invalid:
        case InstallOwnershipResult::Failed:
            ReportInstallerError(
                install,
                L"Setup could not verify the existing Code-Codex installation owner. Repair or remove the existing installation before installing the MSI.");
            return ERROR_INSTALL_FAILURE;
        }
    }
    catch (...) {
        ReportInstallerError(
            install,
            L"Setup could not verify the existing Code-Codex installation owner. No files were changed.");
    }
    return ERROR_INSTALL_FAILURE;
}

extern "C" __declspec(dllexport) UINT __stdcall BlockInstallIfExplorerRunning(
    MSIHANDLE install) noexcept {
    try {
        switch (CheckForRunningExplorer()) {
        case ProcessCheckResult::NotRunning:
            return ERROR_SUCCESS;
        case ProcessCheckResult::Running:
            ReportInstallerError(
                install,
                L"Code-Codex is still running. Close Codex and Code-Codex completely, then run this installer again.");
            return ERROR_INSTALL_FAILURE;
        case ProcessCheckResult::Failed:
            ReportInstallerError(
                install,
                L"Setup could not verify whether Code-Codex is running. Close Codex and Code-Codex completely, then run this installer again.");
            return ERROR_INSTALL_FAILURE;
        }
    }
    catch (...) {
        ReportInstallerError(
            install,
            L"Setup could not verify whether Code-Codex is running. Close Codex and Code-Codex completely, then run this installer again.");
    }
    return ERROR_INSTALL_FAILURE;
}

extern "C" __declspec(dllexport) UINT __stdcall CleanupMsiSettings(MSIHANDLE install) noexcept {
    // Centralized user data is retained by default, including direct msiexec removal.
    // Explicit purge is handled by the ownership-verified standalone finalizer.
    wchar_t purge[8]={};DWORD size=7;
    if(MsiGetPropertyW(install,L"PURGEUSERDATA",purge,&size)!=ERROR_SUCCESS || std::wstring(purge)!=L"1") {
        wchar_t root[2048]={};DWORD count=2047;
        if(MsiGetPropertyW(install,L"INSTALLFOLDER",root,&count)==ERROR_SUCCESS && count>0) {
            HKEY key=nullptr;
            if(RegCreateKeyExW(HKEY_CURRENT_USER,L"Software\\CodeCodex",0,nullptr,0,KEY_SET_VALUE,nullptr,&key,nullptr)==ERROR_SUCCESS) {
                RegSetValueExW(key,L"RetainedRoot",0,REG_SZ,reinterpret_cast<const BYTE*>(root),(count+1)*sizeof(wchar_t));RegCloseKey(key);
            }
        }
        return ERROR_SUCCESS;
    }
    try {
        PWSTR localAppData = nullptr;
        const HRESULT result = SHGetKnownFolderPath(
            FOLDERID_LocalAppData,
            KF_FLAG_DEFAULT,
            nullptr,
            &localAppData);
        if (FAILED(result) || localAppData == nullptr) {
            LogMessage(install, L"Code-Codex settings were left in place because Local AppData could not be resolved.");
            if (localAppData != nullptr) {
                CoTaskMemFree(localAppData);
            }
            return ERROR_SUCCESS;
        }

        const std::wstring settingsRoot = std::wstring(localAppData) + L"\\CodeCodex";
        CoTaskMemFree(localAppData);
        CleanupSettingsRoot(install, settingsRoot);
    }
    catch (...) {
        LogMessage(install, L"Code-Codex settings cleanup stopped safely after an unexpected error.");
    }
    return ERROR_SUCCESS;
}

#endif
