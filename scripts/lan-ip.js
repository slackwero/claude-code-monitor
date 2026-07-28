#!/usr/bin/env node
// Prints/returns this machine's LAN IPv4 (first non-internal, non-link-local
// interface). Pure Node so it works identically on macOS and Linux.
'use strict';

const os = require('os');

function lanIp() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces || []) {
      if (i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.')) {
        return i.address;
      }
    }
  }
  return null;
}

if (require.main === module) {
  const ip = lanIp();
  if (!ip) process.exit(1);
  console.log(ip);
}

module.exports = lanIp;
