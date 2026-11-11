/**
 * QBooks Bridge READ ONLY - deploy as a SEPARATE bound Apps Script owned by the spreadsheet owner.
 * Never insert this into the running V35 project until explicitly approved.
 * Script Properties: QBOOKS_SYNC_SECRET_SHA256, QBOOKS_SPREADSHEET_ID.
 * Web app Execute as: Me; access: Anyone (the endpoint validates secret+nonce+timestamp).
 */
function doPost(e) {
  function output(data){return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);}
  try {
    if(!e||!e.postData||!e.postData.contents)throw Error('Thiếu yêu cầu.');
    const req=JSON.parse(e.postData.contents);
    const expected=PropertiesService.getScriptProperties().getProperty('QBOOKS_SYNC_SECRET_SHA256');
    const spreadsheetId=PropertiesService.getScriptProperties().getProperty('QBOOKS_SPREADSHEET_ID');
    if(!expected||!spreadsheetId)throw Error('Cầu nối chưa được thiết lập.');
    if(!/^[a-f0-9]{64}$/i.test(expected))throw Error('Mã bảo vệ cầu nối không hợp lệ.');
    const sha=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(req.secret||''));
    const digest=sha.map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
    if(digest!==expected)throw Error('Không có quyền truy cập.');
    const ts=Number(req.timestamp);
    if(!Number.isFinite(ts)||Math.abs(Date.now()-ts)>5*60*1000)throw Error('Yêu cầu đã hết hạn.');
    const nonce=String(req.nonce||'');
    if(!/^[a-f0-9-]{20,80}$/i.test(nonce))throw Error('Mã yêu cầu không hợp lệ.');
    const cache=CacheService.getScriptCache();
    const key='QBOOKS_BRIDGE_NONCE_'+nonce;
    if(cache.get(key))throw Error('Yêu cầu lặp lại.');
    cache.put(key,'1',600);
    if(req.action!=='snapshot')throw Error('Chỉ cho phép đọc dữ liệu.');
    const ss=SpreadsheetApp.openById(spreadsheetId);
    const sheet=ss.getSheetByName('DATA_TONG');
    const staff=ss.getSheetByName('DM_NHAN_SU');
    const groups=ss.getSheetByName('SALE_GOP_VAN_DON');
    if(!sheet||!staff||!groups)throw Error('Thiếu sheet nghiệp vụ.');
    const offset=Math.max(0,Math.floor(Number(req.offset)||0));
    const limit=Math.max(1,Math.min(150,Math.floor(Number(req.limit)||100)));
    const total=Math.max(0,sheet.getLastRow()-1);
    const number=Math.max(0,Math.min(limit,total-offset));
    const rows=number?sheet.getRange(offset+2,1,number,42).getDisplayValues():[];
    // Staff never includes PIN (column G).
    const staffTotal=Math.max(0,staff.getLastRow()-1);
    const staffRows=staffTotal?staff.getRange(2,1,Math.min(300,staffTotal),6).getDisplayValues():[];
    const saleNames=staffTotal?staff.getRange(2,9,Math.min(300,staffTotal),2).getDisplayValues():[];
    return output({success:true,readOnly:true,version:'V35',offset,limit,total,rows,staff:staffRows,saleNames,stamp:new Date().toISOString()});
  } catch (err) {
    return output({success:false,error:String(err.message||err)});
  }
}
