//! Current-user official Runtime registrations; no subprocess, polling or backend startup.
use super::*;
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub(super) struct RuntimePackage {
    pub package: String,
    pub version: String,
    pub root: String,
}
pub(super) fn identity(packages: &[RuntimePackage]) -> String {
    if packages.is_empty() { String::new() } else { hash(&encode(&packages).expect("runtime metadata serializes")) }
}
// Side-by-side old registrations are retained as metadata. Inventory the newest
// registered distribution, just as desktop discovery chooses its current package.
pub(super) fn inventory_package(packages: &[RuntimePackage]) -> Option<&RuntimePackage> {
    packages.iter().max_by_key(|p| p.version.split('.').map(|n| n.parse::<u16>().unwrap_or(0)).collect::<Vec<_>>())
}
#[cfg(windows)]
pub(super) fn registered() -> io::Result<Vec<RuntimePackage>> {
    use windows::Management::Deployment::PackageManager;
    let query = || -> windows::core::Result<Vec<RuntimePackage>> {
        let manager = PackageManager::new()?;
        let mut result = Vec::new();
        for package in manager.FindPackagesByUserSecurityId(&windows::core::HSTRING::new())? {
            let id = package.Id()?;
            if !id.Name()?.to_string().starts_with("OpenAI.CodexPrimaryRuntime.v") || id.PublisherId()?.to_string() != "3k8sg7r9htsxt" { continue; }
            let v = id.Version()?;
            result.push(RuntimePackage { package: id.FullName()?.to_string(), version: format!("{}.{}.{}.{}",v.Major,v.Minor,v.Build,v.Revision), root: package.InstalledPath()?.to_string() });
        }
        result.sort_by(|a,b| a.package.cmp(&b.package));
        Ok(result)
    };
    with_mta(query).map_err(|e|io::Error::other(format!("HOST_UPDATE_RUNTIME_DISCOVERY: {e}")))
}
#[cfg(not(windows))]
pub(super) fn registered() -> io::Result<Vec<RuntimePackage>> { Ok(Vec::new()) }

#[cfg(windows)]
fn with_mta<T>(query: impl FnOnce() -> windows::core::Result<T>) -> windows::core::Result<T> {
    use windows::Win32::System::Com::{CoIncrementMTAUsage, CoDecrementMTAUsage, CO_MTA_USAGE_COOKIE};
    struct Mta(CO_MTA_USAGE_COOKIE);
    impl Drop for Mta { fn drop(&mut self) { let _ = unsafe { CoDecrementMTAUsage(self.0) }; } }
    let _mta = Mta(unsafe { CoIncrementMTAUsage()? });
    query()
}
#[derive(Debug)]
pub(super) struct CatalogFile { pub name: String, pub size: u64, pub sha256: Option<String> }
#[cfg(windows)]
pub(super) fn catalog(xml: &str) -> io::Result<Vec<CatalogFile>> {
    use base64::Engine;
    use windows::{Data::Xml::Dom::{XmlDocument,XmlElement,XmlLoadSettings},core::{Interface,HSTRING}};
    with_mta(|| {
        let doc=XmlDocument::new()?;
        let settings=XmlLoadSettings::new()?;settings.SetProhibitDtd(true)?;
        doc.LoadXmlWithSettings(&HSTRING::from(xml),&settings)?;
        let root=doc.DocumentElement()?;
        if root.GetAttribute(&HSTRING::from("HashMethod"))? != "http://www.w3.org/2001/04/xmlenc#sha256" { return Err(windows::core::Error::from_hresult(windows::core::HRESULT(0x8007000du32 as i32))); }
        let mut result=Vec::new();
        for node in doc.SelectNodes(&HSTRING::from("/*[local-name()='BlockMap' and namespace-uri()='http://schemas.microsoft.com/appx/2010/blockmap']/*[local-name()='File']"))? {
            let file:XmlElement=node.cast()?;
            let name=file.GetAttribute(&HSTRING::from("Name"))?.to_string().replace('\\',"/");
            let size=file.GetAttribute(&HSTRING::from("Size"))?.to_string().parse::<u64>().map_err(|_|windows::core::Error::from_hresult(windows::core::HRESULT(0x8007000du32 as i32)))?;
            let whole=file.SelectNodes(&HSTRING::from("*[local-name()='FileHash' and namespace-uri()='http://schemas.microsoft.com/appx/2021/blockmap']"))?;
            let hashes=if whole.Length()?==0 && size<=65536 {
                // An MSIX block covers at most64KiB. A sole block is the whole
                // file, so its SHA is reusable without reading thousands of files.
                file.SelectNodes(&HSTRING::from("*[local-name()='Block' and namespace-uri()='http://schemas.microsoft.com/appx/2010/blockmap']"))?
            } else { whole };
            let digest=if size==0 && hashes.Length()?==0 { Some(hash(b"")) } else if hashes.Length()?==1 {
                let hash:XmlElement=hashes.Item(0)?.cast()?;
                let raw=base64::engine::general_purpose::STANDARD.decode(hash.GetAttribute(&HSTRING::from("Hash"))?.to_string()).map_err(|_|windows::core::Error::from_hresult(windows::core::HRESULT(0x8007000du32 as i32)))?;
                if raw.len()!=32 { return Err(windows::core::Error::from_hresult(windows::core::HRESULT(0x8007000du32 as i32))); }
                Some(raw.iter().map(|b|format!("{b:02x}")).collect())
            } else if hashes.Length()?==0 { None } else { return Err(windows::core::Error::from_hresult(windows::core::HRESULT(0x8007000du32 as i32))); };
            result.push(CatalogFile{name,size,sha256:digest});
        }
        Ok(result)
    }).map_err(|e|io::Error::other(format!("HOST_UPDATE_RUNTIME_CATALOG: {e}")))
}
#[cfg(not(windows))]
pub(super) fn catalog(_: &str) -> io::Result<Vec<CatalogFile>> { Err(io::Error::other("HOST_UPDATE_RUNTIME_CATALOG: Windows XML API required.")) }
