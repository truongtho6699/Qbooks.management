import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const ctx={};vm.createContext(ctx);
vm.runInContext(app.slice(app.indexOf('function staffRoles('),app.indexOf('function selectStaff('))+';this.f={staffRoles,staffMatches,lastLoginText};',ctx);
const {staffRoles,staffMatches,lastLoginText}=ctx.f;
const people=[
 {name:'Nguyễn An',email:'an@qbooks.vn',role:'PACKER',can_pack:1,can_ship:0,can_admin:0,active:1,locked_until:0},
 {name:'Trần Bình',email:'binh@qbooks.vn',role:'VIEW',can_pack:0,can_ship:0,can_admin:0,active:0,locked_until:0},
 {name:'Lê Chi',email:'chi@qbooks.vn',role:'ADMIN',can_pack:1,can_ship:1,can_admin:1,active:1,locked_until:1999999999},
];
const pick=(q,f)=>people.filter(p=>staffMatches(p,q,f)).map(p=>p.name).join('|');

test('staff search matches name or email, filters by status and rights',()=>{
 assert.equal(pick('binh','all'),'Trần Bình');
 assert.equal(pick('','inactive'),'Trần Bình');
 assert.equal(pick('','locked'),'Lê Chi');
 assert.equal(pick('','admin'),'Lê Chi');
 assert.equal(pick('','pack'),'Nguyễn An|Lê Chi');
 assert.equal(pick('','VIEW'),'Trần Bình');
 assert.equal(pick('qbooks','active'),'Nguyễn An|Lê Chi');
});

test('role badges and last login text are readable',()=>{
 assert.equal(staffRoles(people[1]).join(),'Chỉ xem');
 assert.equal(staffRoles(people[2]).join(),'Quản trị,Đóng hàng,Vận đơn');
 assert.equal(lastLoginText(null),'Chưa ghi nhận đăng nhập');
 assert.match(lastLoginText('2026-11-24 08:05:00'),/^Đăng nhập gần nhất: .*15:05/);
});

test('permission panel keeps the person name after saving (no "Nhân sự: Nhân sự:")',()=>{
 assert.match(app,/await loadStaffMenuPermissions\(edit\.id,edit\.name,edit\.role\);/);
 assert.match(app,/state\.menuEditor=\{id,name,role,keys:details\.keys\};/);
});

test('Google approvals default to VIEW and ask before granting more or rejecting',()=>{
 assert.match(app,/\[\['VIEW','Chỉ xem \(mặc định\)'\],\['PACKER'/);
 assert.match(app,/confirm\('Từ chối đăng ký của '/);
 assert.match(app,/confirm\('Cấp quyền '/);
});

test('admin screens have search, filters, log paging and sync retry controls',()=>{
 for(const id of ['staffSearch','staffFilter','staffCount','staffUnlockRow','logSearch','logShowLogins','logPrev','logNext','syncSummary','syncShowDone','syncRetryAll'])
  assert.match(html,new RegExp('id="'+id+'"'),id);
 assert.match(html,/<details class="panel" data-admin-section="sync"><summary>/);
});

test('reports show D1 UTC times in Vietnam time and the staff list scrolls in place',()=>{
 const c={};vm.createContext(c);
 vm.runInContext(app.slice(app.indexOf('function vnTime('),app.indexOf('async function loadAdminReport('))+';this.vnTime=vnTime;',c);
 assert.match(c.vnTime('2026-11-24 06:04:47'),/13:04:47/);
 assert.equal(c.vnTime('không phải ngày'),'không phải ngày');
 const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
 assert.match(css,/#staffList\.staff-list\{max-height:min\(55vh,520px\);overflow:auto/);
});
