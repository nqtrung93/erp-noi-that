import puppeteer from "puppeteer";

// Dùng chung 1 trình duyệt headless cho cả server (mở/đóng mỗi lần request rất chậm).
let browserPromise;
function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return browserPromise;
}

// Render HTML phiếu in (đã escape) thành PDF khổ A4 — dùng lại đúng mẫu in hiện có.
export async function htmlToPdfBuffer(html) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle0" });
    // page.pdf() trả về Uint8Array (không phải Buffer Node thật) ở bản puppeteer mới —
    // phải bọc Buffer.from() rõ ràng, nếu không res.send() sẽ serialize nhầm thành JSON.
    return Buffer.from(await page.pdf({ format: "A4", printBackground: true }));
  } finally {
    await page.close();
  }
}

// Tên file an toàn: bỏ dấu tiếng Việt, khoảng trắng/ký tự lạ → "_".
export function toFileSlug(str) {
  return String(str || "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "phieu";
}

export function sendPdf(res, buffer, filename) {
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${filename}"`,
  });
  res.send(buffer);
}
