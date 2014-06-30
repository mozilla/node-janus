'use strict';

var fs = require('fs');
var temp = require ('temp');
var execFile = require('child_process').execFile;
var mozjpeg = require('mozjpeg').path;
var pngquant = require('pngquant-bin').path;
var imgtype = require('imagetype');

var log = require('../log');

var NAME = exports.name = 'imgcompression';

var emitter = require('../emit').get(NAME);

exports.handleResponse = function(request, source, dest) {
  // If this is an image we first write it into a file, then optimize it
  // and send it.
  if (source.headers['content-type'] === 'image/jpeg' ||
      source.headers['content-type'] === 'image/png') {
    emitter.signal('start');
    var path = temp.path();
    var optPath = path + '.opt';
    var imageFile = fs.createWriteStream(path);

    source.pipe(imageFile);

    imageFile.on('finish', function() {
      function sendImage(path) {
        fs.stat(path, function(err, stats) {
          if (source.headers['content-length']) {
            var origLength = parseInt(source.headers['content-length']);
            var newLength = stats.size.toString();

            // TODO(snorp): This should just be a histrogram metric
            request.info('reduced file size to ' +
              Math.round((newLength / origLength) * 100) + '%');
            source.headers['content-length'] = newLength;
          }

          imageFile = fs.createReadStream(path);

          dest.writeHead(source.statusCode, source.headers);
          imageFile.pipe(dest);

          dest.on('end', function() {
            fs.unlink(path);
            emitter.signal('end');
          });
        });
      }

      // We need to check the actual type of the downloaded image.
      // Some websites (e.g. mozilla.org) are sending JPEGs as PNGs.
      imgtype(path, function(type) {
        if (type === 'png') {
          execFile(pngquant,
                   ['--skip-if-larger', '-o', optPath, path],
                   function(err) {
                     if (err) {
                       sendImage(path);
                     } else {
                       sendImage(optPath);
                       fs.unlink(path);
                     }
                   });
        } else if (type === 'jpeg') {
          execFile(mozjpeg,
                   ['-outfile', optPath, path],
                   function(err, stdout, stderr) {
                     if (err) {
                       log.error('mozjpeg error: ', stderr);
                       sendImage(path);
                     } else {
                       sendImage(optPath);
                       fs.unlink(path);
                     }
                   });
        } else {
          sendImage(path);
        }
      });
    });
  } else {
    source.forward(dest);
  }

  source.resume();
};
