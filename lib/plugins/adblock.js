'use strict';

var url = require('url');
var http = require('http');

exports.name = 'adblock';

function fetchBlockList(list) {
  // Fetch the list of hostnames to block
  http.get('http://pgl.yoyo.org/adservers/serverlist.php?&mimetype=plaintext',
              function(res) {
                var bufs = [];

                res.on('data', function(chunk) {
                  bufs.push(chunk);
                });

                res.on('end', function() {
                  var lines = Buffer.concat(bufs).toString('utf8').split('\n');
                  for (var i = 0; i < lines.length; i++) {
                    var hostname = lines[i].trim();
                    if (hostname === '') {
                      continue;
                    }

                    // Use the hashtable as a set
                    list[hostname] = true;
                  }
                });
              });
}

var blockList = {};
fetchBlockList(blockList);

exports.handleRequest = function(request, response) {
  var requestedUrl = url.parse(request.headers.path || request.url);
  var hosts = requestedUrl.hostname.split('.');

  // We try to match all the subdomains
  // e.g.: a.b.example.com => a.b.example.com, b.example.com, example.com
  for (var i = hosts.length; i >= 2; i--) {
    var h = hosts.slice(-i).join('.');

    if (h in blockList) {
      request.log('BLOCKED', requestedUrl.href);
      response.writeHead(403);
      response.end();
      return true;
    }
  }

  return false;
};