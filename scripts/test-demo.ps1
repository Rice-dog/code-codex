[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$DemoRoot = Join-Path $RepoRoot "demo-video"
$DemoPath = Join-Path $RepoRoot "docs\demo\CodexLiveExplorer-0.1.0-demo.mp4"
$Ffprobe = Join-Path $DemoRoot "node_modules\@remotion\compositor-win32-x64-msvc\ffprobe.exe"

if (-not (Test-Path -LiteralPath $DemoPath -PathType Leaf)) {
    throw "Demo video is missing: $DemoPath"
}
if (-not (Test-Path -LiteralPath $Ffprobe -PathType Leaf)) {
    throw "Remotion ffprobe is missing. Run npm ci in demo-video first."
}

$probeOutput = & $Ffprobe `
    -v error `
    -show_entries "stream=codec_name,codec_type,width,height,r_frame_rate,avg_frame_rate,nb_frames,duration:format=duration" `
    -of json `
    $DemoPath
if ($LASTEXITCODE -ne 0) {
    throw "Unable to inspect the demo video."
}

$metadata = $probeOutput | ConvertFrom-Json
$videoStreams = @($metadata.streams | Where-Object { $_.codec_type -eq "video" })
$audioStreams = @($metadata.streams | Where-Object { $_.codec_type -eq "audio" })
if ($videoStreams.Count -ne 1 -or $audioStreams.Count -ne 0) {
    throw "The release demo must contain exactly one video stream and no audio streams."
}

$video = $videoStreams[0]
$checks = [ordered]@{
    codec = [string]$video.codec_name -eq "h264"
    dimensions = [int]$video.width -eq 1920 -and [int]$video.height -eq 1080
    frameRate = [string]$video.r_frame_rate -eq "30/1" -and [string]$video.avg_frame_rate -eq "30/1"
    frameCount = [string]$video.nb_frames -eq "2700"
    streamDuration = [string]$video.duration -eq "90.000000"
    containerDuration = [string]$metadata.format.duration -eq "90.000000"
}
$failed = @($checks.GetEnumerator() | Where-Object { -not $_.Value } | ForEach-Object Key)
if ($failed.Count -gt 0) {
    throw "Demo video failed release constraints: $($failed -join ', ')"
}

Write-Host "Demo video contract passed (H.264, 1920x1080, 30 fps, 2700 frames, 90.000 seconds)."
