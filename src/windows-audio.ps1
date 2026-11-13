param(
    [Parameter(Mandatory)]
    [ValidateSet('pause', 'play', 'next', 'previous', 'volume-get', 'volume-up', 'volume-down', 'volume-set')]
    [string] $Action,
    [ValidateRange(0, 100)] [int] $Level,
    [ValidateSet('spotify')] [string] $Target
)

$ErrorActionPreference = 'Stop'

if ($Action.StartsWith('volume-')) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class QuinVolume {
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    private class DeviceEnumerator { }

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IDeviceEnumerator {
        void EnumAudioEndpoints();
        void GetDefaultAudioEndpoint(int flow, int role, out IDevice device);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IDevice {
        void Activate(ref Guid id, int context, IntPtr parameters, [MarshalAs(UnmanagedType.IUnknown)] out object instance);
    }

    [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IEndpointVolume {
        // Keep the native vtable order, including slots this helper never calls.
        void RegisterControlChangeNotify();
        void UnregisterControlChangeNotify();
        void GetChannelCount();
        void SetMasterVolumeLevel();
        void SetMasterVolumeLevelScalar(float level, IntPtr eventContext);
        void GetMasterVolumeLevel();
        void GetMasterVolumeLevelScalar(out float level);
    }

    public static int Control(string action, int level) {
        var enumerator = (IDeviceEnumerator)new DeviceEnumerator();
        IDevice device = null;
        object instance = null;
        try {
            enumerator.GetDefaultAudioEndpoint(0, 1, out device); // eRender, eMultimedia
            var id = typeof(IEndpointVolume).GUID;
            device.Activate(ref id, 23, IntPtr.Zero, out instance); // CLSCTX_ALL
            var volume = (IEndpointVolume)instance;
            float current;
            volume.GetMasterVolumeLevelScalar(out current);
            if (action != "volume-get") {
                var desired = action == "volume-set" ? level / 100f : current + (action == "volume-up" ? 0.1f : -0.1f);
                volume.SetMasterVolumeLevelScalar(Math.Max(0f, Math.Min(1f, desired)), IntPtr.Zero);
                volume.GetMasterVolumeLevelScalar(out current);
            }
            return (int)Math.Round(current * 100);
        } finally {
            if (instance != null) Marshal.ReleaseComObject(instance);
            if (device != null) Marshal.ReleaseComObject(device);
            Marshal.ReleaseComObject(enumerator);
        }
    }
}
'@
    [QuinVolume]::Control($Action, $Level)
    return
}

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1

function Wait-WindowsOperation($Operation, [type] $ResultType) {
    $task = $asTask.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
    if (!$task.Wait(2500)) { throw 'Windows media control timed out.' }
    return $task.Result
}

$manager = Wait-WindowsOperation ($managerType::RequestAsync()) $managerType
$session = $manager.GetCurrentSession()
if ($Target -eq 'spotify' -and $session.SourceAppUserModelId -notmatch 'spotify') {
    $session = $manager.GetSessions() | Where-Object { $_.SourceAppUserModelId -match 'spotify' } | Select-Object -First 1
}
if ($null -eq $session) { 'no-session'; return }

$expected = @{ pause = 'Paused'; play = 'Playing' }[$Action]
if ($expected -and $session.GetPlaybackInfo().PlaybackStatus.ToString() -eq $expected) {
    'already'
    return
}
$operation = switch ($Action) {
    'pause' { $session.TryPauseAsync() }
    'play' { $session.TryPlayAsync() }
    'next' { $session.TrySkipNextAsync() }
    'previous' { $session.TrySkipPreviousAsync() }
}
if (!(Wait-WindowsOperation $operation ([bool]))) { 'rejected'; return }
if ($expected) {
    $deadline = [DateTime]::UtcNow.AddMilliseconds(900)
    while ($session.GetPlaybackInfo().PlaybackStatus.ToString() -ne $expected) {
        if ([DateTime]::UtcNow -ge $deadline) { 'rejected'; return }
        Start-Sleep -Milliseconds 75
    }
}
'ok'
