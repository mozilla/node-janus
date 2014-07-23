'use strict';

var fs = require('fs');

var TEMPLATE_TUNNEL_HTTPS = fs.readFileSync('config/pac-tunnel.js').toString();
var TEMPLATE_NO_TUNNEL = fs.readFileSync('config/pac-no-tunnel.js').toString();

exports.generate = function generate(hostAndPort, tunnelSsl) {
  var template = tunnelSsl ? TEMPLATE_TUNNEL_HTTPS : TEMPLATE_NO_TUNNEL;

  return template.replace('<hostport>', hostAndPort);
};