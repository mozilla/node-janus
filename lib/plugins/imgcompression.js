'use strict';

var spawn = require('child_process').spawn;
var config = require('config');
var imageWorker = require('janus-image-worker');

var log = require('../log');
var util = require('../util');

var NAME = exports.name = 'imgcompression';
var MIN_SIZE = util.kbToByte(config.imgcompression.minSize);

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
  var imgType = imageType(source);
  var contentLength = parseInt(source.headers['content-length'] || '0');
  var isGoodSize = contentLength >= MIN_SIZE;
  var isSupportedImage = isSupportedImageFormat(imgType);

  return isSupportedImage && isGoodSize;
}

exports.handleResponse = function(request, source, dest) {
  var imgType = imageType(source);

  if (shouldCompress(source)) {
    metrics.count('type.' + imgType + '.hit');

    var args = ['--small'];

    if (config.imgcompression.turbo) {
      args[0] = '--fast';
    }

    delete source.headers['content-length'];
    dest.writeHead(source.statusCode, source.headers);

    var child = spawn(imageWorker.bin,
                      args,
                      {
                        stdio: 'pipe',
                        env: { LD_LIBRARY_PATH: imageWorker.libraryPath }
                      });

    source.pipe(child.stdin);
    child.stdout.pipe(dest);

    child.stderr.on('data', function(data) {
      log.info(data.toString());
    });

    child.stdin.on('error', function(data) {
      log.error(data.toString());
    });
  } else {
    if (isSupportedImageFormat(imgType)) {
      metrics.count('type.' + imgType + '.miss');
    }

    source.forward(dest);
  }

  source.resume();
};
