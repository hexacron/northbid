// HTTPS GET with a streamed body. Some government hosts serve their
// certificate without the intermediate that signed it, which browsers repair
// by fetching the issuer named in the certificate (AIA). Node does not, so
// the same repair is done here, accepting the issuer only when it is signed
// by one of Node's bundled root authorities.

import { X509Certificate } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';

const TIMEOUT_MS = 120_000;
const MAX_CERT_BYTES = 64 * 1024;
/** @type {Map<string, string>} host -> verified issuer certificate (PEM) */
const issuers = new Map();

function get(url, headers, ca) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers, ca, signal: AbortSignal.timeout(TIMEOUT_MS) }, resolve).on('error', reject);
  });
}

function peerCertificate(host) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false }, () => {
      const cert = socket.getPeerX509Certificate();
      socket.destroy();
      cert ? resolve(cert) : reject(new Error('the server sent no certificate'));
    });
    socket.setTimeout(TIMEOUT_MS, () => socket.destroy(new Error('timed out reading the server certificate')));
    socket.on('error', reject);
  });
}

function fetchCertificate(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, { signal: AbortSignal.timeout(TIMEOUT_MS) }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`issuer certificate request returned HTTP ${res.statusCode}`));
          return;
        }
        const chunks = [];
        let size = 0;
        res.on('data', (chunk) => {
          size += chunk.length;
          if (size > MAX_CERT_BYTES) res.destroy(new Error('issuer certificate is too large'));
          else chunks.push(chunk);
        });
        res.on('end', () => resolve(new X509Certificate(Buffer.concat(chunks))));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

async function missingIssuer(host) {
  const leaf = await peerCertificate(host);
  const url = /CA Issuers - URI:(http:\/\/\S+)/.exec(leaf.infoAccess ?? '')?.[1];
  if (!url) throw new Error('the server certificate does not name its issuer');
  const issuer = await fetchCertificate(url);
  const now = Date.now();
  const current = Date.parse(issuer.validFrom) <= now && now <= Date.parse(issuer.validTo);
  const signsLeaf = leaf.checkIssued(issuer) && leaf.verify(issuer.publicKey);
  const trusted = tls.rootCertificates.some((pem) => {
    const root = new X509Certificate(pem);
    return issuer.checkIssued(root) && issuer.verify(root.publicKey);
  });
  if (!current || !signsLeaf || !trusted) throw new Error('the server certificate chain could not be verified');
  return issuer.toString();
}

/**
 * @param {string} url https URL
 * @param {Record<string, string>} headers
 * @returns {Promise<import('node:http').IncomingMessage>} response with an unread body
 */
export async function download(url, headers) {
  const { host } = new URL(url);
  const withIssuer = (pem) => [...tls.rootCertificates, pem];
  if (issuers.has(host)) return get(url, headers, withIssuer(issuers.get(host)));
  try {
    return await get(url, headers);
  } catch (err) {
    if (err.code !== 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') throw err;
    const pem = await missingIssuer(host);
    issuers.set(host, pem);
    return get(url, headers, withIssuer(pem));
  }
}
