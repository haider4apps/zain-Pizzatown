# POS (ya Admin) ki window pehle se khuli ho to usi ko saamne le aata hai (minimize ho to bhi).
# Mil jaye to exit code 0, warna 1 (phir launcher nayi window kholta hai).
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class PtWin {
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr p);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);
  public static IntPtr Find(string start) {
    IntPtr hit = IntPtr.Zero;
    EnumWindows(delegate (IntPtr h, IntPtr p) {
      if (!IsWindowVisible(h)) return true;
      var sb = new StringBuilder(256); GetWindowText(h, sb, 256);
      if (sb.ToString().StartsWith(start)) { hit = h; return false; }
      return true;
    }, IntPtr.Zero);
    return hit;
  }
}
"@
$h = [PtWin]::Find('Pizza Town')
if ($h -eq [IntPtr]::Zero) { exit 1 }
if ([PtWin]::IsIconic($h)) { [PtWin]::ShowWindow($h, 9) | Out-Null } else { [PtWin]::ShowWindow($h, 5) | Out-Null }
# Windows doosre program ko saamne aane se rokta hai; Alt dabane ka chhota sa tareeqa
[PtWin]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
[PtWin]::SetForegroundWindow($h) | Out-Null
[PtWin]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
exit 0
