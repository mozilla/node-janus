'use strict';

var fs = require('fs');
var temp = require ('temp');
var execFile = require('child_process').execFile;
var mozjpeg = require('mozjpeg').path;
var pngquant = require('pngquant-bin').path;
var imgtype = require('imagetype');

exports.name = 'imgcompression';

exports.handleResponse = function(request, source, dest) {
  // If this is an image we first write it into a file, then optimize it
  // and send it
  if (source.headers['content-type'] === 'image/jpeg' ||
      source.headers['content-type'] === 'image/png') {
    var path = temp.path();
    var optPath = path + '.opt';
    var imageFile = fs.createWriteStream(path);

    source.pipe(imageFile);

    imageFile.on('finish', function() {
      function sendImage(path) {
        fs.stat(path, function(err, stats) {
          dest.headers['content-length'] = stats.size.toString();

          imageFile = fs.createReadStream(path);
          imageFile.pipe(dest);

          dest.on('end', function() {
            fs.unlink(path);
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
                       console.log('error:', stderr);
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
    source.pipe(dest);
  }

  source.resume();
};
