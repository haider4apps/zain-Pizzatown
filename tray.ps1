# Pizza Town: server ko chhupa kar chalata hai aur taskbar ke tray mein icon deta hai.
# Icon par right-click: POS kholo / Server restart / Band karo
$ErrorActionPreference = 'Continue'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $dir
$env:Path = $env:Path + ";$env:ProgramFiles\nodejs;$env:ProgramFiles\Git\cmd"

# Dobara na chale (aik hi tray icon)
$created = $false
$mutex = New-Object System.Threading.Mutex($true, 'PizzaTownTrayMutex', [ref]$created)
if (-not $created) { exit }

if (-not (Test-Path "$dir\node_modules")) {
  Start-Process -FilePath cmd.exe -ArgumentList '/c', 'npm install --omit=dev' -WorkingDirectory $dir -WindowStyle Hidden -Wait
}

$script:srv = $null
function Start-PizzaServer {
  $script:srv = Start-Process -FilePath cmd.exe -ArgumentList '/c', ('"' + $dir + '\run-server.bat"') -WorkingDirectory $dir -WindowStyle Hidden -PassThru
}
function Stop-PizzaServer {
  if ($script:srv -and -not $script:srv.HasExited) {
    & taskkill.exe /PID $script:srv.Id /T /F | Out-Null
  }
  $script:srv = $null
}
function Open-Pos {
  $paths = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LocalAppData\Google\Chrome\Application\chrome.exe")
  $chrome = $paths | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($chrome) {
    Start-Process -FilePath $chrome -ArgumentList '--kiosk-printing', ('--user-data-dir="' + $dir + '\chrome-profile"'), '--app=http://localhost:3000'
  } else {
    Start-Process 'http://localhost:3000'
  }
}

# Icon: gold gol par "P"
$bmp = New-Object System.Drawing.Bitmap 32, 32
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(232, 185, 76))), 1, 1, 30, 30)
$font = New-Object System.Drawing.Font('Arial', 17, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$g.DrawString('P', $font, (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(32, 22, 3))), 8, 5)
$g.Dispose()
$icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())

$ni = New-Object System.Windows.Forms.NotifyIcon
$ni.Icon = $icon
$ni.Text = 'Pizza Town server chal raha hai'
$menu = New-Object System.Windows.Forms.ContextMenuStrip
$miOpen = $menu.Items.Add('Pizza Town POS kholo')
$miRestart = $menu.Items.Add('Server restart karo')
[void]$menu.Items.Add('-')
$miExit = $menu.Items.Add('Band karo (server band ho jayega)')
$ni.ContextMenuStrip = $menu
$ni.Visible = $true

$miOpen.add_Click({ Open-Pos })
$ni.add_DoubleClick({ Open-Pos })
$miRestart.add_Click({
  Stop-PizzaServer
  Start-Sleep -Seconds 2
  Start-PizzaServer
  $ni.ShowBalloonTip(3000, 'Pizza Town', 'Server dobara chal gaya', [System.Windows.Forms.ToolTipIcon]::Info)
})
$miExit.add_Click({
  Stop-PizzaServer
  $ni.Visible = $false
  $ni.Dispose()
  [System.Windows.Forms.Application]::Exit()
})

Start-PizzaServer
$ni.ShowBalloonTip(3000, 'Pizza Town', 'Server chal gaya. Icon par right-click karein.', [System.Windows.Forms.ToolTipIcon]::Info)
[System.Windows.Forms.Application]::Run()
