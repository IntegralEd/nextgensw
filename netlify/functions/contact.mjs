// netlify/functions/contact.mjs
//
// Receives JSON from the public "Contact us" modal and writes a row
// to the Airtable Contact_List table tagged as a contact inquiry
// (Referral_Source = "Contact form"). Reuses the same write PAT
// pattern as interest.mjs — write key stays in Netlify env, never
// exposed in client code.
//
// Spam protection layers:
//   1) Honeypot field (botcheck) on the client form — bots fill it,
//      humans don't. Filtered before the request leaves the browser.
//   2) Origin allowlist — only nextgensw.org / www.nextgensw.org.
//   3) UA filter — drop obvious crawlers; their attempts "succeed"
//      with a 201 fake-ok so bots don't probe alternative paths.
//   4) Field length caps so a flood of garbage can't blow up storage.
//
// Env required (Netlify → Site config → Environment variables):
//   AIRTABLE_BASE_ID    — appAWSOlM2P9kqgOV
//   AIRTABLE_PAT_WRITE  — PAT scoped to data.records:create on this
//                         base only

const ALLOWED_ORIGINS = [
  'https://nextgensw.org',
  'https://www.nextgensw.org',
];

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : 'https://nextgensw.org';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin || '';

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(origin), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(origin), body: 'method not allowed' };
  }

  let p;
  try {
    p = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: corsHeaders(origin), body: 'bad json' };
  }

  // Validation
  const email = String(p.email || '').trim().slice(0, 200);
  const name = String(p.name || '').trim().slice(0, 200);
  const message = String(p.message || '').trim().slice(0, 5000);
  const sendCopy = p.sendCopy === true;

  if (!email || !/.+@.+\..+/.test(email)) {
    return { statusCode: 400, headers: corsHeaders(origin), body: 'invalid email' };
  }
  if (!name || !message) {
    return { statusCode: 400, headers: corsHeaders(origin), body: 'missing fields' };
  }

  // Bot UA filter — pretend success so crawlers don't probe further
  const ua = (event.headers['user-agent'] || '').toLowerCase();
  if (/(bot|spider|crawler|headlesschrome\/0|monitor)/.test(ua)) {
    return { statusCode: 201, headers: corsHeaders(origin), body: '{"ok":true}' };
  }

  const AT = process.env.AIRTABLE_BASE_ID;
  const PAT = process.env.AIRTABLE_PAT_WRITE;
  if (!AT || !PAT) {
    return {
      statusCode: 500,
      headers: corsHeaders(origin),
      body: 'server not configured',
    };
  }

  try {
    const res = await fetch(`https://api.airtable.com/v0/${AT}/Contact_List`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAT}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          Name: name,
          Email: email,
          Interested_Role: ['Other'],
          Referral_Source: 'Contact form',
          Notes: message,
          Consent: true, // they reached out — implicit opt-in for reply
          Send_Copy_Requested: sendCopy,
          Status: 'New',
        },
        typecast: true,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        statusCode: 502,
        headers: corsHeaders(origin),
        body: `airtable: ${text.slice(0, 400)}`,
      };
    }
    return {
      statusCode: 201,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
      body: '{"ok":true}',
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: corsHeaders(origin),
      body: `network: ${err.message || 'unknown'}`,
    };
  }
}
