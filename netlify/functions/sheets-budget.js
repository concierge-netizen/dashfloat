// HANDS Logistics — Google Sheets Budget Proxy
// Fetches Monthly Budget sheet server-side (avoids any browser CORS/key issues)
// Endpoint: GET /.netlify/functions/sheets-budget

const GS_ID  = '1NA2EGqfg-2f-5ZXgHLpND0MKkClDwOAJVF7Zpc-yfKk';
const GS_KEY = 'AIzaSyCMo4o1MarAWRnV0Y95hy0pLDDwdOUutXM';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  // Try sheet names in order — handles renamed tabs
  const sheetNames = ['Monthly Budget', 'Monthly%20Budget', 'Sheet1', 'Budget'];

  for (const sheet of sheetNames) {
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${GS_ID}/values/${encodeURIComponent(sheet)}!A1:O85?key=${GS_KEY}&valueRenderOption=UNFORMATTED_VALUE`;
      const r = await fetch(url);

      if (!r.ok) {
        const errBody = await r.text();
        // If 400/404 on this sheet name, try next
        if (r.status === 400 || r.status === 404) continue;
        // 403 = key/permission issue — return useful error
        return {
          statusCode: r.status,
          headers: CORS,
          body: JSON.stringify({ error: `Sheets API error ${r.status}`, detail: errBody.slice(0, 300) })
        };
      }

      const json = await r.json();
      const rows = json.values || [];

      if (rows.length < 10) {
        // Got data but probably wrong sheet — try next
        continue;
      }

      // Parse the budget rows
      // Row indices 0-based. Col 0=A(empty), Col 1=B(label), Col 2=C(Jan value)
      const n = (rowIdx, colIdx = 2) => {
        const row = rows[rowIdx];
        if (!row) return 0;
        const v = row[colIdx];
        return (v !== undefined && v !== '' && v !== null) ? (parseFloat(v) || 0) : 0;
      };

      // Log first few rows for debugging
      const preview = rows.slice(0, 20).map((r,i) => `${i+1}: ${r[1]||''} | ${r[2]||''}`);

      // Revenue (rows 5-15 = indices 5-15, 1-indexed sheet rows 6-16)
      const ghost   = n(5);
      const wgs     = n(6);
      const campari = n(7);
      const titos   = n(8);
      const patron  = n(9);
      const mhusa   = n(10);
      const activ   = n(11);
      const prod    = n(12);
      const deliv   = n(13);
      const totalRev = n(15) || (ghost+wgs+campari+titos+patron+mhusa+activ+prod+deliv);

      // COGS row 26 = index 25
      const cogs = n(25) || n(19);

      // GP row 27 = index 26
      const gp = n(26) || (totalRev - cogs);
      const gpPct = totalRev > 0 ? gp / totalRev : 0;

      // SG&A
      const insurance = n(31)+n(32)+n(33)+n(34)+n(35)+n(36);
      const rent      = n(39);
      const utilities = n(44)+n(46)+n(47);
      const software  = n(49)+n(50)+n(51)+n(52)+n(53)+n(54);
      const autoLoans = n(57)+n(58)+n(59);
      const fuel      = n(60)+n(61)+n(62)+n(63)+n(64);
      const debt      = n(66)+n(67)+n(68)+n(69);
      const other     = n(38)+n(55)+n(71);
      const totalSGA  = n(72) || (insurance+rent+utilities+software+autoLoans+fuel+debt+other);
      const ebit      = n(75) || (gp - totalSGA);
      const breakeven = gpPct > 0 ? Math.ceil(totalSGA / gpPct / 500) * 500 : 39000;

      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({
          ok: true,
          sheetFound: sheet,
          rowCount: rows.length,
          preview,
          budget: {
            totalRev, retainerRev: ghost+wgs+campari+titos+patron+mhusa,
            adhocRev: activ+prod+deliv, cogs, gp, gpPct,
            totalSGA, ebit, breakeven,
            rent, autoLoans, debt, software, insurance, utilities, fuel,
            other: other + n(38),
            // Individual retainers
            ghost, wgs, campari, titos, patron, mhusa, activ, prod, deliv
          }
        })
      };
    } catch (err) {
      console.error(`[sheets-budget] Error with sheet "${sheet}":`, err.message);
      continue;
    }
  }

  return {
    statusCode: 500,
    headers: CORS,
    body: JSON.stringify({
      error: 'Could not read any budget sheet',
      tried: sheetNames,
      hint: 'Check sheet is shared as "Anyone with the link → Viewer" and API key has Sheets API enabled'
    })
  };
};
