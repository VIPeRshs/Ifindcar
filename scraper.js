// scraper.js (CommonJS)
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs/promises");

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
};

const URLS_FILE = "urls.txt";
const DEFAULT_URLS = [
  "https://www.icar.co.il/%D7%A1%D7%A7%D7%95%D7%93%D7%94/%D7%A1%D7%A7%D7%95%D7%93%D7%94_%D7%90%D7%95%D7%A7%D7%98%D7%91%D7%99%D7%94/%D7%A1%D7%A7%D7%95%D7%93%D7%94_%D7%90%D7%95%D7%A7%D7%98%D7%91%D7%99%D7%94_%D7%97%D7%93%D7%A9/version28104/",
  "https://www.icar.co.il/%D7%A1%D7%99%D7%90%D7%98/%D7%A1%D7%99%D7%90%D7%98_%D7%90%D7%98%D7%A7%D7%94/%D7%A1%D7%99%D7%90%D7%98_%D7%90%D7%98%D7%A7%D7%94_%D7%97%D7%93%D7%A9/version15265/",
  "https://www.icar.co.il/%D7%A7%D7%95%D7%A4%D7%A8%D7%94/%D7%A7%D7%95%D7%A4%D7%A8%D7%94_%D7%A4%D7%95%D7%A8%D7%9E%D7%A0%D7%98%D7%95%D7%A8/%D7%A7%D7%95%D7%A4%D7%A8%D7%9E%D7%A0%D7%98%D7%95%D7%A8_%D7%97%D7%93%D7%A9/version28136/",
];

const normText = (s) => (s || "").replace(/\s+/g, " ").trim();
const num = (s) => {
  if (!s) return null;
  const n = String(s).replace(/[^\d.]/g, "");
  return n ? Number(n) : null;
};
const slugFromUrl = (u) =>
  u.replace(/^https?:\/\//, "").replace(/[^\w]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

async function loadUrls() {
  try {
    const txt = await fs.readFile(URLS_FILE, "utf-8");
    return txt.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  } catch {
    return DEFAULT_URLS;
  }
}

function firstAfterLabel($, labelRegex) {
  const el = $("body *").filter((_, e) => labelRegex.test(normText($(e).text()))).first();
  if (!el.length) return null;
  if (el.next().length) return normText(el.next().text());
  const text = normText(el.text());
  const m = text.match(/[:־]\s*(.*)$/);
  return m ? normText(m[1]) : null;
}

async function scrapeModel(url) {
  const { data: html } = await axios.get(url, { headers: HEADERS, timeout: 30000, validateStatus: () => true });
  if (!html || typeof html !== "string") throw new Error("Bad response");

  const $ = cheerio.load(html);
  const h1 = normText($("h1").first().text()) || normText($(".model_header h1, .version_header h1").first().text());
  const parts = h1.split(" ").filter(Boolean);
  const make = parts[0] || null;
  const model = parts.slice(1).join(" ") || null;

  const priceText = firstAfterLabel($, /מחיר/i) || normText($(".price, .version_price, .price_num").first().text());
  const price = num(priceText);

  const gearboxText = firstAfterLabel($, /תיבת.?הילוכים|גיר/i) || "";
  const gearbox = gearboxText || null;

  const engineText = firstAfterLabel($, /נפח.?מנוע/i) || normText($('*:contains("ליטר")').first().text());
  const engine = engineText ? Number((engineText.match(/(\d+(?:\.\d+)?)/) || [])[1]) || null : null;

  const length = num(firstAfterLabel($, /אורך/i));
  const width = num(firstAfterLabel($, /רוחב/i));
  const height = num(firstAfterLabel($, /גובה/i));
  const wheelbase = num(firstAfterLabel($, /בסיס.?גלגלים/i));
  const trunk = num(firstAfterLabel($, /תא.?מטען/i));
  const powerHP =
    num(firstAfterLabel($, /כ.?ס|כוח.?סוס|הספק/i)) ||
    num(($("body").text().match(/(\d+)\s*(?:כ\"ס|כ״ס|כ''ס)/) || [])[1]);

  const txtAll = $("body").text();
  const features = {
    cruise: /בקרת שיוט|שיוט אדפטיבית/i.test(txtAll),
    rearCamera: /מצלמה אחורית/i.test(txtAll),
    keyless: /keyless|כניסה ללא מפתח|התנעה בלחיצת כפתור/i.test(txtAll),
    laneAssist: /שמירת נתיב|Lane Assist/i.test(txtAll),
    aeb: /בלימה אוטונומית|AEB/i.test(txtAll),
  };

  const imgCand =
    $("img")
      .filter((_, el) => {
        const src = $(el).attr("src") || "";
        return /jpg|jpeg|png/i.test(src) && !/logo|icon|pixel/i.test(src);
      })
      .first()
      .attr("src") || null;
  const image = imgCand ? (imgCand.startsWith("http") ? imgCand : new URL(imgCand, url).href) : null;

  return {
    id: slugFromUrl(url),
    source: url,
    make,
    model,
    trim: "",
    year: null,
    price,
    gearbox,
    engine,
    image,
    features,
    specs: { length, width, height, wheelbase, trunk, powerHP },
    scrapedAt: new Date().toISOString(),
  };
}

(async function main() {
  try {
    const urls = await loadUrls();
    console.log("Total URLs:", urls.length);
    const out = [];
    for (const url of urls) {
      try {
        console.log("Scraping:", url);
        const item = await scrapeModel(url);
        out.push(item);
        await new Promise((r) => setTimeout(r, 1500));
      } catch (e) {
        console.error("Failed:", url, e.message);
      }
    }
    out.sort((a, b) => (a.make || "").localeCompare(b.make || "", "he") || (a.model || "").localeCompare(b.model || "", "he"));
    await fs.writeFile("cars.json", JSON.stringify(out, null, 2), "utf-8");
    console.log("Wrote cars.json with", out.length, "items");
  } catch (e) {
    console.error("Fatal:", e);
    process.exit(1);
  }
})();
