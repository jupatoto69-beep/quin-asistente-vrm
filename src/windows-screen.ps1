param(
    [Parameter(Mandatory)] [int] $Left,
    [Parameter(Mandatory)] [int] $Top,
    [Parameter(Mandatory)] [ValidateRange(1, 16384)] [int] $Width,
    [Parameter(Mandatory)] [ValidateRange(1, 16384)] [int] $Height
)

$ErrorActionPreference = 'Stop'
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

public static class QuinScreen {
    [DllImport("user32.dll")]
    private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);

    public static byte[] Capture(int left, int top, int width, int height) {
        var previous = SetThreadDpiAwarenessContext(new IntPtr(-4)); // Per-monitor DPI awareness v2.
        if (previous == IntPtr.Zero) throw new InvalidOperationException("Could not use physical screen coordinates.");
        try {
            using (var frame = new Bitmap(width, height, PixelFormat.Format24bppRgb)) {
                using (var screen = Graphics.FromImage(frame)) {
                    screen.CopyFromScreen(left, top, 0, 0, frame.Size, CopyPixelOperation.SourceCopy);
                }
                var scale = Math.Min(1.0, 1600.0 / Math.Max(width, height));
                using (var output = new Bitmap(Math.Max(1, (int)Math.Round(width * scale)),
                    Math.Max(1, (int)Math.Round(height * scale)), PixelFormat.Format24bppRgb)) {
                    using (var graphics = Graphics.FromImage(output)) {
                        graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                        graphics.DrawImage(frame, 0, 0, output.Width, output.Height);
                    }
                    using (var stream = new MemoryStream())
                    using (var encoder = new EncoderParameters(1)) {
                        encoder.Param[0] = new EncoderParameter(Encoder.Quality, 91L);
                        var jpeg = Array.Find(ImageCodecInfo.GetImageEncoders(), item => item.FormatID == ImageFormat.Jpeg.Guid);
                        output.Save(stream, jpeg, encoder);
                        return stream.ToArray();
                    }
                }
            }
        } finally {
            SetThreadDpiAwarenessContext(previous);
        }
    }
}
'@

$bytes = [QuinScreen]::Capture($Left, $Top, $Width, $Height)
$stdout = [Console]::OpenStandardOutput()
$stdout.Write($bytes, 0, $bytes.Length)
$stdout.Flush()
