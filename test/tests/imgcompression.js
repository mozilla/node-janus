'use strict';

var http = require('http');
var util = require('../../lib/util');
var fs = require('fs');

var helper = require('../helper/testHelper');
var DummyResponse = require('../helper/dummyResponse');

var imgcompression = require('../../lib/plugins/imgcompression.js');

var baseSize = 0;
var compressedSize = 0;

require('chai').should();

function testImageSize(url, done) {
  http.get(url, function(source) {
    source.resume = function() {};

    var dest = new DummyResponse();
    dest.on('data', function() {
    });
    dest.on('end', function() {
      var compressedLength = parseInt(dest.headers['content-length']);
      var baseLength = parseInt(source.headers['content-length']);

      compressedSize += compressedLength;
      baseSize += baseLength;
      compressedLength.should.be.at.most(baseLength);
      done();
    });

    dest.headers['content-length'] = source.headers['content-length'];
    imgcompression.handleResponse(null, source, dest);
  });
}

module.exports = {
  'imgcompression': {
    'sizes': {
      before: function(done) {
        helper.setupLocalServer('test/helper/content/imgs/', done);
      },

      after: function() {
        console.log('\n\n\tTotal image compression: %d% (%dKB -> %dKB).',
                    (100 - (compressedSize * 100) / baseSize).toFixed(2),
                    Math.round(util.byteToKb(baseSize)),
                    Math.round(util.byteToKb(compressedSize)));
        helper.cleanAll();
      },
    },
  },
};

var images = fs.readdirSync('test/helper/content/imgs/');
images.forEach(function(img) {
  module.exports.imgcompression.sizes[img] = function(done) {
    testImageSize(helper.getLocalUrl(img), done);
  };
});
