# Gonzales - SPDY Privacy Proxy
[![Build Status](https://travis-ci.org/eamsen/node-gonzales.svg?branch=develop)](https://travis-ci.org/eamsen/node-gonzales)

## Requirements
* Node.js v10.0

## Installation
Gonzales is not published on NPM, so you need to get the code first.

    git clone https://github.com/eamsen/node-gonzales  

Next, use NPM to install all the dependencies.

    cd node-gonzales  
    npm install

## Configuration and Usage
### Gonzales
You can find the default Gonzales configuration in `config/default.yml`.
All settings are exposed and documented there.

You may edit the settings there directly or override some of them with a custom
config file, see the [node-config documentation](https://lorenwest.github.io/node-config/latest/)
for more details about how the configuration works.

To start the proxy, just run

    ./gonzales


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
use the default configuration served by Gonzales.

    http://<gonzales-host>:<pac-server-port>

This will serve a suitable PAC file with the proper host and ports set.

#### Android
For Fennec the steps are similar. Open `about:config` and set
`network.proxy.autoconfig_url` to the location of your PAC file or the Gonzales
PAC server.
To load the PAC file and activate the proxy, set `network.proxy.type` to `2`.
