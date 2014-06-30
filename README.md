# Janus - SPDY Privacy Proxy
[![Build Status](https://travis-ci.org/mozilla/node-janus.svg?branch=develop)](https://travis-ci.org/mozilla/node-janus)

## Requirements
* Node.js v10.0

## Installation
Janus is not published on NPM, so you need to get the code first.

    git clone https://github.com/mozilla/node-janus

Next, use NPM to install all the dependencies.

    cd node-janus  
    npm install

## Configuration and Usage
### Janus
You can find the default Janus configuration in `config/default.yml`.
All settings are exposed and documented there.

You may edit the settings directly in the default configuration file or
preferably override some of settings using a custom configuration file,
see the [node-config documentation](https://lorenwest.github.io/node-config/latest/)
for more details about the configuration system.

To start the proxy, just run

    ./janus


The only command-line arguments supported are `-h` for help and `-v` for
showing the version.

### Firefox
You need [Firefox Nightly](http://nightly.mozilla.org) for SPDY proxy support.
When using self-signed certificates, you need to add it to Firefox first. To do
this, use Firefox to call the proxy via its host-port combination.

    https://<proxy-host>:<proxy-port>/

This should prompt you to add an exception for the self-signed certificate.

#### Desktop
Now, you can configure the secure proxy in `Preferences/Advanced/Network/Settings`.
Select `Automatic proxy configuration URL` and set it to your custom PAC file or
use the default configuration served by Janus.

    http://<janus-host>:<pac-server-port>

This will serve a suitable PAC file with the proper host and ports set.

#### Android
For Fennec the steps are similar. Open `about:config` and set
`network.proxy.autoconfig_url` to the location of your PAC file or the Janus
PAC server.
To load the PAC file and activate the proxy, set `network.proxy.type` to `2`.
