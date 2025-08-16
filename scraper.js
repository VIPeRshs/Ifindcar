// scraper.js
// גרסה בסיסית: גולשת למספר דפי דגם ב-icar, שולפת נתונים מרכזיים ומייצרת cars.json
// הערה: כבדוק תמיד את תנאי השימוש/robots.txt של icar. שמר על קצב (throttle) והימנע מעומס.

import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs/promises";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
};

// TODO: אפשר להרחיב את הרשימה בהמשך (אפשר גם לקרוא מרשימת קישורים בקובץ urls.txt)
const MODEL_URLS = [
  "https://www.icar.co.il/%D7%A1%D7%A7%D7%95%D7%93%D7%94/%D7%A1%D7%A7%D7%95%D7%93%D7%94_%D7%90%D7%95%D7%A7%D7%98%D7%91%D7%99%D7%94/%D7%A1%D7%A7%D7%95%D7%93%D7%94_%D7%90%D7%95%D7%A7%D7%98%D7%91%D7%99%D7%94_%D7%97%D7%93%D7%A9/version28104/",
  "https://www.icar.co.il/%D7%A1%D7%99%D7%90%D7%98/%D7%A1%D7%99%D7%90%D7%98_%D7%90%D7%98%D7%A7%D7%94/%D7%A1%D7%99%D7%90%D7%98_%D7%90%D7%98%D7%A7%D7%94_%D7%97%D7%93%D7%A9/version15265/",
  "https://www.icar.co.il/%D7%A7%D7%95%D7%A4%D7%A8%D7%94/%D7%A7%D7%95%D7%A4%D7%A8%D7%94_%D7%A4%D7%95%D7%A8%D7%9E%D7%A0%D7%98%D7%95%D7%A8/%D7%A7%D7%95%D7%A4%D7%A8%D7%94_%D7%A4%D7%95%D7%A8%D7%9E%D7%A0%D7%98%D7%95%D7%A8_%D7%97%D7%93%D7%A9/version28136/",
];

function text($, sel) {
  const t = $(sel).first().text().trim();
  return t || null;
}

function toNumber(str) {
  if (!str) return null;
  const n = String(str).replace(/[^\d.]/g, "");
  return n ? Number(n) : null;
}

async function scrapeModel(url) {
  const { data: html } = await axios.get(url, { headers: HEADERS, timeout: 30000 });
  const $ = cheerio.load(html);

  // נסה לפענח יצרן/דגם/רמת גימור מהכותרת/פירורי לחם
  const title = $("h1, .model_header h1, .version_header h1").first().text().trim();
  // לעיתים הפירוק יהיה ידני; גרסה בסיסית:
  const parts = title.replace(/\s+/g, " ").split(" ");
  const make = parts[0] || "לא ידוע";
  const model = parts.slice(1).join(" ") || "לא ידוע";

  // דוגמאות לאיסוף נתונים – צריך להתאים לבחירה לפי מבנה העמוד בפועל:
  const priceText = $('*:contains("מחיר")').filter((_, el) => $(el).text().includes("מחיר")).first().next().text().trim() ||
                    $('div.price, .version_price').first().text().trim();
  const price = toNumber(priceText);

  const engineLiters = toNumber(
    $('*:contains("נפח מנוע")').filter((_, el) => $(el).text().includes("נפח מנוע")).first().next().text()
  );

  const gearbox = text($, $('*:contains("תיבת הילוכים")').filter((_, el) => $(el).text().includes("תיבת הילוכים")).first().next());

  // מידות (הדוגמא תנסה לחפש לפי כותרות כלליות)
  const length = toNumber($('*:contains("אורך")').filter((_, el) => $(el).text().includes("אורך")).first().next().text());
  const width  = toNumber($('*:contains("רוחב")').filter((_, el) => $(el).text().includes("רוחב")).first().next().text());
  const height = toNumber($('*:contains("גובה")').filter((_, el) => $(el).text().includes("גובה")).first().next().text());
  const wheelbase = toNumber($('*:contains("בסיס גלגלים")').filter((_, el) => $(el).text().includes("בסיס גלגלים")).first().next().text());
  const trunk = toNumber($('*:contains("תא מטען")').filter((_, el) => $(el).text().includes("תא מטען")).first().next().text());
  const powerHP = toNumber($('*:contains("כוח")').filter((_, el) => $(el).text().includes("כוח")).first().next().text()) ||
                  toNumber($('*:contains("כ\"ס")').filter((_, el) => $(el).text().includes("כ\"ס")).first().next().text());

  // איבזור (סימון ע"י חיפוש ביטויים; אפשר להרחיב)
  const textAll = $("body").text();
  const features = {
    cruise: /שיוט|בקרת שיוט/i.test(textAll),
    rearCamera: /מצלמה אחורית/i.test(textAll),
    keyless: /Keyless|ללא מפתח/i.test(textAll),
    laneAssist: /שמירת נתיב/i.test(textAll),
    aeb: /בלימה אוטונומית|AEB/i.test(textAll),
  };

  // תמונה – ניסיון לאתר תמונה ראשית (ייתכן שצריך להתאים סלקטור)
  const image =
    $("img").filter((_, el) => /car|vehicle|model|version/i.test($(el).attr("src") || "")).first().attr("src") ||
    $("img").first().attr("src") ||
    null;

  return {
    id: url.replace(/https?:\/\//, "").replace(/[^\w]+/g, "-").replace(/-+/g, "-"),
    source: url,
    make,
    model,
    trim: "",
    year: null, // אפשר לשאוב אם מופיע בעמוד
    price,
    gearbox: gearbox || null,
    engine: engineLiters || null,
    image,
    features,
    specs: { length, width, height, wheelbase, trunk, powerHP },
  };
}

async function main() {
  const out = [];
  for (const url of MODEL_URLS) {
    try {
      console.log("Scraping:", url);
      const item = await scrapeModel(url);
      out.push(item);
      // עיכוב קטן כדי להיות מנומסים
      await new Promise((r) => setTimeout(r, 1500));
    } catch (e) {
      console.error("Failed:", url, e.message);
    }
  }
  await fs.writeFile("cars.json", JSON.stringify(out, null, 2), "utf-8");
  console.log("Wrote cars.json with", out.length, "items");
}
main();
