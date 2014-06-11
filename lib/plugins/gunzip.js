'use strict';

var util = require('./util');
var zlib = require('zlib');

exports.name = 'gunzip';

// gunzips a stream, if necessary
exports.handleResponse = function(request, source, dest) {
  if (util.matchHeaders(source.headers, { 'content-encoding': /gzip/ })) {
    request.log('uncompressing with gunzip');
    delete dest.headers['content-encoding'];
    source.pipe(zlib.createGunzip()).pipe(dest);
  } else {
    // Do nothing
    source.pipe(dest);
  }

  source.resume();
};
