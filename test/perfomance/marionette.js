'use strict';

var Marionette = require('marionette-client');

var util = require('../../lib/util');
var metrics = require('../../lib/metrics');
var helper = require('../helper/testHelper');

var driver = new Marionette.Drivers.Tcp({});
var client;

require('chai').should();

var websites = [
  'http://9gag.com/',
  'http://about.com',
  'http://adobe.com',
  'http://alibaba.com',
  'http://allrecipes.com/',
  'http://amazon.com',
  'http://ameblo.jp',
  'http://aol.com',
  'http://apple.com',
  'http://ask.com',
  'http://bbc.co.uk',
  'http://bing.com',
  'http://blog.instagram.com/',
  'http://cnet.com',
  'http://cnn.com',
  'http://conduit.com',
  'http://craigslist.org',
  'http://ebay.com',
  'http://en.wikipedia.org/wiki/Main_Page',
  'http://espn.go.com/',
  'http://ezinearticles.com',
  'http://fc2.com',
  'http://fileserve.com',
  'http://gizmodo.com/',
  'http://go.com',
  'http://hacks.mozilla.org/2014/08/building-the-firefox-browser-for-firefox-os/',
  'http://ifeng.com',
  'http://imdb.com',
  'http://livejournal.com',
  'http://mediafire.com',
  'http://microsoft.com',
  'http://msn.com',
  'http://netflix.com',
  'http://news.google.com/',
  'http://nytimes.com',
  'http://sogou.com',
  'http://soso.com',
  'http://techcrunch.com/',
  'http://themeforest.net/',
  'http://thepiratebay.org',
  'http://uol.com.br',
  'http://us.gameforge.com/home/index',
  'http://vkontakte.ru',
  'http://weather.com',
  'http://web.de/',
  'http://wikipedia.org',
  'http://wordpress.org',
  'http://www.aliexpress.com/',
  'http://www.amazon.com/',
  'http://www.baidu.com/',
  'http://www.bbc.co.uk/',
  'http://www.booking.com/',
  'http://www.businessweek.com/articles/2014-08-08/the-12-day-toll-of-mcdonalds-china-meat-scare-asia-sales-sink-7-percent',
  'http://www.buzzfeed.com/',
  'http://www.clubic.com/',
  'http://www.cnet.com/',
  'http://www.deviantart.com/',
  'http://www.ebay.com/',
  'http://www.fifa.com/',
  'http://www.fnac.com/',
  'http://www.forbes.com/home_usa/',
  'http://www.goodreads.com/',
  'http://www.ign.com/',
  'http://www.imdb.com/',
  'http://www.informationweek.com/software/social/facebook-malware-protect-your-profile/d/d-id/1297890',
  'http://www.kompas.com/',
  'http://www.lequipe.fr/',
  'http://www.meetup.com/',
  'http://www.myntra.com/',
  'http://www.nasa.gov/',
  'http://www.nytimes.com/',
  'http://www.reddit.com/',
  'http://www.slate.com/',
  'http://www.tripadvisor.fr/',
  'http://www.usatoday.com/story/weather/2014/08/08/iselle-julio-hawaii-storms/13763705/',
  'http://www.washingtonpost.com/news/to-your-health/wp/2014/08/08/four-new-ebola-cases-in-nigeria-all-related-to-american-to-who-brought-virus-there/',
  'http://www.yelp.com/mountain-view-ca-us',
  'http://yandex.ru',
  'http://youtube.com',
  'http://zedo.com',
  'http://en.wikipedia.org/wiki/Brean_Down',
  'http://en.wikipedia.org/wiki/List_of_female_Nobel_laureates',
  'http://stackoverflow.com/',
  'http://www.groupon.com/browse/san-jose',
  'https://www.tumblr.com/search/cat',
];

function getPageSizes(url, stats, cb) {
  metrics.use({
    counter: function(e, val) {
      if (e === 'egress.transfer') {
        stats.egressBytes += val;
      } else if (e === 'ingress.transfer') {
        stats.ingressBytes += val;
      } else if (e === 'proxy.request') {
        stats.requestCount++;
      }
    }
  });

  client.goUrl(url, function() {
    metrics.clients = [];
    cb();
  });
}

function testSizes(url, done) {
  var stats = { ingressBytes: 0, egressBytes: 0, requestCount: 0 };

  function pageLoaded() {
    var totalSizeIngress = Math.round(util.byteToKb(stats.ingressBytes));
    var totalSizeEgress = Math.round(util.byteToKb(stats.egressBytes));

    console.log('[%s] page size %s vs %s: %sKB/%sKB (%d%), %d requests', url,
                'ingress'.green,
                'egress'.blue, totalSizeIngress.toString().green,
                totalSizeEgress.toString().blue,
                helper.getPercentage(totalSizeIngress, totalSizeEgress),
                stats.requestCount);

    totalSizeEgress.should.be.at.most(totalSizeIngress);

    done();
  }

  getPageSizes(url, stats, pageLoaded);
}

module.exports = {
  before: function(done) {
    this.timeout(25000);
    helper.loadProxy();
    helper.launchFirefox();
    driver.connect(function() {
      client = new Marionette.Client(driver);
      client.startSession(function() {
        done();
      });
    });
  },

  after: function() {
    helper.cleanAll();
  },
};

websites.forEach(function(url) {
  module.exports[url] = function(done) {
    // Set high timeout, with network simulation page loads can be very slow...
    this.timeout(180000);
    testSizes(url, done);
  };
});
