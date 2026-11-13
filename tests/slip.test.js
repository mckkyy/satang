// Run with: node tests/slip.test.js
const assert = require('assert');
const { parseSlip, guessCategory } = require('../slip.js');

const thai = `โอนเงินสำเร็จ
12 พ.ย. 69 08:12 น.
นาย สมชาย ใจดี
ธ.กสิกรไทย
xxx-x-x1234-x
7-Eleven สาขาสุขุมวิท 22
xxx-x-x5678-x
เลขที่รายการ:
016316081203AQR05678
จำนวน:
1,250.00 บาท
ค่าธรรมเนียม:
0.00 บาท
สแกนตรวจสอบสลิป`;

const english = `Transfer Successful
3 Nov 26 19:02
Mr. Somchai J
KBank
xxx-x-x1234-x
Lotus's Rama 4
Transaction ID: 015307190211BPM01234
Amount: 144.00 THB
Fee: 0.00 THB`;

let p = parseSlip(thai);
assert.strictEqual(p.amount, 1250);
assert.strictEqual(p.to, '7-Eleven สาขาสุขุมวิท 22');
assert.strictEqual(p.ref, '016316081203AQR05678');
assert.deepStrictEqual([p.date.getFullYear(), p.date.getMonth(), p.date.getDate(), p.date.getHours(), p.date.getMinutes()], [2026, 10, 12, 8, 12]);
assert.strictEqual(guessCategory(p.to), 'Food');

p = parseSlip(english);
assert.strictEqual(p.amount, 144);
assert.strictEqual(p.to, "Lotus's Rama 4");
assert.strictEqual(p.ref, '015307190211BPM01234');
assert.deepStrictEqual([p.date.getFullYear(), p.date.getMonth(), p.date.getDate()], [2026, 10, 3]);
assert.strictEqual(guessCategory(p.to), 'Shopping');

// Real output from the text reader on a test slip (odd vowel marks, Thai digits, garbled account line)
p = parseSlip('โอนเงินสําเร็จ\n\n12 พ.ย. 69 08:12 น.\nนาย สมชาย ใจดี\n\nธ.กสิกรไทย\n\n2๐๐-%-%1 2 34-%\n7-Eleven\nXXX-X-X5678-X\n\nเลขที่รายการ:\n016316081203AQR05678\nจํานวน:\n\n89.00 บาท\n');
assert.strictEqual(p.amount, 89);
assert.strictEqual(p.from, 'นาย สมชาย ใจดี');
assert.strictEqual(p.to, '7-Eleven');
assert.strictEqual(p.ref, '016316081203AQR05678');

// Header garbled by the reader (vowel marks dropped) must not be mistaken for a name
p = parseSlip("๐     a   ๐  ๕\n\nชาระเงนสาเรจ\n\n12 พ.ย. 69 19:02 น.\nนาย สมชาย ใจดี\n\nธ.กสิกรไทย\nXXX-X-X1234-x\nLotus's พระราม 4\nเลขที่รายการ:\n016316190211BPM09876\nจํานวน:\n\n1,144.00 บาท\n");
assert.strictEqual(p.amount, 1144);
assert.strictEqual(p.from, 'นาย สมชาย ใจดี');
assert.strictEqual(p.to, "Lotus's พระราม 4");
assert.strictEqual(guessCategory(p.to), 'Shopping');

// Real K PLUS "Payment Completed" slip after background cleanup (name and account changed)
p = parseSlip('Payment Completed\n[เจบ\n6 Nov 26 10:35 PM\n69  Mr. Somchai J\nKBank\nXXX-X-X1234-x\nSTARBUCKS COFFEE\n000002206485500\n4782490195CQDD0O0O0O0O00\nAmount:\n145.00 Bart      -\n[=a]\nFee:                                i รไรร\n0.00 Baht    =)  .\nTransaction ID:                            CIEE\nScan for\n016310103525APM17858      Verify Slip\n');
assert.strictEqual(p.amount, 145);
assert.strictEqual(p.to, 'STARBUCKS COFFEE');
assert.strictEqual(p.ref, '016310103525APM17858');
assert.deepStrictEqual([p.date.getDate(), p.date.getHours(), p.date.getMinutes()], [6, 22, 35]); // PM handled
assert.strictEqual(guessCategory(p.to), 'Food');

assert.strictEqual(guessCategory('Grab Food'), 'Food');
assert.strictEqual(guessCategory('GRAB taxi'), 'Transport');
assert.strictEqual(guessCategory('นาย สมชาย'), 'Other');
assert.strictEqual(guessCategory('นาย สมชาย', { 'นาย สมชาย': 'Food' }), 'Food');
assert.strictEqual(parseSlip('random photo of a cat').amount, null);

console.log('All slip tests passed');
