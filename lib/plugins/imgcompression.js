'use strict';

var fs = require('fs');
var temp = require ('temp');
var execFile = require('child_process').execFile;
var jpegtran = require('mozjpeg-bin').jpegtran;
var pngquant = require('pngquant-bin').path;
var imgtype = require('imagetype');

var log = require('../log');

var NAME = exports.name = 'imgcompression';

var metrics = require('../metrics').session(NAME);

// Send processed image from given path to the given destination.
function sendImage(source, dest, path) {
  fs.stat(path, function(err, stats) {
    var finalize = function() {
      fs.unlink(path);
    };

    if (source.headers['content-length']) {
      var origLength = parseInt(source.headers['content-length']);
      var newLength = stats.size.toString();

      source.headers['content-length'] = newLength;

      metrics.count('in', origLength);
      metrics.count('out', newLength);
    }

    var imageFile = fs.createReadStream(path);

    dest.writeHead(source.statusCode, source.headers);
    imageFile.pipe(dest);

    dest.on('end', finalize);
    dest.on('close', finalize);
    dest.on('error', finalize);
  });
}

exports.handleResponse = function(request, source, dest) {
  // If this is an image we first write it into a file, then optimize it
  // and send it.
  if (source.headers['content-type'] === 'image/jpeg' ||
      source.headers['content-type'] === 'image/png') {

    var path = temp.path();
    var optPath = path + '.opt';
    var imageFile = fs.createWriteStream(path);

    source.pipe(imageFile);

    imageFile.on('finish', function() {
      // We need to check the actual type of the downloaded image.
      // Some websites (e.g. mozilla.org) are sending JPEGs as PNGs.
      imgtype(path, function(type) {
        if (type === 'png') {
          execFile(pngquant,
                   ['--skip-if-larger', '-o', optPath, path],
                   function(err) {
                     if (err) {
                       sendImage(source, dest, path);
                     } else {
                       sendImage(source, dest, optPath);
                       fs.unlink(path);
                     }
                   });
        } else if (type === 'jpeg') {
          execFile(jpegtran,
                   ['-outfile', optPath, path],
                   function(err, stdout, stderr) {
                     if (err) {
                       log.error('mozjpeg error: ', stderr);
                       sendImage(source, dest, path);
                     } else {
                       sendImage(source, dest, optPath);
                       fs.unlink(path);
                     }
                   });
        } else {
          sendImage(source, dest, path);
        }
      });
    });
  } else {
    source.forward(dest);
  }

  source.resume();
};
