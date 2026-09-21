import crypto from "node:crypto";

const PAYNOW_INITIATE_URL =
  "https://www.paynow.co.zw/interface/initiatetransaction";

function requiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}

function generateHash(values) {
  const integrationKey = requiredEnv("PAYNOW_INTEGRATION_KEY");

  const concatenated = Object.entries(values)
    .filter(([key]) => key.toLowerCase() !== "hash")
    .map(([, value]) => value == null ? "" : String(value))
    .join("");

  return crypto
    .createHash("sha512")
    .update(concatenated + integrationKey, "utf8")
    .digest("hex")
    .toUpperCase();
}

export function verifyPaynowHash(values) {
  if (!values || !values.hash) {
    return false;
  }

  const received = String(values.hash).trim().toUpperCase();
  const expected = generateHash(values);

  if (received.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(received),
    Buffer.from(expected)
  );
}

export function buildPaynowRequest({
  reference,
  amount,
  additionalInfo,
  returnUrl,
  resultUrl,
  authEmail,
}) {
  const id = requiredEnv("PAYNOW_INTEGRATION_ID");

  const values = {
    id: String(id),
    reference: String(reference),
    amount: Number(amount).toFixed(2),
    additionalinfo: additionalInfo || "",
    returnurl: String(returnUrl),
    resulturl: String(resultUrl),
    status: "Message",
  };

  if (authEmail) {
    values.authemail = String(authEmail);
  }

  return {
    ...values,
    hash: generateHash(values),
  };
}

export async function initiatePaynowTransaction(options) {
  const payload = buildPaynowRequest(options);

  const body = new URLSearchParams();

  for (const [key, value] of Object.entries(payload)) {
    body.set(key, value);
  }

  const response = await fetch(PAYNOW_INITIATE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "text/plain",
    },
    body: body.toString(),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Paynow initiation HTTP ${response.status}: ${text.slice(0, 500)}`
    );
  }

  const values = parsePaynowMessage(text);

  if (!verifyPaynowHash(values)) {
    throw new Error("Paynow initiation response failed hash validation.");
  }

  if (String(values.status).toLowerCase() !== "ok") {
    throw new Error(
      values.error || "Paynow rejected the transaction."
    );
  }

  if (!values.browserurl || !values.pollurl) {
    throw new Error(
      "Paynow response did not contain BrowserUrl and PollUrl."
    );
  }

  return {
    browserUrl: values.browserurl,
    pollUrl: values.pollurl,
    status: values.status,
    raw: values,
  };
}

export async function pollPaynowTransaction(pollUrl) {
  if (!pollUrl) {
    throw new Error("Paynow PollUrl is required.");
  }

  const response = await fetch(pollUrl, {
    method: "POST",
    headers: {
      Accept: "text/plain",
    },
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Paynow polling HTTP ${response.status}: ${text.slice(0, 500)}`
    );
  }

  const values = parsePaynowMessage(text);

  if (!verifyPaynowHash(values)) {
    throw new Error("Paynow poll response failed hash validation.");
  }

  return values;
}

export function parsePaynowMessage(text) {
  const params = new URLSearchParams(String(text).trim());
  const values = {};

  for (const [key, value] of params.entries()) {
    values[key.toLowerCase()] = value;
  }

  return values;
}

export function amountCentsToPaynowAmount(amountCents) {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new Error("Invalid order amount.");
  }

  return (amountCents / 100).toFixed(2);
}

export function getPaynowStatus(values) {
  return String(values?.status || "").trim().toLowerCase();
}
