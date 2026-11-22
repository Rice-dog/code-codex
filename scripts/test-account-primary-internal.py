"""Production native-wrapper + installed official backend, isolated synthetic auth.
No actual login, inference, user-home write, live desktop mutation or network service.
"""
import base64,datetime,hashlib,json,os,pathlib,queue,shutil,socket,subprocess,tempfile,threading,time,urllib.request,urllib.error,argparse
args=argparse.ArgumentParser();args.add_argument('--wrapper',default='target/release/code-codex.exe');args.add_argument('--backend',default=r'C:/Program Files/WindowsApps/OpenAI.Codex_26.1111.2228.0_x64__2p2nqsd0c76g0/app/resources/codex.exe');args.add_argument('--out',default='artifacts/account-primary-internal');args=args.parse_args()
out=pathlib.Path(args.out).resolve();out.mkdir(parents=True,exist_ok=True)
root=pathlib.Path(tempfile.mkdtemp(prefix='codecodex-primary-internal-'));home=root/'profile';source=root/'selected';backup=root/'backup';runtime=root/'runtime';runtime.mkdir();(runtime/'data').mkdir();
(runtime/'storage-layout.json').write_text('{"schema":1,"product":"Code-Codex"}')
wrapper=runtime/'code-codex.exe';shutil.copyfile(args.wrapper,wrapper)
official=pathlib.Path(args.backend);assert official.is_file(), 'Explicit installed official backend is required'
for folder in [home,source,backup]:
 folder.mkdir();(folder/'config.toml').write_text('cli_auth_credentials_store="file"\nchatgpt_base_url="http://127.0.0.1:9"\n[analytics]\nenabled=false\n')
 (folder/'managed-auth-source.json').write_text('{"schema":1,"store":"file"}')
def jwt(who):
 def enc(x):return base64.urlsafe_b64encode(json.dumps(x).encode()).decode().rstrip('=')
 return enc({'alg':'none'})+'.'+enc({'email':who+'@example.invalid','sub':'synthetic-user-'+who,'exp':int(time.time())+3600,'https://api.openai.com/profile':{'email':who+'@example.invalid'},'https://api.openai.com/auth':{'chatgpt_account_id':'synthetic-'+who,'chatgpt_user_id':'synthetic-user-'+who,'chatgpt_plan_type':'plus'}})+'.synthetic-invalid-signature'
def auth(folder,who):
 t=jwt(who);(folder/'auth.json').write_text(json.dumps({'auth_mode':'chatgpt','OPENAI_API_KEY':None,'tokens':{'id_token':t,'access_token':t,'refresh_token':'synthetic-refresh-'+who,'account_id':'synthetic-'+who},'last_refresh':datetime.datetime.now(datetime.timezone.utc).isoformat()}))
auth(home,'alpha');auth(backup,'alpha');auth(source,'beta');(home/'keep.txt').write_text('unrelated profile data')
s=socket.socket();s.bind(('127.0.0.1',0));port=s.getsockname()[1];s.close();key='1'*32;control='2'*32
params={'schema':1,'rendererPort':54321,'port':port,'key':key,'control':control,'backend':str(official),'blocked':[]}
env=os.environ.copy();env['CODEX_HOME']=str(home);env['CODE_CODEX_STARTUP_BACKEND']=json.dumps(params)
for k in ['OPENAI_API_KEY','OPENAI_BASE_URL','CODEX_API_KEY','CODEX_CLI_PATH']:env.pop(k,None)
for k in ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY']:env[k]='http://127.0.0.1:9'
env['NO_PROXY']='127.0.0.1,localhost'
q=queue.Queue();notifications=[];serial=0
stderr=(out/'native-stderr.txt').open('w',encoding='utf8')
p=subprocess.Popen([str(wrapper),'-c','cli_auth_credentials_store="file"','app-server'],env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=stderr,text=True,encoding='utf8')
def pump():
 for line in p.stdout:
  try:q.put(json.loads(line))
  except: q.put({'invalid':True})
threading.Thread(target=pump,daemon=True).start()
def call(method,params):
 global serial;serial+=1;ident=serial;p.stdin.write(json.dumps({'id':ident,'method':method,'params':params})+'\n');p.stdin.flush();end=time.monotonic()+15
 while time.monotonic()<end:
  v=q.get(timeout=max(.01,end-time.monotonic()))
  if v.get('id')==ident:return v
  notifications.append(v)
 raise TimeoutError(method)
http=urllib.request.build_opener(urllib.request.ProxyHandler({}))
def command(value,secret=control):
 req=urllib.request.Request(f'http://localhost:{port}/{key}/control',json.dumps(value).encode(),{'Content-Type':'application/json','x-code-codex-control':secret})
 try:
  with http.open(req,timeout=45) as r:return r.status,json.loads(r.read())
 except urllib.error.HTTPError as e:return e.code,{'rejected':True,'diagnostic':e.read(8192).decode('utf8','replace')}

def cold_identity():
 # Fresh unwrapped official process, same isolated persisted home. No network
 # account/read or inference: getAuthStatus returns its native cached identity.
 probe=subprocess.Popen([str(official),'-c','cli_auth_credentials_store="file"','app-server'],env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,encoding='utf8')
 replies=queue.Queue()
 def read():
  for line in probe.stdout:
   try:replies.put(json.loads(line))
   except ValueError:pass
 threading.Thread(target=read,daemon=True).start()
 def rpc(ident,method,params):
  probe.stdin.write(json.dumps({'id':ident,'method':method,'params':params})+'\n');probe.stdin.flush()
  while True:
   value=replies.get(timeout=15)
   if value.get('id')==ident:return value
 try:
  assert 'result' in rpc(1,'initialize',{'clientInfo':{'name':'cold-fixture','version':'0.0.0'}})
  return rpc(2,'getAuthStatus',{'includeToken':True,'refreshToken':False})['result']
 finally:
  probe.stdin.close()
  try:probe.wait(timeout=10)
  except subprocess.TimeoutExpired:probe.kill();probe.wait()
checks=[];result={'scope':'Production native wrapper and installed official backend with synthetic invalid credentials. Proxy/backend constrained to loopback; no inference, actual login, desktop switch or token-authority refresh.','passed':False,'checks':checks}
try:
 assert 'result' in call('initialize',{'clientInfo':{'name':'codecodex-primary-fixture','version':'0.0.0'},'capabilities':{'experimentalApi':True}})
 p.stdin.write('{"method":"initialized"}\n');p.stdin.flush()
 status,info=command({'action':'status'});assert status==200 and info.get('primarySwitch')==1;checks.append('Launch-owned native control advertises its actual primary capability')
 assert command({'action':'primary-switch'},'wrong')[0]==403;checks.append('Unauthenticated control changes no authorization')
 status,info=command({'action':'primary-switch','source':str(source),'backup':str(backup),'email':'beta@example.invalid','operationId':'3'*32})
 assert status==200 and info.get('completed') is True,info;checks.append('Native-only selected credential login and official identity confirmation complete')
 observed=call('getAuthStatus',{'includeToken':True,'refreshToken':False});assert observed.get('result',{}).get('authToken')==json.loads((home/'auth.json').read_text())['tokens']['access_token'],{'safeResultKeys':list(observed)};checks.append('The ordinary desktop connection reads the actual selected identity')
 assert (home/'keep.txt').read_text()=='unrelated profile data';checks.append('Managed handoff preserves unrelated profile files')
 assert json.loads((home/'auth.json').read_text())['tokens']['account_id']=='synthetic-beta';checks.append('Complete managed authorization, including refresh material, is persisted for normal restart')
 assert cold_identity().get('authToken')==json.loads((home/'auth.json').read_text())['tokens']['access_token'];checks.append('Fresh unwrapped official process reloads the selected managed identity from disk')
 assert all(not(str(x.get('id','')).startswith('code-codex-primary-')) for x in notifications);checks.append('Private native replies are not forwarded to the renderer connection')
 assert not any('accessToken' in json.dumps(x) or 'synthetic-refresh-' in json.dumps(x) for x in notifications);checks.append('Forwarded notifications contain no credential material')
 # A pre-dispatch identity mismatch must restore beta without asking the live
 # backend to log out or replay an uncertain login.
 shutil.copyfile(home/'auth.json',backup/'auth.json');status,info=command({'action':'primary-switch','source':str(source),'backup':str(backup),'email':'wrong@example.invalid','operationId':'4'*32})
 assert status==200 and info.get('restored') is True and info.get('loginDispatched') is False,info
 assert call('getAuthStatus',{'includeToken':True,'refreshToken':False})['result']['authToken']==json.loads((home/'auth.json').read_text())['tokens']['access_token'];checks.append('Wrong target source restores the prior store without changing live identity or replaying login')
 # Native logout relinquishes only the transport-owned provider. This is an
 # isolated synthetic account, never the user's official GUI.
 assert 'result' in call('account/logout',{});assert call('getAuthStatus',{'includeToken':False,'refreshToken':False})['result'].get('authMethod') is None;checks.append('Ordinary logout releases primary credential ownership')
 assert not (home/'auth.json').exists() and cold_identity().get('authMethod') is None;checks.append('Official logout deletes persisted managed authorization and cold restart stays logged out')
 result['passed']=True
finally:
 p.stdin.close()
 try:p.wait(timeout=10)
 except subprocess.TimeoutExpired:p.kill();p.wait()
 stderr.close();result['wrapperSha256']=hashlib.sha256(wrapper.read_bytes()).hexdigest();result['backendVersion']=subprocess.check_output([str(official),'--version'],text=True).strip();(out/'result.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps(result))
 # Synthetic stores are deliberately retained on failure for diagnosis.
 if result['passed']:shutil.rmtree(root)
