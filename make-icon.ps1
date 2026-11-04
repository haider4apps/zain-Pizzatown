# Desktop par "Pizza Town" icon banata hai (agar pehle se na ho). Server har start par chalata hai.
# Icon dabane par open-pos.vbs: POS khula ho to wohi saamne, warna tray jaisi window (silent print wali).
$ErrorActionPreference = 'SilentlyContinue'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$desk = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desk 'Pizza Town.lnk'
$common = Join-Path ([Environment]::GetFolderPath('CommonDesktopDirectory')) 'Pizza Town.lnk'
if ((Test-Path $lnk) -or (Test-Path $common)) { exit 0 }
$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$s.TargetPath = 'wscript.exe'
$s.Arguments = '"' + $dir + '\open-pos.vbs"'
$s.WorkingDirectory = $dir
$c = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LocalAppData\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($c) { $s.IconLocation = $c + ',0' }
$s.Description = 'Pizza Town POS kholein'
$s.Save()
if (Test-Path $lnk) { exit 0 } else { exit 1 }
