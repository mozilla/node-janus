'use strict';

var sleep = require('sleep');
var temp = require('temp');
var fs = require('fs');

var helper = require('../helper/testHelper');

require('chai').should();

module.exports = {
  'cache': {
    before: function(done) {
      helper.setupLocalServer('test/helper/content/', function() {
        helper.loadProxy();
        done();
      });
    },

    after: helper.cleanAll,

    'enabled': {
      'basic': function(done) {
        var tmpFilename = temp.path({ dir: '.' });
        var req = helper.makeRequest(helper.getLocalUrl(tmpFilename),
                                     '+cache');

        fs.writeFileSync('test/helper/content/' + tmpFilename, '1');
        helper.getContent(req, function(content) {
          content.should.equal('1');

          fs.writeFileSync('test/helper/content/' + tmpFilename, '2');
          helper.getContent(req, function(content) {
            fs.unlink('test/helper/content/' + tmpFilename);
            content.should.equal('1');
            done();
          });
        });
      },

      'expiration': function(done) {
        var tmpFilename = temp.path({ dir: '.' });
        var req = helper.makeRequest(helper.getLocalUrl(tmpFilename),
                                     '+cache');

        fs.writeFileSync('test/helper/content/' + tmpFilename, '1');
        helper.getContent(req, function(content) {
          content.should.equal('1');

          fs.writeFileSync('test/helper/content/' + tmpFilename, '2');
          sleep.sleep(1);
          helper.getContent(req, function(content) {
            fs.unlink('test/helper/content/' + tmpFilename);
            content.should.equal('2');
            done();
          });
        });
      },
    },

    'disabled': {
      'basic': function(done) {
        var tmpFilename = temp.path({ dir: '.' });
        var req = helper.makeRequest(helper.getLocalUrl(tmpFilename),
                                     '-cache');

        fs.writeFileSync('test/helper/content/' + tmpFilename, '1');
        helper.getContent(req, function(content) {
          content.should.equal('1');

          fs.writeFileSync('test/helper/content/' + tmpFilename, '2');
          helper.getContent(req, function(content) {
            fs.unlink('test/helper/content/' + tmpFilename);
            content.should.equal('2');
            done();
          });
        });
      }
    },
  },
};
