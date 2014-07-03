'use strict';

var CONFIG = require('config');

var lzma = require('lzma-native');

var util = require('./util');

var NAME = exports.name = 'xz';

var emitter = require('../emit').get(NAME);

// Adds lzma compression for text/* if the agent accepts it
exports.handleResponse = function(request, source, dest) {
  var headerMatch = {
    'content-type': /(text\/|\/json|\/javascript|\/x-javascript)/,
    'content-encoding': false
  };

  if (util.matchHeaders(request.headers, { 'accept-encoding': /xz/ }) &&
      util.matchHeaders(source.headers, headerMatch)) {
    emitter.signal('count', 'hit');
    emitter.signal('start');

    // We are writing xz content
    source.headers['content-encoding'] = 'xz';

    // We do not know the length
    delete source.headers['content-length'];

    dest.writeHead(source.statusCode, source.headers);

    source.pipe(lzma.createStream('easyEncoder',
      { preset: CONFIG.xz.level })).pipe(dest);

    var inCount = 0;
    source.on('data', function(buf) {
      inCount += buf.length;
    });

    var outCount = 0;
    dest.on('data', function(buf) {
      outCount += buf.length;
    });

    dest.on('finish', function() {
      emitter.signal('end');
    });
  } else {
    // Do nothing
    emitter.signal('count', 'miss');
    source.forward(dest);
  }

  source.resume();
};
