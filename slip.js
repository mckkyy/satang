// slip.js: turns the text read from a K PLUS slip into a payment.
// Works in the browser (window.SlipParser) and in Node (for tests).
(function (root) {
  const TH_MONTHS = ['มค', 'กพ', 'มีค', 'เมย', 'พค', 'มิย', 'กค', 'สค', 'กย', 'ตค', 'พย', 'ธค'];
  const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const flat = s => s.replace(/\s+/g, '');

  // "12 พ.ย. 69 08:12 น."  or  "12 Nov 26 08:12"
  function parseDate(text) {
    let day, mon = -1, year;
    const t = text.replace(/[\s.]/g, '');
    let m = t.match(new RegExp('(\\d{1,2})(' + TH_MONTHS.join('|') + ')(25\\d{2}|\\d{2})'));
    if (m) {
      day = +m[1]; mon = TH_MONTHS.indexOf(m[2]); year = +m[3];
      year = year < 100 ? year + 2500 - 543 : (year > 2400 ? year - 543 : year); // Thai Buddhist year → normal year
    } else {
      m = text.match(/(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s*(\d{2,4})/i);
      if (m) {
        day = +m[1]; mon = EN_MONTHS.indexOf(m[2].toLowerCase()); year = +m[3];
        year = year < 100 ? 2000 + year : (year > 2400 ? year - 543 : year);
      }
    }
    if (mon < 0) return null;
    const tm = text.match(/(\d{1,2})\s*:\s*(\d{2})(?:\s*([AaPp])\.?\s*[Mm])?/);
    let hour = tm ? +tm[1] : 12;
    if (tm && tm[3]) { const pm = /p/i.test(tm[3]); if (pm && hour < 12) hour += 12; if (!pm && hour === 12) hour = 0; } // 10:35 PM → 22:35
    const d = new Date(year, mon, day, hour, tm ? +tm[2] : 0);
    if (isNaN(d) || d.getDate() !== day) return null;
    return d;
  }

  function moneyIn(line) {
    const out = [];
    for (const m of line.matchAll(/(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})(?!\d)/g)) {
      out.push(parseFloat(m[1].replace(/,/g, '') + '.' + m[2]));
    }
    return out;
  }

  function parseAmount(lines) {
    const isFee = l => /ค่าธรรมเนียม|fee/i.test(flat(l));
    // 1) the number next to the "Amount" label
    for (let i = 0; i < lines.length; i++) {
      if (/จำนวน|amount/i.test(flat(lines[i])) && !isFee(lines[i])) {
        for (const l of [lines[i], lines[i + 1] || '', lines[i + 2] || '']) {
          if (l !== lines[i] && isFee(l)) break;
          const v = moneyIn(l).find(x => x > 0);
          if (v) return v;
        }
      }
    }
    // 2) a line that says "Baht"
    for (const l of lines) {
      if (isFee(l) || !/บาท|thb|baht/i.test(flat(l))) continue;
      const v = moneyIn(l).find(x => x > 0);
      if (v) return v;
    }
    // 3) any money-looking number
    for (const l of lines) {
      if (isFee(l)) continue;
      const v = moneyIn(l).find(x => x > 0);
      if (v) return v;
    }
    return null;
  }

  function parseRef(lines) {
    for (let i = 0; i < lines.length; i++) {
      if (/เลขที่รายการ|อ้างอิง|ref|transactionid|transactionno/i.test(flat(lines[i]))) {
        for (const l of lines.slice(i, i + 4)) { // the ID can sit a few lines below its label
          const tok = (l.match(/[A-Za-z0-9]{10,}/g) || []).find(x => /\d{6,}/.test(x));
          if (tok) return tok;
        }
      }
    }
    return null;
  }

  // Labels to ignore. Thai is checked without spaces; English as whole words (so "COFFEE" isn't mistaken for "Fee").
  const SKIP_TH = /สำเร็จ|จำนวน|ค่าธรรมเนียม|เลขที่|รายการ|อ้างอิง|บาท|ธนาคาร|กสิกร|สแกน|ตรวจสอบ|พร้อมเพย์|ผู้รับ|ผู้โอน|บันทึก|รหัส|^ธ\./;
  const SKIP_EN = /\b(success\w*|completed?|amount|fee|ref|reference|transaction|thb|baht|bank|kbank|k\s?plus|kasikorn\w*|scan|verify|slip|promptpay|memo|biller)\b|k\+/i;
  const isAccount = l => /x{2,}|[x%\d]{2,3}\s*-\s*[x%\d]\s*-/i.test(l);

  // Slip layout: header, date, YOUR name + bank + hidden account, then WHO YOU PAID.
  function parseParties(lines) {
    const dateAt = lines.findIndex(l => parseDate(l));
    const body = dateAt >= 0 ? lines.slice(dateAt + 1) : lines; // skip the header above the date
    const names = parseNames(body);
    const acctAt = body.findIndex(isAccount);
    const after = acctAt >= 0 ? parseNames(body.slice(acctAt + 1)) : [];
    return { from: names[0] || null, to: after[0] || names[1] || names[0] || null };
  }

  // Lines that look like a person's or shop's name.
  function parseNames(lines) {
    return lines.filter(l => {
      const f = flat(l);
      const letters = (f.match(/[A-Za-zก-ฮ]/g) || []).length;
      const digits = (f.match(/\d/g) || []).length;
      if (letters < 3 || digits > letters) return false;
      if (SKIP_TH.test(f) || SKIP_EN.test(l) || isAccount(l)) return false; // labels, bank names, hidden account numbers
      if (parseDate(l)) return false;
      return true;
    }).map(l => l.replace(/[^\p{L}\p{M}\p{N}\s.&'()-]/gu, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  }

  // The text reader sometimes writes "ำ" as two marks (ํ + า) and uses Thai digits (๐-๙). Clean that up first.
  function normalize(text) {
    return String(text || '')
      .replace(/ํ\s*า/g, 'ำ')
      .replace(/[๐-๙]/g, d => String(d.charCodeAt(0) - 0x0E50));
  }

  function parseSlip(text) {
    const lines = normalize(text).split(/\n+/).map(s => s.trim()).filter(Boolean);
    return {
      amount: parseAmount(lines),
      date: parseDate(lines.join('\n')),
      ref: parseRef(lines),
      ...parseParties(lines),
    };
  }

  // Category guess from who you paid. Your own corrections (learned) always win.
  const RULES = [
    ['Food', /7-?eleven|seven|เซเว่น|cp ?all|ซีพีออลล์|family ?mart|แฟมิลี่มาร์ท|lawson|cafe|café|amazon|อเมซอน|starbucks|coffee|กาแฟ|grab ?food|lineman|line man|foodpanda|robinhood|kfc|mcdonald|แมคโดนัลด์|burger|pizza|swensen|after you|ร้านอาหาร|อาหาร|ก๋วยเตี๋ยว|ข้าว|หมูกระทะ|ชาบู|ส้มตำ|bakery|เบเกอรี่/i],
    ['Transport', /\bbts\b|\bmrt\b|skytrain|รถไฟฟ้า|grab|bolt|taxi|แท็กซี่|ปตท|\bptt\b|shell|เชลล์|บางจาก|bangchak|esso|caltex|การรถไฟ|airport rail|easy ?pass|ทางด่วน|muvmi/i],
    ['Shopping', /lotus|โลตัส|big ?c|บิ๊กซี|makro|แม็คโคร|\btops\b|ท็อปส์|central|เซ็นทรัล|robinson|shopee|ช้อปปี้|lazada|ลาซาด้า|uniqlo|watsons|วัตสัน|boots|ikea|homepro|โฮมโปร|villa market|gourmet|the mall|emporium|donki/i],
    ['Bills', /\bais\b|เอไอเอส|true ?move|ทรู|dtac|ดีแทค|การไฟฟ้า|\bmea\b|\bpea\b|ประปา|internet|\b3bb\b|netflix|spotify|youtube|apple\.com|icloud|ประกัน|insurance|บัตรเครดิต|credit card/i],
  ];
  function guessCategory(name, learned) {
    const key = String(name || '').toLowerCase().trim();
    if (learned && learned[key]) return learned[key];
    for (const [cat, re] of RULES) if (re.test(key)) return cat;
    return 'Other';
  }

  const api = { parseSlip, parseDate, parseAmount, guessCategory };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SlipParser = api;
})(this);
