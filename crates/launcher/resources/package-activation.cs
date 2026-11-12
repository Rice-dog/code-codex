using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace CodexLiveExplorerPackageGuard
{
    public static class ControlInput
    {
        // Console.In.ReadLineAsync can block synchronously on .NET Framework.
        // Run the actual read on a CLR thread, never a PowerShell scriptblock.
        public static System.Threading.Tasks.Task<string> BeginRead()
        {
            return System.Threading.Tasks.Task.Factory.StartNew(
                () => Console.In.ReadLine(), System.Threading.CancellationToken.None,
                System.Threading.Tasks.TaskCreationOptions.LongRunning,
                System.Threading.Tasks.TaskScheduler.Default);
        }
    }
    [Flags]
    public enum ActivateOptions : uint
    {
        None = 0,
        DesignMode = 1,
        NoErrorUI = 2,
        NoSplashScreen = 4
    }

    public enum PackageExecutionState : int
    {
        Unknown = 0,
        Running = 1,
        Suspending = 2,
        Suspended = 3,
        Terminated = 4
    }

    [ComImport]
    [Guid("1BB12A62-2AD8-432B-8CCF-0C2C52AFCD5B")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IPackageExecutionStateChangeNotification
    {
        [PreserveSig]
        int OnStateChanged(
            [MarshalAs(UnmanagedType.LPWStr)] string packageFullName,
            PackageExecutionState newState);
    }

    [ComImport]
    [Guid("2E941141-7F97-4756-BA1D-9DECDE894A3D")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IApplicationActivationManager
    {
        [PreserveSig]
        int ActivateApplication(
            [MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
            [MarshalAs(UnmanagedType.LPWStr)] string arguments,
            ActivateOptions options,
            out uint processId);

        [PreserveSig]
        int ActivateForFile(
            [MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
            IntPtr itemArray,
            [MarshalAs(UnmanagedType.LPWStr)] string verb,
            out uint processId);

        [PreserveSig]
        int ActivateForProtocol(
            [MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
            IntPtr itemArray,
            out uint processId);
    }

    [ComImport]
    [Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")]
    public class ApplicationActivationManager
    {
    }

    // Method order and signatures mirror the complete IPackageDebugSettings
    // vtable in ShObjIdl_core.h. In particular, TerminateAllProcesses is slot
    // 5 and GetPackageExecutionState is slot 13 after IUnknown.
    [ComImport]
    [Guid("F27C3930-8029-4AD1-94E3-3DBA417810C1")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IPackageDebugSettings
    {
        [PreserveSig]
        int EnableDebugging(
            [MarshalAs(UnmanagedType.LPWStr)] string packageFullName,
            [MarshalAs(UnmanagedType.LPWStr)] string debuggerCommandLine,
            IntPtr environment);

        [PreserveSig]
        int DisableDebugging(
            [MarshalAs(UnmanagedType.LPWStr)] string packageFullName);

        [PreserveSig]
        int Suspend(
            [MarshalAs(UnmanagedType.LPWStr)] string packageFullName);

        [PreserveSig]
        int Resume(
            [MarshalAs(UnmanagedType.LPWStr)] string packageFullName);

        [PreserveSig]
        int TerminateAllProcesses(
            [MarshalAs(UnmanagedType.LPWStr)] string packageFullName);

        [PreserveSig]
        int SetTargetSessionId(uint sessionId);

        [PreserveSig]
        int EnumerateBackgroundTasks(
            [MarshalAs(UnmanagedType.LPWStr)] string packageFullName,
            out uint taskCount,
            out IntPtr taskIds,
            out IntPtr taskNames);

        [PreserveSig]
        int ActivateBackgroundTask(ref Guid taskId);

        [PreserveSig]
        int StartServicing(
            [MarshalAs(UnmanagedType.LPWStr)] string packageFullName);

        [PreserveSig]
        int StopServicing(
            [MarshalAs(UnmanagedType.LPWStr)] string packageFullName);

        [PreserveSig]
        int StartSessionRedirection(
            [MarshalAs(UnmanagedType.LPWStr)] string packageFullName,
            uint sessionId);

        [PreserveSig]
        int StopSessionRedirection(
            [MarshalAs(UnmanagedType.LPWStr)] string packageFullName);

        [PreserveSig]
        int GetPackageExecutionState(
            [MarshalAs(UnmanagedType.LPWStr)] string packageFullName,
            out PackageExecutionState packageExecutionState);

        [PreserveSig]
        int RegisterForPackageStateChanges(
            [MarshalAs(UnmanagedType.LPWStr)] string packageFullName,
            IPackageExecutionStateChangeNotification packageExecutionStateChangeNotification,
            out uint cookie);

        [PreserveSig]
        int UnregisterForPackageStateChanges(uint cookie);
    }

    [ComImport]
    [Guid("B1AEC16F-2383-4852-B0E9-8F0B1DC66B4D")]
    public class PackageDebugSettings
    {
    }

    public sealed class ActivationResult
    {
        public int HResult { get; set; }
        public uint ProcessId { get; set; }
    }

    public static class Activator
    {
        public static ActivationResult Activate(string appUserModelId, string arguments)
        {
            IApplicationActivationManager manager = null;
            uint processId = 0;
            int hresult;
            try
            {
                manager = (IApplicationActivationManager)new ApplicationActivationManager();
                hresult = manager.ActivateApplication(
                    appUserModelId,
                    arguments,
                    ActivateOptions.NoErrorUI,
                    out processId);
            }
            catch (Exception error)
            {
                hresult = Marshal.GetHRForException(error);
                processId = 0;
            }
            finally
            {
                if (manager != null && Marshal.IsComObject(manager))
                {
                    try
                    {
                        Marshal.FinalReleaseComObject(manager);
                    }
                    catch
                    {
                    }
                }
            }
            return new ActivationResult { HResult = hresult, ProcessId = processId };
        }
    }

    public sealed class PackageController : IDisposable
    {
        private IPackageDebugSettings settings;

        public PackageController()
        {
            settings = (IPackageDebugSettings)new PackageDebugSettings();
        }

        public int TerminateAllProcesses(string packageFullName)
        {
            return settings.TerminateAllProcesses(packageFullName);
        }

        public void Dispose()
        {
            if (settings != null && Marshal.IsComObject(settings))
            {
                Marshal.FinalReleaseComObject(settings);
            }
            settings = null;
        }
    }
}
