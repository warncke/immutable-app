'use strict'

/* native modules */
const util = require('util')

/* npm modules */
const Promise = require('bluebird')
const _ = require('lodash')
const debug = require('debug')('immutable-app')
const express = require('express')
const http = require('http')

/* application modules */
const init = require('./init')

/* exports */
const ImmutableApp = {
    config: config,
    reset: reset,
    start: start,
    stop: stop,
}

module.exports = ImmutableApp

/* global variables */

// set bluebird as the global Promise provider
global.Promise = Promise

// default configuration
const defaultConfig = {
    // absolute path of base directory
    base: getBase(),
    // directories for app assets - if dir is missing any funcitonality
    // depending on directory will not be loaded - defaults for all are
    // the app base path with the dir name (e.g. assets, app) appended
    dir: {
        assets: [],
        app: [],
        helpers: [],
        layouts: [],
        partials: [],
        views: [],
    },
    // exit on listen errors
    exit: true,
    // express app
    express: undefined,
    // handlebars config options - not including dirs
    handlebars: {
        defaultLayout: 'main',
        extname: 'hbs',
        helpers: {},
    },
    // custom insepct function
    inspect: inspect,
    // use tls (https)
    https: false,
    // enable logging
    log: true,
    // app name
    name: 'immutable-app',
    // port to listen on
    port: 7777,
    // http server
    server: undefined,
    // set to true when server started
    started: false,
    // list of express middleware to use
    use: []
}

// get reference to global singleton instance
var config
// initialize global singleton instance if not yet defined
if (!global.__immutable_app__) {
    reset()
}
// use existing singleton instance
else {
    config = global.__immutable_app__
}

/* public functions */

/**
 * @function config
 *
 * get/set configuration variables - merges args over config
 *
 * @param {object} args
 *
 * @returns {object}
 */
function config (args) {
    // merge args over config with custom handler to merge arrays
    _.mergeWith(config, args, (a, b) => _.isArray(a) ? a.concat(b) : undefined)
    // return config
    return config
}

/**
 * @function start
 *
 * start app
 *
 * @returns {Promise}
 */
async function start () {
    // initialize express app 
    init(config, defaultConfig)
    // create new promise that will be resolved when server started
    return new Promise(function (resolve, reject) {
        // create HTTP server
        config.server = http.createServer(config.express)
        // create error handler
        config.server.on('error', function (err) {
            // only deal with listen errors
            if (error.syscall !== 'listen') {
                throw error
            }
            // log error if logging enable
            if (config.log) {
                // error msg detail
                var msg
                // get specific errors
                if (err.code === 'EACCES') {
                    msg = 'permission denied'
                }
                else if (err.code === 'EADDRINUSE') {
                    msg = 'address in use'
                }
                else {
                    msg = err.code
                }
                // log error
                console.error('listen on port '+config.port+' failed '+msg)
            }
            // if exit on error is set then exit
            if (config.exit) {
                process.exit(1)
            }
            // reject promise with error
            reject(err)
        })
        // listen on provided port, on all network interfaces.
        config.server.listen(config.port, function () {
            // log start if logging enabled
            if (config.log) {
                console.log(config.name+' listening on port '+config.port)
            }
            // set started to true
            config.started = true
            // resolve promise
            resolve()
        })
    })
}

/**
 * @function stop
 *
 * stop app
 *
 * @returns {Promise}
 */
async function stop () {
    return new Promise(function (resolve, reject) {
        // if not server then resolve
        if (!config || !config.server || !config.started) {
            resolve()
        }
        // close server
        config.server.close(function (err) {
            if (err) {
                reject(err)
            }
            else {
                resolve()
            }
        })
    })
}

/**
 * @function reset
 *
 * shutdown server if running and reset global singleton data
 *
 * @returns {Promise}
 */
async function reset () {
    // catch async errors
    try {
        if (config && config.server && config.started) {
            await stop()
        }
        // create global app instance with defaults set
        config = global.__immutable_app__ = _.cloneDeep(defaultConfig)
        // create new express app
        config.express = express()
    }
    catch (err) {
        throw err
    }
}

/* private functions */

/**
 * @function getBase
 *
 * return asbsolute path of script that initially required immutable-app
 *
 * @returns {string}
 */
function getBase () {
    // get file name of file that did the require
    var path = module.parent.filename
    // remove file name from path
    return path.replace(/\/[^/]+$/, '')
}

/**
 * @function inspect
 *
 * generate output for util.inspect used by node.js console.log
 *
 *
 * @param {integer} depth
 * @param {object} options
 *
 * @returns {string}
 */
function inspect (depth, options) {
    var obj = _.omit(this, ['express', 'inspect', 'server'])
    return util.inspect(obj)
}