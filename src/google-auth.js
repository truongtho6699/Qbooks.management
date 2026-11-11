// Google Identity Services: verify ID token using Google JWKS and WebCrypto.
// Never accept email/sub claims from the browser without signature and audience verification.
const encoder=new TextEncoder();
const decode64url=(s)=>{
 if(!/^[A-Za-z0-9_-]+$/.test(s))throw Error('Mã đăng nhập Google không hợp lệ.');
 const base=s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4);
 return Uint8Array.from(atob(base),c=>c.charCodeAt(0));
};
function decodeJson(part){
 const bytes=decode64url(part);
 return JSON.parse(new TextDecoder().decode(bytes));
}
export function validGoogleClaims(claims,clientId,clock=Math.floor(Date.now()/1000)){
 const email=String(claims.email||'').toLowerCase().trim();
 if(claims.aud!==clientId||!clientId||!['https://accounts.google.com','accounts.google.com'].includes(claims.iss))return false;
 if(!Number.isInteger(claims.exp)||claims.exp<=clock||!Number.isInteger(claims.iat)||claims.iat>clock+60)return false;
 if(!/^[0-9]{5,64}$/.test(String(claims.sub||'')))return false;
 if(claims.email_verified!==true&&claims.email_verified!=='true')return false;
 if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return false;
 return true;
}
export async function verifyGoogleCredential(credential,clientId,fetcher=fetch){
 if(!clientId)throw Object.assign(new Error('Chưa cấu hình Google Client ID trên Cloudflare Pages.'),{status:503});
 if(typeof credential!=='string'||credential.length>16000)throw Error('Mã đăng nhập Google không hợp lệ.');
 const parts=credential.split('.');
 if(parts.length!==3)throw Error('Định dạng đăng nhập Google không hợp lệ.');
 let header,claims;
 try{header=decodeJson(parts[0]);claims=decodeJson(parts[1]);}catch{throw Error('Dữ liệu xác thực Google không hợp lệ.');}
 if(header.alg!=='RS256'||typeof header.kid!=='string'||header.kid.length>200)throw Error('Phương thức ký Google không hợp lệ.');
 if(!validGoogleClaims(claims,clientId))throw Error('Mã Google hết hạn, chưa xác minh email hoặc không dành cho QBooks.');
 const response=await fetcher('https://www.googleapis.com/oauth2/v3/certs',{cf:{cacheEverything:true,cacheTtl:1800}});
 if(!response.ok)throw Object.assign(new Error('Không lấy được khóa xác thực Google; hãy thử lại.'),{status:503});
 const jwks=await response.json();
 const jwk=(jwks.keys||[]).find(k=>k.kid===header.kid&&k.kty==='RSA'&&k.use==='sig'&&k.alg==='RS256');
 if(!jwk)throw Error('Khóa xác thực của Google không khớp.');
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 const verified=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode64url(parts[2]),encoder.encode(parts[0]+'.'+parts[1]));
 if(!verified)throw Error('Chữ ký xác thực Google không hợp lệ.');
 const email=String(claims.email).toLowerCase().trim(),domain=email.split('@')[1];
 const authoritativeEmail=['gmail.com','googlemail.com'].includes(domain)||(typeof claims.hd==='string'&&claims.hd.toLowerCase()===domain);
 return {sub:String(claims.sub),email,name:String(claims.name||claims.email).slice(0,150),authoritativeEmail};
}
