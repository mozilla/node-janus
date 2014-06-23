'use strict';

var zlib = require('zlib');

var util = require('./util');

var NAME = exports.name = 'gunzip';

var emitter = require('../emit').get(NAME);

// gunzips a stream, if necessary
exports.handleResponse = function(request, source, dest) {
  if (util.matchHeaders(source.headers, { 'content-encoding': /gzip/ })) {
    emitter.signal('count', 'hit');
    request.log('uncompressing with gunzip');
    delete dest.headers['content-encoding'];
    source.pipe(zlib.createGunzip()).pipe(dest);
  } else {
    // Do nothing
    emitter.signal('count', 'miss');
    source.pipe(dest);
  }

  source.resume();
};
