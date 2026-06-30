import puppeteer from "puppeteer";

// Giữ 1 instance Chromium dùng chung cho cả server thay vì mở mới mỗi lần in — VPS RAM hạn chế.
// Tự khởi động lại nếu trình duyệt bị crash giữa chừng (mất kết nối).
let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  const browser = await browserPromise;
  if (!browser.connected) {
    browserPromise = null;
    return getBrowser();
  }
  return browser;
}

// Render HTML (mẫu phiếu) thành PDF khổ A4 — dùng cho nút "Tải xuống".
export async function htmlToPdf(html) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle0" });
    // preferCSSPageSize: lấy khổ giấy + lề từ @page trong mẫu in (A4, 14mm/12mm) thay vì set lại ở đây,
    // đảm bảo PDF tải xuống và bản in trực tiếp từ trình duyệt luôn khớp định dạng.
    // Buffer.from(...): puppeteer trả về Uint8Array (không phải Buffer thật) — nếu để nguyên,
    // Express không nhận ra là binary và sẽ JSON.stringify thành {"0":37,"1":80,...} thay vì gửi file PDF.
    const data = await page.pdf({ printBackground: true, preferCSSPageSize: true });
    return Buffer.from(data);
  } finally {
    await page.close();
  }
}
