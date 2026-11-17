// HTTPS GET with a streamed body. Some government hosts serve their
// certificate without the intermediate that signed it, which browsers repair
// by fetching the issuer named in the certificate (AIA). Node does not, so
// the same repair is done here, accepting the issuer only when it is signed
// by one of Node's bundled root authorities. The issuer address comes from a
// certificate that has not been verified yet, so it is only ever fetched
// from a public host.

import { X509Certificate } from 'node:crypto';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';

const TIMEOUT_MS = 120_000;
const MAX_CERT_BYTES = 64 * 1024;
/** @type {Map<string, string>} host -> verified issuer certificate (PEM) */
const issuers = new Map();

const NON_PUBLIC = new net.BlockList();
for (const [prefix, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.168.0.0', 16], ['224.0.0.0', 3],
]) NON_PUBLIC.addSubnet(prefix, bits, 'ipv4');
// IPv4-mapped IPv6 addresses are matched against the IPv4 rules by BlockList.
for (const [prefix, bits] of [
  ['::', 127], ['64:ff9b::', 96], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
]) NON_PUBLIC.addSubnet(prefix, bits, 'ipv6');

/** Loopback, private, link-local and multicast addresses. */
export function isNonPublicAddress(address, family) {
  return NON_PUBLIC.check(address, family === 6 ? 'ipv6' : 'ipv4');
}

// A resolver for http.get that refuses names pointing inside the machine or
// the local network.
function publicLookup(hostname, options, callback) {
  dns.lookup(hostname, options, (err, address, family) => {
    if (err) return callback(err);
    const found = Array.isArray(address) ? address : [{ address, family }];
    if (found.some((a) => isNonPublicAddress(a.address, a.family))) {
      return callback(new Error('the issuer certificate address is not a public host'));
    }
    callback(null, address, family);
  });
}

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
    // A literal address never reaches the resolver, so refuse it here.
    if (net.isIP(new URL(url).hostname.replace(/^\[|\]$/g, ''))) {
      reject(new Error('the issuer certificate address is not a host name'));
      return;
    }
    http
      .get(url, { lookup: publicLookup, signal: AbortSignal.timeout(TIMEOUT_MS) }, (res) => {
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
        res.on('end', () => {
          try {
            resolve(new X509Certificate(Buffer.concat(chunks)));
          } catch {
            reject(new Error('the issuer certificate could not be read'));
          }
        });
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
