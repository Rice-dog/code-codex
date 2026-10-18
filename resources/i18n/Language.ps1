# Embedded by the native UI helper; no network or official profile dependencies.
$script:CodeCodexUiLocale = if ($env:CLE_UI_LANGUAGE -in @('zh-CN','en')) { $env:CLE_UI_LANGUAGE } elseif ([Globalization.CultureInfo]::CurrentUICulture.TwoLetterISOLanguageName -eq 'zh') { 'zh-CN' } else { 'en' }
$script:CodeCodexUiEnglish = [IO.File]::ReadAllText((Join-Path $env:CLE_UI_LANGUAGE_RESOURCES 'en.json'),[Text.Encoding]::UTF8) | ConvertFrom-Json
$script:CodeCodexUiChinese = [IO.File]::ReadAllText((Join-Path $env:CLE_UI_LANGUAGE_RESOURCES 'zh-CN.json'),[Text.Encoding]::UTF8) | ConvertFrom-Json
$script:CodeCodexUiReverse = @{}
foreach ($entry in $script:CodeCodexUiEnglish.PSObject.Properties) {
    $script:CodeCodexUiReverse[[string]$entry.Value] = $entry.Name
    $translation = $script:CodeCodexUiChinese.PSObject.Properties[$entry.Name]
    if ($translation) { $script:CodeCodexUiReverse[[string]$translation.Value] = $entry.Name }
}
$script:CodeCodexUiOriginals = New-Object 'System.Collections.Generic.Dictionary[object,object]'
function ConvertTo-CodeCodexUiText([string]$Text) {
    if ($null -eq $Text) { return '' }
    $key = $script:CodeCodexUiReverse[$Text]
    if ($key) {
        $catalog = if ($script:CodeCodexUiLocale -eq 'zh-CN') { $script:CodeCodexUiChinese } else { $script:CodeCodexUiEnglish }
        return [string]$catalog.PSObject.Properties[$key].Value
    }
    if ($Text -match '^(Code-Codex setup|Code-Codex uninstall|Code-Codex 安装|卸载 Code-Codex)( v[0-9.]+)$') { return (ConvertTo-CodeCodexUiText $Matches[1])+$Matches[2] }
    if ($script:CodeCodexUiLocale -eq 'zh-CN' -and $Text.Length -le 4096) {
        foreach ($entry in $script:CodeCodexUiEnglish.PSObject.Properties) {
            $template=[string]$entry.Value
            $slot=[regex]::Match($template,'\{[A-Za-z][A-Za-z0-9]*\}')
            if (-not $slot.Success -or $template.Substring($slot.Index+$slot.Length).Contains('{')) { continue }
            $prefix=$template.Substring(0,$slot.Index);$suffix=$template.Substring($slot.Index+$slot.Length)
            if ($Text.Length -ge $prefix.Length+$suffix.Length -and $Text.StartsWith($prefix,[StringComparison]::Ordinal) -and $Text.EndsWith($suffix,[StringComparison]::Ordinal)) {
                $value=$Text.Substring($prefix.Length,$Text.Length-$prefix.Length-$suffix.Length)
                return ([string]$script:CodeCodexUiChinese.PSObject.Properties[$entry.Name].Value).Replace($slot.Value,$value)
            }
        }
    }
    if ($Text.Contains("`n")) { return (($Text -split "`r?`n" | ForEach-Object { ConvertTo-CodeCodexUiText $_ }) -join "`n") }
    return $Text
}
function Update-CodeCodexFormLanguage($Control) {
    # Never touch user input, the original license, or raw diagnostic evidence.
    if ($Control.AccessibleName) { $Control.AccessibleName = ConvertTo-CodeCodexUiText $Control.AccessibleName }
    if ($Control -is [Windows.Forms.TextBoxBase] -or $Control -is [Windows.Forms.ComboBox]) { return }
    $current = [string]$Control.Text
    $prior = $script:CodeCodexUiOriginals[$Control]
    $source = if ($prior -and $current -eq $prior.rendered) { [string]$prior.source } else { $current }
    $rendered = ConvertTo-CodeCodexUiText $source
    $script:CodeCodexUiOriginals[$Control] = @{source=$source;rendered=$rendered}
    if ($rendered -ne $current) { $Control.Text=$rendered }
    foreach ($child in $Control.Controls) { Update-CodeCodexFormLanguage $child }
}
