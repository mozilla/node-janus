'use strict';

var url = require('url');
var http = require('http');
var config = require('config');
var fs = require('fs');

var log = require('../log');

var NAME = exports.name = 'urlexpander';

var metrics = require('../metrics').session(NAME);

var hosts = {};

exports.init = function() {
  fs.readFile(config.urlexpander.hostsFile, function(err, data) {
    if (err) {
      log.error('Unable to read URL shorteners list:',
                config.urlexpander.hostsFile);
      return;
    }
    var lines = data.toString().split('\n');
    lines.forEach(function(line) {
      var shortener = line.trim();
      if (shortener !== '') {
        hosts[shortener] = true;
      }
    });
  });
};

function sendNewLocation(request, response, callback) {
  if (request.redirected) {
    response.writeHead(302, '', { location: request.url });
    response.end();
    callback(null, true);
  } else {
    callback(null, false);
  }
}

function resolve(request, response, redirectCount, callback) {
  var currentUrl = url.parse(request.url);

  if (redirectCount < config.urlexpander.maxRedirect &&
      currentUrl.hostname in hosts) {
    http.get(request.url, function(res) {
      // We need to consume the data so the socket is not kept open.
      res.on('data', function() {});

      if (res.statusCode >= 300 && res.statusCode < 400) {
        request.url = res.headers.location;
        request.redirected = true;
        metrics.count('hit');
        resolve(request, response, redirectCount + 1, callback);
      } else {
        sendNewLocation(request, response, callback);
      }
    });
  } else {
    sendNewLocation(request, response, callback);
  }
}

exports.handleRequest = function(request, response, options, callback) {
  resolve(request, response, 0, callback);
};
