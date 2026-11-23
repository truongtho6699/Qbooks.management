// Read-only public acceptance checks. No login, writes, or customer data access.
const base=new URL(process.argv[2]||'https://qbooks-quantri.pages.dev');
if(base.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(base.hostname))throw Error('Use HTTPS for remote checks.');
let failures=0;
const results=[];
for(const [path,expected] of [['/',200],['/api/health',200],['/api/users',401],['/api/orders',401],['/qb-acceptance-page-that-does-not-exist',404]]){
 try{
  const response=await fetch(new URL(path,base),{redirect:'manual',signal:AbortSignal.timeout(20000)});
  const checks={status:response.status===expected};
  if(path==='/'){
   checks.frame=response.headers.get('x-frame-options')==='DENY';
   checks.csp=(response.headers.get('content-security-policy')||'').includes("frame-ancestors 'none'");
   checks.nosniff=response.headers.get('x-content-type-options')==='nosniff';
  }
  if(path==='/api/health')checks.health=(await response.json()).ok===true;
  else await response.body?.cancel();
  const pass=Object.values(checks).every(Boolean);
  if(!pass)failures++;
  results.push({path,status:response.status,expected,checks,pass});
 }catch(error){failures++;results.push({path,pass:false,error:error.message});}
}
console.log(JSON.stringify({checkedAt:new Date().toISOString(),base:base.origin,failures,results},null,2));
process.exitCode=failures?1:0;
