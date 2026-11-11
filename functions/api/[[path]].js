import handler from '../../src/worker.js';
// Cloudflare Pages Functions dùng cùng logic nghiệp vụ Worker, D1 và R2.
// Chỉ xử lý /api/*; tệp giao diện do Pages Static Assets phục vụ.
export async function onRequest(context) {
  return handler.fetch(context.request, context.env);
}
