'use strict';

var Png = require('png').Png;

var util = require('./util');

// Colored placeholder image.
var Box = function(width, height, r, g, b) {
  var buffer = new Buffer(width * height * 3);
  for (var i = 0; i < height; ++i) {
    for (var j = 0; j < width; ++j) {
      buffer[i * width * 3 + j * 3 + 0] = r;
      buffer[i * width * 3 + j * 3 + 1] = g;
      buffer[i * width * 3 + j * 3 + 2] = b;
    }
  }
  return new Png(buffer, width, height, 'rgb').encodeSync();
};

var placeholderImage = new Box(1, 1, 255, 0, 0);

// Replace PNGs with a 1x1 red image
exports.handleResponse = function(request, source, dest) {
  if (util.matchHeaders(source.headers, { 'content-type': 'image/png' })) {
    console.log('replacing image');
    dest.write(placeholderImage);
    dest.end();
  } else {
    source.pipe(dest);
    source.resume();
  }
};
