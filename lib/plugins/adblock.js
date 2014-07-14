'use strict';

var url = require('url');
var http = require('http');
var log = require('../log');
var punycode = require('punycode');

var NAME = exports.name = 'adblock';

var emitter = require('../emit').get(NAME);

function fetchBlockList(url, list, callback) {
  log.debug('fetching blocklist');
  // Fetch the list of hostnames to block
  http.get(url, function(res) {
    var bufs = [];

    res.on('data', function(chunk) {
      bufs.push(chunk);
    });

    res.on('end', function() {
      var lines = Buffer.concat(bufs).toString().split('\n');
      for (var i = 0; i < lines.length; i++) {
        var hostname = punycode.toASCII(lines[i].trim());
        if (hostname === '') {
          continue;
        }

        // Use the hashtable as a set
        list[hostname] = true;
      }

      log.debug('fetched adblock list');
      if (callback) {
        callback();
      }
    });
  }).on('error', function(e) {
    log.error('failed to fetch block list', e);
  });
}

exports.blockList = {};

exports.init = function(config, callback) {
  var url = config.adblock.listUrl;

  fetchBlockList(url, exports.blockList, callback);
};

exports.handleRequest = function(request, response, options, callback) {
  emitter.signal('start');

  var requestedUrl = url.parse(request.url);
  var hosts = requestedUrl.host.split('.');

  //console.log('testing', request.url, requestedUrl);
  // We try to match all the subdomains
  // e.g.: a.b.example.com => a.b.example.com, b.example.com, example.com
  for (var i = hosts.length; i >= 2; i--) {
    var h = hosts.slice(-i).join('.');

    if (h in exports.blockList) {
      emitter.signal('count', 'hit');
      request.debug('blocked ad');
      response.writeHead(403, '', { 'content-type': 'text/plain' });
      response.write('Blocked by adblock');
      response.end();
      emitter.signal('end');
      callback(null, true);
      return;
    }
  }

  emitter.signal('count', 'miss');
  emitter.signal('end');
  callback(null, false);
};
