'use strict';

var gm = require('gm');
var config = require('config');

var log = require('../log');
var util = require('../util');

var NAME = exports.name = 'imgcompression';
var MIN_SIZE = util.kbToByte(config.imgcompression.minSize);
var MAX_SIZE = util.kbToByte(config.imgcompression.maxSize);
var RESIZE = config.imgcompression.resize;
var DEF_QUALITY = config.imgcompression.defaultQuality;

var metrics = require('../metrics').session(NAME);

function imageType(source) {
  var contentType = source.headers['content-type'];
  if (contentType) {
    var split = contentType.toLowerCase().split('/');
    if (split[0] === 'image') {
      return split[1];
    }
  }
  return null;
}

function isSupportedImageFormat(type) {
  return type === 'jpeg' || type === 'png';
}

function shouldCompress(source) {
  var isSupportedImage = isSupportedImageFormat(imageType(source));
  var contentLength = parseInt(source.headers['content-length'] || '0');
  var isGoodSize = contentLength >= MIN_SIZE && contentLength <= MAX_SIZE;

  return isSupportedImage && isGoodSize;
}

function minifyRatio(size) {
  if (!size) {
    return 1;
  }

  var sizeMap = [1.0, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5,
                 0.45, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15, 0.1];

  function idx(dim) {
    var cw = 200;
    return Math.min(sizeMap.length - 1, Math.floor(dim / cw));
  }

  var fidx = Math.max(idx(size.width), idx(size.height));
  return sizeMap[fidx];
}

exports.handleResponse = function(request, source, dest) {
  var imgType = imageType(source);

  if (shouldCompress(source)) {
    metrics.count('type.' + imgType + '.hit');

    delete source.headers['content-length'];
    dest.writeHead(source.statusCode, source.headers);

    var r = 1;
    var newQuality = DEF_QUALITY;

    if (RESIZE) {
      gm(source, imgType).size({ bufferStream: true }, function(err, size) {
        r = minifyRatio(size);
        if (r < 1) {
          this.resize(size.width * r, size.height * r);
        }
        this.quality(newQuality);
        this.stream().pipe(dest);
      });
    } else {
      gm(source, imgType).quality(newQuality).stream().pipe(dest);
    }

    log.info('Re-encoded image: ratio %d and quality %d', r, newQuality);
  } else {
    if (isSupportedImageFormat(imgType)) {
      metrics.count('type.' + imgType + '.miss');
    }

    source.forward(dest);
  }

  source.resume();
};
