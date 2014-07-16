'use strict';

var helper = require('../helper/testHelper');

require('chai').should();
var expect = require('chai').expect;

var TEST_FILE = 'basic.html';
var LENGTH = '';

module.exports = {
  'fork': {
    before: function(done) {
      helper.setupLocalServer('test/helper/content/', function() {
        helper.loadProxy();

        // Get the original content length of the test file.
        var req = helper.makeRequest(helper.getLocalUrl(TEST_FILE),
                                     '-fork -cache -gzip');

        helper.getContent(req, function(content) {
          LENGTH = content.length.toString();
          done();
        });
      });
    },

    after: helper.cleanAll,

    'enabled': {
      'cached gzip': function(done) {
        var req = helper.makeRequest(helper.getLocalUrl(TEST_FILE),
                                     '+fork +cache +gzip');

        helper.getContent(req, function(content, statusCode, headers) {
          expect(headers['x-original-content-length']).to.equal(undefined);
          expect(headers['content-encoding']).to.equal(undefined);

          helper.getContent(req, function(content, statusCode, headers) {
            expect(headers['x-original-content-length']).to.equal(LENGTH);
            expect(headers['content-encoding']).to.equal('gzip');
            done();
          });
        });
      },

      'uncached gzip': function(done) {
        var req = helper.makeRequest(helper.getLocalUrl(TEST_FILE),
                                     '+fork -cache +gzip');

        helper.getContent(req, function(content, statusCode, headers) {
          expect(headers['x-original-content-length']).to.equal(undefined);
          expect(headers['content-encoding']).to.equal(undefined);

          helper.getContent(req, function(content, statusCode, headers) {
            expect(headers['x-original-content-length']).to.equal(undefined);
            expect(headers['content-encoding']).to.equal(undefined);
            done();
          });
        });
      }
    },

    'disabled': {
      'cached gzip': function(done) {
        var req = helper.makeRequest(helper.getLocalUrl(TEST_FILE),
                                     '-fork +cache +gzip');

        helper.getContent(req, function(content, statusCode, headers) {
          expect(headers['x-original-content-length']).to.equal(LENGTH);
          expect(headers['content-encoding']).to.equal('gzip');

          helper.getContent(req, function(content, statusCode, headers) {
            expect(headers['x-original-content-length']).to.equal(LENGTH);
            expect(headers['content-encoding']).to.equal('gzip');
            done();
          });
        });
      },

      'uncached gzip': function(done) {
        var req = helper.makeRequest(helper.getLocalUrl(TEST_FILE),
                                     '-fork -cache +gzip');

        helper.getContent(req, function(content, statusCode, headers) {
          expect(headers['x-original-content-length']).to.equal(LENGTH);
          expect(headers['content-encoding']).to.equal('gzip');

          helper.getContent(req, function(content, statusCode, headers) {
            expect(headers['x-original-content-length']).to.equal(LENGTH);
            expect(headers['content-encoding']).to.equal('gzip');
            done();
          });
        });
      }
    }
  }
};
