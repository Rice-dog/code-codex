"""Local real encrypted-engine acceptance; never controls another machine.

Creates two owned processes, approves only that pair, opens native desktop/files
and revokes it. No synthetic keyboard input or file-content recording.
"""
import argparse,ctypes,json,queue,subprocess,threading,time
from ctypes import wintypes
from pathlib import Path

class Peer:
    def __init__(self, engine, *, loopback=True):
        self.process=subprocess.Popen([str(engine)]+(['--loopback-test'] if loopback else []),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,
                                      creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        self.job=OwnedJob(self.process)
        self.events=queue.Queue();self.sequence=0;self.latest={}
        def read():
            for line in self.process.stdout:
                try:self.events.put(json.loads(line))
                except (ValueError,UnicodeError):pass
            self.events.put({'eof':True})
        threading.Thread(target=read,daemon=True).start()
        try:self.wait(lambda e:e.get('event')=='ready')
        except Exception:self.close();raise
    def wait(self, predicate, budget=30):
        deadline=time.monotonic()+budget
        while True:
            event=self.events.get(timeout=max(.01,deadline-time.monotonic()))
            if event.get('event')=='state':self.latest=event['state']
            if predicate(event):return event
            if event.get('eof'):raise RuntimeError('Owned native engine exited before the expected result')
            if time.monotonic()>deadline:raise TimeoutError('Native acceptance event did not arrive')
    def command(self, action, **params):
        self.sequence+=1;identifier=self.sequence
        self.process.stdin.write((json.dumps({'id':identifier,'action':action,**params})+'\n').encode());self.process.stdin.flush()
        event=self.wait(lambda e:e.get('id')==identifier)
        if 'error' in event:raise RuntimeError(event['error'])
        self.latest=event['result'];return event['result']
    def phase(self, phase, budget=30):
        if self.latest.get('phase')==phase:return self.latest
        return self.wait(lambda e:e.get('event')=='state' and e['state']['phase']==phase,budget)['state']
    def close(self):
        if self.process.poll() is None:
            try:self.command('stop');self.process.stdin.close();self.process.wait(timeout=8)
            except Exception:self.process.kill();self.process.wait()
        self.job.close()

class OwnedJob:
    """Keep every process launched by this acceptance test inside its own job."""
    def __init__(self, process):
        class Basic(ctypes.Structure):
            _fields_=[('processTime',ctypes.c_longlong),('jobTime',ctypes.c_longlong),('flags',wintypes.DWORD),('min',ctypes.c_size_t),('max',ctypes.c_size_t),('active',wintypes.DWORD),('affinity',ctypes.c_size_t),('priority',wintypes.DWORD),('scheduling',wintypes.DWORD)]
        class Extended(ctypes.Structure):
            _fields_=[('basic',Basic),('io',ctypes.c_ulonglong*6),('processMemory',ctypes.c_size_t),('jobMemory',ctypes.c_size_t),('peakProcess',ctypes.c_size_t),('peakJob',ctypes.c_size_t)]
        self.kernel=ctypes.WinDLL('kernel32',use_last_error=True)
        self.kernel.CreateJobObjectW.argtypes=[ctypes.c_void_p,wintypes.LPCWSTR];self.kernel.CreateJobObjectW.restype=wintypes.HANDLE
        self.kernel.SetInformationJobObject.argtypes=[wintypes.HANDLE,ctypes.c_int,ctypes.c_void_p,wintypes.DWORD]
        self.kernel.AssignProcessToJobObject.argtypes=[wintypes.HANDLE,wintypes.HANDLE]
        self.kernel.CloseHandle.argtypes=[wintypes.HANDLE]
        self.handle=self.kernel.CreateJobObjectW(None,None);limits=Extended();limits.basic.flags=0x2000
        if not self.handle or not self.kernel.SetInformationJobObject(self.handle,9,ctypes.byref(limits),ctypes.sizeof(limits)) or not self.kernel.AssignProcessToJobObject(self.handle,wintypes.HANDLE(int(process._handle))):
            process.kill();self.close();raise ctypes.WinError(ctypes.get_last_error())
    def close(self):
        if self.handle:self.kernel.CloseHandle(self.handle);self.handle=None

def run(engine):
    checks=[]
    production=Peer(engine,loopback=False)
    try:
        try:production.command('open',code='123456',address='203.0.113.10')
        except RuntimeError as error:assert str(error).startswith('REMOTE_ADDRESS_INVALID:')
        else:raise AssertionError('Public address accepted')
        assert production.command('status')['phase']=='idle'
        checks.append('Production helper rejects a public destination without opening a room')
    finally:production.close()
    host=Peer(engine);guest=Peer(engine)
    try:
        code=str(100000+time.time_ns()%900000)
        started=time.monotonic();host.command('open',code=code);host.phase('hosting');host_ms=round((time.monotonic()-started)*1000)
        assert not host.latest['connected'] and host.latest['pending']==[];checks.append('First device creates a room without granting access')
        guest.command('open',code=code);guest.phase('pending');
        host.wait(lambda e:e.get('event')=='state' and len(e['state']['pending'])==1)
        assert not host.latest['connected'] and not guest.latest['connected'];checks.append('Second device discovers the room and remains pending without media access')
        peer=host.latest['pending'][0]['id'];host.command('reject',peer=peer);guest.phase('error');
        assert not guest.latest['connected'];checks.append('Host rejection closes the request without creating a desktop session')
        wrong_code='000001' if code!='000001' else '000002'
        guest.command('open',code=wrong_code,address='127.0.0.1');guest.phase('error')
        assert guest.latest['error'].startswith('REMOTE_HOST_NOT_FOUND:') and guest.latest['role']=='idle'
        assert host.command('status')['pending']==[]
        checks.append('Address join with the wrong code remains join-only and never creates a room')
        guest.command('open',code=code,address='127.0.0.1');guest.phase('pending')
        host.wait(lambda e:e.get('event')=='state' and len(e['state']['pending'])==1)
        assert not guest.latest['connected']
        checks.append('Address join finds the host over unicast and waits for explicit approval')
        peer=host.latest['pending'][0]['id'];started=time.monotonic();host.command('approve',peer=peer)
        guest.phase('connected',45);desktop_ms=round((time.monotonic()-started)*1000);assert guest.latest['connected'];host.phase('controlled')
        checks.append('Explicit approval establishes real encrypted Aspia desktop session')
        guest.command('files');guest.wait(lambda e:e.get('event')=='state' and e['state'].get('fileWindows',0)>0,45)
        checks.append('Actual native file-transfer session becomes ready over the approved connection')
        host.command('disconnect');guest.phase('error');assert not guest.latest['connected'];checks.append('Host revocation releases native media and closes guest access')
        host.command('stop');assert host.latest['phase']=='idle';checks.append('Room leave releases listener and approval state')
        return {'scope':'Two local processes and actual Aspia encrypted native sessions; no second physical computer, synthetic input or file copy','passed':len(checks),'checks':checks,'observations':{'hostCreateMs':host_ms,'approvedDesktopReadyMs':desktop_ms},'limits':['Physical LAN/firewall/router isolation and actual file copy/input/audio/multi-monitor need two-machine acceptance']}
    finally:guest.close();host.close()

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('engine',type=Path);p.add_argument('--report',type=Path,required=True);args=p.parse_args()
    result=run(args.engine.resolve());args.report.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(result))
