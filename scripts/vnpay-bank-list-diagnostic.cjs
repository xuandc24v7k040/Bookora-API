const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const tmnCode = process.env.VNPAY_TMN_CODE?.trim();
if (!tmnCode) {
  console.log('BANK_LIST_DIAGNOSTIC=NOT_EXECUTED');
  process.exit(0);
}

const body = new URLSearchParams({ tmn_code: tmnCode });

fetch('https://sandbox.vnpayment.vn/qrpayauth/api/merchant/get_bank_list', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body,
  signal: AbortSignal.timeout(15_000),
})
  .then(async (response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  })
  .then((responseText) => {
    console.log(`INTCARD_SUPPORTED=${responseText.includes('INTCARD')}`);
    console.log(`VNBANK_SUPPORTED=${responseText.includes('VNBANK')}`);
  })
  .catch(() => {
    console.log('BANK_LIST_DIAGNOSTIC=NOT_EXECUTED');
  });
