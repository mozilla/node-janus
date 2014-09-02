'use strict';

var spawn = require('child_process').spawn;
var config = require('config');
var imageWorker = require('janus-image-worker');

var log = require('../log');

var NAME = exports.name = 'imgcompression';

var metrics = require('../metrics').session(NAME);

exports.handleResponse = function(request, source, dest) {
  if (source.headers['content-type'] === 'image/jpeg' ||
      source.headers['content-type'] === 'image/png') {

    metrics.count('hit');

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
    source.forward(dest);
  }

  source.resume();
};
