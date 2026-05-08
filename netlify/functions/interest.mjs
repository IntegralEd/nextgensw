// netlify/functions/interest.js
//
// Receives JSON from the public site's interest forms (Apply CTA waitlist
// + future general "stay in touch" form) and writes a record to the
// Airtable Contact_List table. Holds the write PAT in Netlify env vars
// so it never appears in client-side code.
//
// Env required (set in Netlify → Site config → Environment variables):
//   AIRTABLE_BASE_ID    — appAWSOlM2P9kqgOV
//   AIRTABLE_PAT_WRITE  — PAT scoped to data.records:create on this base only

const VALID_ROLES = [
  'Donor/Sponsor',
  'Intern/Applicant',
  'Employer',
  'Volunteer',
  'Other',
];

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

  // Basic validation
  const email = String(p.email || '').trim().slice(0, 200);
  const name = String(p.name || '').trim().slice(0, 200);
  if (!email || !/.+@.+\..+/.test(email)) {
    return { statusCode: 400, headers: corsHeaders(origin), body: 'invalid email' };
  }

  // Light bot filter — drop obvious crawlers/headless-without-UA
  const ua = (event.headers['user-agent'] || '').toLowerCase();
  if (/(bot|spider|crawler|headlesschrome\/0|monitor)/.test(ua)) {
    // pretend success so bots think they got through
    return { statusCode: 201, headers: corsHeaders(origin), body: '{"ok":true}' };
  }

  const phone = String(p.phone_number || '').trim().slice(0, 40);
  const referral = String(p.referral_source || '').trim().slice(0, 500);
  const notes = String(p.notes || '').trim().slice(0, 2000);
  const interests = Array.isArray(p.interests)
    ? p.interests.filter((i) => VALID_ROLES.includes(i))
    : [];

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
          Phone_Number: phone,
          Interested_Role: interests,
          Referral_Source: referral,
          Notes: notes,
          Consent: !!p.consent,
          Status: 'New',
          // Created   ← auto (createdTime)
          // Handled_by ← admin assigns later
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
