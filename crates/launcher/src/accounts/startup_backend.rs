//! Launch-owned transport for native hosts without a Node inspector.
//! This process is the official CLI's stdio parent, not another executor.
use super::{AccountError, Result, relay, startup};
use serde_json::{Value, json};
use std::{process::Stdio, sync::Arc};
use tokio::{
    io::{AsyncReadExt, AsyncBufReadExt, AsyncWriteExt, BufReader},
    net::{TcpListener, TcpStream},
};

pub(crate) const ENV: &str = "CODE_CODEX_STARTUP_BACKEND";
fn failure(stage: &str) -> AccountError {
    AccountError::new(
        "ACCOUNT_STARTUP_ROUTE",
        format!("Startup transport unavailable. stage={stage}; no request was replayed."),
    )
}
fn parent_pid() -> u32 {
    #[cfg(windows)]
    {
        use windows_sys::Win32::{
            Foundation::{CloseHandle, INVALID_HANDLE_VALUE},
            System::Diagnostics::ToolHelp::*,
        };
        unsafe {
            let h = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if h == INVALID_HANDLE_VALUE {
                return 0;
            }
            let mut e: PROCESSENTRY32W = std::mem::zeroed();
            e.dwSize = std::mem::size_of_val(&e) as u32;
            let mut next = Process32FirstW(h, &mut e);
            let mut parent = 0;
            while next != 0 {
                if e.th32ProcessID == std::process::id() {
                    parent = e.th32ParentProcessID;
                    break;
                }
                next = Process32NextW(h, &mut e);
            }
            CloseHandle(h);
            parent
        }
    }
    #[cfg(not(windows))]
    {
        0
    }
}

/// Called before Clap/logging; stdout remains exclusively official JSONL.
pub(crate) async fn run(raw: std::ffi::OsString) -> Result<u8> {
    let mut p: Value = serde_json::from_str(&raw.to_string_lossy())
        .map_err(|_| failure("launch-configuration"))?;
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    let server = args.iter().any(|a| a == "app-server");
    let serving = server && !args.iter().any(|a| a == "--print-startup-config");
    let mut command = tokio::process::Command::new(
        p["backend"]
            .as_str()
            .ok_or_else(|| failure("backend-path"))?,
    );
    if server {
        if let Some(store) = super::credentials::official_home().ok()
            .as_deref().and_then(super::credentials::primary_launch_store)
        {
            command.args(["-c", &format!("cli_auth_credentials_store={}", json!(store))]);
        }
        command.args(native_server_overrides());
    }
    command
        .args(args)
        .env_remove(ENV)
        .env_remove("CODEX_CLI_PATH")
        .env("CODEX_APP_RUNTIME_CLI_PATH", p["backend"].as_str().unwrap())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    let listener = if serving {
        Some(
            TcpListener::bind((
                std::net::Ipv4Addr::LOCALHOST,
                p["port"].as_u64().unwrap() as u16,
            ))
            .await
            .map_err(|_| failure("bind"))?,
        )
    } else {
        None
    };
    let mut child = command.spawn().map_err(|_| failure("backend-spawn"))?;
    let transport=super::primary_transport::Transport::new(child.stdin.take().unwrap());
    if let Some(listener) = listener {
        p["brokerPid"] = json!(std::process::id());
        let official = parent_pid();
        if official == 0 {
            return Err(failure("launch-parent"));
        }
        p["transport"] = json!("primary-control");
        startup::save_descriptor(&p, official)?;
        let p = Arc::new(p);
        let transport = transport.clone();
        tokio::spawn(async move {
            while let Ok((stream, address)) = listener.accept().await {
                if !address.ip().is_loopback() {
                    continue;
                }
                let p = p.clone();
                let transport = transport.clone();
                tokio::spawn(async move {
                    let _ = serve(stream, &p, official, transport).await;
                });
            }
        });
    }
    let mut output = child.stdout.take().unwrap();
    let input_transport=transport.clone();
    let stdin = tokio::spawn(async move {
        let mut input=BufReader::new(tokio::io::stdin());let mut line=Vec::new();
        if !serving {let mut bytes=vec![0;64*1024];loop {let n=input.read(&mut bytes).await.unwrap_or(0);if n==0{break}if input_transport.forward(&bytes[..n]).await.is_err(){break}}return}
        loop {line.clear();if input.read_until(b'\n',&mut line).await.unwrap_or(0)==0{break}if input_transport.forward(&line).await.is_err(){break}line.fill(0);}
    });
    let stdout = tokio::spawn(async move {
        let mut target=tokio::io::stdout();
        if !serving {tokio::io::copy(&mut output,&mut target).await.map_err(|_|failure("backend-forward"))?;return Ok(())}
        let mut bytes=vec![0u8;64*1024];let mut line=Vec::new();let mut passthrough=false;
        loop {
            let n=output.read(&mut bytes).await.map_err(|_|failure("backend-read"))?;if n==0{break}
            for segment in bytes[..n].split_inclusive(|b|*b==b'\n') {
                if !passthrough&&line.len()+segment.len()>1024*1024 {target.write_all(&line).await.map_err(|_|failure("backend-forward"))?;line.clear();passthrough=true;}
                if passthrough {target.write_all(segment).await.map_err(|_|failure("backend-forward"))?;} else {line.extend_from_slice(segment);}
                if segment.last()==Some(&b'\n') {
                    if !passthrough {
                        let consumed=if let Ok(v)=serde_json::from_slice::<Value>(&line){
                            transport.consume(&v)
                        }else{false};
                        if !consumed{target.write_all(&line).await.map_err(|_|failure("backend-forward"))?;}
                    }
                    line.fill(0);line.clear();passthrough=false;
                }
            }
            target.flush().await.map_err(|_|failure("backend-flush"))?;
        }
        if !line.is_empty(){target.write_all(&line).await.map_err(|_|failure("backend-forward"))?;target.flush().await.map_err(|_|failure("backend-flush"))?;}
        Ok::<_,AccountError>(())
    });
    let exit = child.wait().await.map_err(|_| failure("backend-exit"))?;
    stdin.abort();
    stdout.await.map_err(|_| failure("backend-output"))??;
    Ok(exit.code().unwrap_or(1).clamp(0, 255) as u8)
}

// Keep the official provider, base URLs, proxy and compression defaults.
pub(crate) fn native_server_overrides() -> [&'static str; 2] {
    ["-c", "thread_unload_delay_secs=0"]
}

async fn serve(
    stream: TcpStream,
    p: &Value,
    official: u32,
    transport: Arc<super::primary_transport::Transport>,
) -> Result<()> {
    let mut io = BufReader::new(stream);
    let raw = relay::read_header(&mut io).await?;
    let request = relay::parse_header_paths(
        &raw,
        &format!("localhost:{}", p["port"]),
        p["key"].as_str().unwrap(),
        &["/control"],
    )?;
    if request.websocket
        || request.headers.get("x-code-codex-control").and_then(|v| v.to_str().ok())
            != p["control"].as_str()
        || request.length > 16384
    {
        return relay::reject(
            &mut io,
            403,
            "ACCOUNT_STARTUP_CONTROL: Control authentication failed.",
        ).await;
    }
    let mut body = vec![0; request.length];
    io.read_exact(&mut body).await.map_err(|_| failure("control-read"))?;
    let reply = match serde_json::from_slice::<Value>(&body) {
        Ok(value) if value["action"] == "primary-switch" => transport.switch(&value).await,
        Ok(value) if value["action"] == "status" => Ok(json!({
            "schema": 1,
            "pid": official,
            "rendererPort": p["rendererPort"],
            "ready": true,
            "spawns": 1,
            "primarySwitch": 2
        })),
        _ => Err(failure("control-action")),
    };
    match reply {
        Ok(value) => {
            let body = value.to_string();
            io.write_all(format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{body}",
                body.len()
            ).as_bytes()).await.map_err(|_| failure("control-reply"))
        }
        Err(error) => relay::reject(&mut io, 409, &error.message).await,
    }
}
