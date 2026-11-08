//! Child-process evidence only. Never retain raw stderr, credentials, URLs or bodies.
use serde_json::{Value, json};
use std::{collections::VecDeque, sync::{Mutex, atomic::{AtomicU64, Ordering}}, time::Instant};

const MAX_LINE: usize = 8192;
const MAX_RECENT: usize = 8;
static NEXT_BACKEND: AtomicU64 = AtomicU64::new(1);

pub(super) struct Evidence {
    pub id: u64,
    state: Mutex<State>,
}
struct State {
    stdout_messages: u64,
    last_stdout: Option<Instant>,
    stderr_bytes: u64,
    stderr_lines: u64,
    oversized_lines: u64,
    stderr_ended: bool,
    stderr_io_kind: Option<String>,
    stderr_os_code: Option<i32>,
    terminal: Option<&'static str>,
    pid: Option<u32>,
    recent: VecDeque<(Instant, &'static str, Option<i32>)>,
}
impl Default for Evidence {
    fn default() -> Self {
        Self { id: NEXT_BACKEND.fetch_add(1, Ordering::Relaxed), state: Mutex::new(State {
            stdout_messages:0,last_stdout:None,stderr_bytes:0,stderr_lines:0,oversized_lines:0,
            stderr_ended:false,stderr_io_kind:None,stderr_os_code:None,terminal:None,pid:None,recent:VecDeque::new(),
        }) }
    }
}
impl Evidence {
    pub fn process(&self,pid:Option<u32>) {self.state.lock().unwrap_or_else(std::sync::PoisonError::into_inner).pid=pid;}
    pub fn stdout(&self) { let mut s=self.state.lock().unwrap_or_else(std::sync::PoisonError::into_inner);s.stdout_messages+=1;s.last_stdout=Some(Instant::now()); }
    pub fn terminal(&self, reason:&'static str) {self.state.lock().unwrap_or_else(std::sync::PoisonError::into_inner).terminal=Some(reason);}
    pub fn bytes(&self, n:usize) {self.state.lock().unwrap_or_else(std::sync::PoisonError::into_inner).stderr_bytes+=n as u64;}
    pub fn line(&self, bytes:&[u8], oversized:bool) {
        let mut s=self.state.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        s.stderr_lines+=1;
        if oversized {s.oversized_lines+=1;return;}
        let Ok(text)=std::str::from_utf8(bytes) else{return};
        // Only fixed categories survive. Text is inspected transiently, never logged.
        let category=classify(text);
        if category!="unclassified" {
            if s.recent.len()==MAX_RECENT {s.recent.pop_front();}
            s.recent.push_back((Instant::now(),category,os_code(text)));
        }
    }
    pub fn stderr_end(&self,error:Option<&std::io::Error>) {
        let mut s=self.state.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        s.stderr_ended=true;
        if let Some(e)=error {s.stderr_io_kind=Some(format!("{:?}",e.kind()));s.stderr_os_code=e.raw_os_error();}
    }
    pub fn snapshot(&self)->Value {
        let environment=crate::network_diagnostics::environment();
        let s=self.state.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        // Reuse the shared read-only configuration probe, without claiming the
        // independently bundled official child uses our reqwest/TLS implementation.
        let mut proxy=json!({"childRouteVerified":false});
        for key in ["httpProxyEnvPresent","httpsProxyEnvPresent","allProxyEnvPresent","noProxyEnvPresent","windowsProxy"] {proxy[key]=environment[key].clone();}
        json!({"schema":1,"backendInstance":self.id,"backendPid":s.pid,"stdoutMessages":s.stdout_messages,
            "lastStdoutAgeMs":s.last_stdout.map(|at|at.elapsed().as_millis()),"stdoutTerminal":s.terminal,
            "stderrBytes":s.stderr_bytes,"stderrLines":s.stderr_lines,"oversizedLines":s.oversized_lines,
            "stderrEnded":s.stderr_ended,"stderrIoKind":s.stderr_io_kind,"stderrOsCode":s.stderr_os_code,
            "nearbyStderr":s.recent.iter().filter(|(at,_,_)|at.elapsed().as_secs()<60).map(|(at,category,os_code)|json!({"category":category,"osCode":os_code,"ageMs":at.elapsed().as_millis()})).collect::<Vec<_>>(),
            "proxyConfiguration":proxy,"stderrRequestAssociation":"unproven","rawTextRetained":false,"loginExpirationInferred":false})
    }
}

/// Bounded scratch, including streams without newlines. Oversized lines are discarded whole.
#[derive(Default)]
pub(super) struct Lines {bytes:Vec<u8>, oversized:bool}
impl Lines {
    pub fn feed(&mut self,input:&[u8],evidence:&Evidence) {
        evidence.bytes(input.len());
        for &byte in input {
            if byte==b'\n' {self.finish(evidence);}
            else if !self.oversized {
                if self.bytes.len()==MAX_LINE {self.bytes.clear();self.oversized=true;}
                else {self.bytes.push(byte);}
            }
        }
    }
    pub fn finish(&mut self,evidence:&Evidence) {
        if self.oversized||!self.bytes.is_empty() {evidence.line(&self.bytes,self.oversized);}
        self.bytes.clear();self.oversized=false;
    }
}

/// Text evidence from the official child, not typed reqwest evidence or an auth verdict.
/// Unknown/outer-only errors stay unknown; never expose the matched substring.
pub(super) fn classify(text:&str)->&'static str {
    if text.len()>MAX_LINE {return "unclassified";}
    let t=text.to_ascii_lowercase();
    for (needles,category) in [
        (&["certificate has expired","certificateexpired","certificate expired"][..],"TLS_EXPIRED"),
        (&["unknownissuer","unknown issuer","unable to get local issuer certificate"][..],"TLS_UNKNOWN_ISSUER"),
        (&["invalid peer certificate","certificate verify failed"][..],"TLS_CERTIFICATE"),
        (&["tls handshake failed","tls handshake eof"][..],"TLS_HANDSHAKE"),
        (&["proxy authentication required","proxy status: 407"][..],"PROXY_AUTH"),
        (&["unsuccessful tunnel","tunnel error","proxy connect failed"][..],"PROXY_TUNNEL"),
        (&["dns error","failed to lookup address","failed to resolve host","name or service not known","os error 11001"][..],"DNS"),
        (&["connection refused","os error 10061"][..],"CONNECTION_REFUSED"),
        (&["connection reset by peer","os error 10054"][..],"CONNECTION_RESET"),
        (&["connection aborted","os error 10053"][..],"CONNECTION_ABORTED"),
        (&["os error 10013"][..],"ACCESS_DENIED"),
        (&["operation timed out","connection timed out","os error 10060"][..],"TIMEOUT_OPERATION"),
        (&["http status: 401","http status 401","401 unauthorized"][..],"HTTP_AUTH"),
        (&["http status: 403","http status 403","403 forbidden"][..],"HTTP_FORBIDDEN"),
        (&["http status: 429","http status 429","429 too many requests"][..],"HTTP_RATE_LIMIT"),
        (&["http status: 500","http status 500","500 internal server error","http status: 502","502 bad gateway","http status: 503","503 service unavailable","http status: 504","504 gateway timeout"][..],"HTTP_SERVER"),
        (&["error sending request for url"][..],"transport-cause-unavailable"),
    ] {
        if needles.iter().any(|n|t.contains(n)) {return category;}
    }
    "unclassified"
}
fn os_code(text:&str)->Option<i32> {
    let lower=text.to_ascii_lowercase();
    lower.match_indices("os error ").find_map(|(at,_)| {
        let digits:String=lower[at+9..].chars().take_while(char::is_ascii_digit).take(6).collect();
        digits.parse::<i32>().ok().filter(|c|[10013,10053,10054,10060,10061,11001].contains(c))
    })
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn categories_preserve_inner_reason_without_secret_text() {
        for (input,want) in [
            ("error sending request for url (https://secret/?token=private): dns error: failed to lookup address","DNS"),
            ("invalid peer certificate: UnknownIssuer Bearer private","TLS_UNKNOWN_ISSUER"),
            ("connection error: os error 10061 user@private.test","CONNECTION_REFUSED"),
            ("connection reset by peer secret","CONNECTION_RESET"),
            ("proxy authentication required private","PROXY_AUTH"),
            ("HTTP status: 401 secret","HTTP_AUTH"),
            ("error sending request for url (private)","transport-cause-unavailable"),
            ("account read deadline expired","unclassified"),
            ("token_expired","unclassified"),
        ] {assert_eq!(classify(input),want);let e=Evidence::default();e.line(input.as_bytes(),false);let v=e.snapshot();assert!(!v.to_string().contains("private"));assert_eq!(v["loginExpirationInferred"],false);}
    }
    #[test] fn chunked_lines_invalid_utf8_eof_and_flood_are_bounded() {
        let e=Evidence::default();let mut lines=Lines::default();
        lines.feed(b"connection re",&e);lines.feed(b"set by peer private\n\xff\xfe\n",&e);
        for _ in 0..2048 {lines.feed(&[b'x';1024],&e);assert!(lines.bytes.len()<=MAX_LINE);}
        lines.feed(b"dns error\n",&e); // Oversized whole line must not classify its tail.
        assert_eq!(e.snapshot()["nearbyStderr"].as_array().unwrap().len(),1);
        for _ in 0..32 {lines.feed(b"dns error private\n",&e);}
        lines.feed(b"connection refused private",&e);lines.finish(&e);
        let v=e.snapshot();assert_eq!(v["oversizedLines"],1);assert_eq!(v["nearbyStderr"].as_array().unwrap().len(),MAX_RECENT);
        assert!(!v.to_string().contains("private"));
        assert_eq!(v["nearbyStderr"][MAX_RECENT-1]["category"],"CONNECTION_REFUSED");
    }
    #[test] fn instances_stream_activity_and_errors_are_separate() {
        let a=Evidence::default();let b=Evidence::default();assert_ne!(a.id,b.id);
        a.stdout();a.terminal("stdout-eof");a.stderr_end(Some(&std::io::Error::from_raw_os_error(5)));
        assert_eq!(a.snapshot()["stdoutMessages"],1);assert_eq!(b.snapshot()["stdoutMessages"],0);
        assert_eq!(a.snapshot()["stderrOsCode"],5);assert_eq!(a.snapshot()["stdoutTerminal"],"stdout-eof");
        let safe=crate::runtime_log::redaction::value(a.snapshot());assert_eq!(safe["backendInstance"],a.id);
    }
}
